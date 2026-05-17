import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { cookies } from 'next/headers';
import { createServerClient, requireServerUser } from '@/lib/supabase';
import { buildSystemPrompt } from '@/lib/prompts';
import type { StudentProfile } from '@/types';

const FREE_DAILY_LIMIT = 10;
const PAYWALL_WARNING_AT = 8;
const HISTORY_LIMIT = 10;
const MODEL = 'claude-sonnet-4-20250514';

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

function extractBase64Image(raw: string): { data: string; mediaType: ImageMediaType } {
  // Accept either a data URL ("data:image/png;base64,...") or raw base64 (assumed JPEG)
  const input = raw.startsWith('data:') ? raw : `data:image/jpeg;base64,${raw}`;
  const match = input.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,([A-Za-z0-9+/=\n]+)$/);
  if (!match) {
    throw new Error('Unsupported image format. Use JPEG, PNG, GIF, or WebP.');
  }
  return { mediaType: match[1] as ImageMediaType, data: match[2].replace(/\n/g, '') };
}

export async function POST(req: NextRequest) {
  try {
    // ── 1. Parse + validate body ───────────────────────────
    const body = await req.json().catch(() => null);
    if (!body) {
      return Response.json({ data: null, error: 'Invalid JSON body' }, { status: 400 });
    }

    const { message, sessionId, studentProfileId, imageBase64 } = body as {
      message?: string;
      sessionId?: string;
      studentProfileId?: string;
      imageBase64?: string;
    };

    if (!message?.trim()) {
      return Response.json({ data: null, error: 'message is required' }, { status: 400 });
    }
    if (!sessionId) {
      return Response.json({ data: null, error: 'sessionId is required' }, { status: 400 });
    }
    if (!studentProfileId) {
      return Response.json({ data: null, error: 'studentProfileId is required' }, { status: 400 });
    }

    // ── 2. Auth — throws a 401 Response if unauthenticated ──
    const authUser = await requireServerUser();
    const supabase = createServerClient(await cookies());

    // ── 3. Load user plan + today's usage in parallel ───────
    const today = new Date().toISOString().split('T')[0];

    const [{ data: dbUser, error: userError }, { data: usageRow }] = await Promise.all([
      supabase.from('users').select('plan').eq('id', authUser.id).single(),
      supabase
        .from('daily_usage')
        .select('ai_messages_count')
        .eq('user_id', authUser.id)
        .eq('usage_date', today)
        .single(),
    ]);

    if (userError || !dbUser) {
      return Response.json({ data: null, error: 'User not found' }, { status: 404 });
    }

    // ── 4. Free-tier daily limit check ──────────────────────
    const isPaid = dbUser.plan !== 'free';
    const usedToday = usageRow?.ai_messages_count ?? 0;

    if (!isPaid && usedToday >= FREE_DAILY_LIMIT) {
      return Response.json(
        {
          data: null,
          error: 'limit_reached',
          message: "You've used your 10 free questions today! Upgrade to continue.",
        },
        { status: 429 },
      );
    }

    // ── 5. Verify profile + session ownership in parallel ───
    // RLS enforces this too, but explicit checks give 404 instead of cryptic 500.
    const [
      { data: profile, error: profileError },
      { data: chatSession, error: sessionError },
    ] = await Promise.all([
      supabase
        .from('student_profiles')
        .select('*')
        .eq('id', studentProfileId)
        .eq('user_id', authUser.id)
        .single(),
      supabase
        .from('chat_sessions')
        .select('id')
        .eq('id', sessionId)
        .eq('student_profile_id', studentProfileId)
        .single(),
    ]);

    if (profileError || !profile) {
      return Response.json({ data: null, error: 'Student profile not found' }, { status: 404 });
    }
    if (sessionError || !chatSession) {
      return Response.json({ data: null, error: 'Chat session not found' }, { status: 404 });
    }

    // ── 6. Fetch last N messages for context window ─────────
    const { data: historyRows, error: historyError } = await supabase
      .from('messages')
      .select('role, content')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT);

    if (historyError) {
      return Response.json({ data: null, error: 'Failed to load chat history' }, { status: 500 });
    }

    // Reverse DESC fetch back to chronological order
    const history = (historyRows ?? []).reverse();

    // ── 7. Build Anthropic messages ─────────────────────────
    type ContentBlock = Anthropic.TextBlockParam | Anthropic.ImageBlockParam;

    const userContent: ContentBlock[] = [];

    // Vision: prepend image block if provided
    if (imageBase64) {
      let parsed: { data: string; mediaType: ImageMediaType };
      try {
        parsed = extractBase64Image(imageBase64);
      } catch {
        return Response.json(
          { data: null, error: 'Invalid image. Use JPEG, PNG, GIF, or WebP.' },
          { status: 400 },
        );
      }
      userContent.push({
        type: 'image',
        source: { type: 'base64', media_type: parsed.mediaType, data: parsed.data },
      });
    }

    userContent.push({ type: 'text', text: message.trim() });

    const anthropicMessages: Anthropic.MessageParam[] = [
      // Prior conversation turns (text only; images aren't stored as base64)
      ...history.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content as string,
      })),
      { role: 'user' as const, content: userContent },
    ];

    // ── 8. Call Claude ──────────────────────────────────────
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY');

    const anthropic = new Anthropic({ apiKey });

    const aiResponse = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: buildSystemPrompt(profile as StudentProfile),
      messages: anthropicMessages,
    });

    const firstBlock = aiResponse.content[0];
    if (!firstBlock || firstBlock.type !== 'text') {
      throw new Error('Unexpected response type from Claude API');
    }
    const assistantText = firstBlock.text;
    const tokensUsed = aiResponse.usage.input_tokens + aiResponse.usage.output_tokens;

    // ── 9. Save user message ────────────────────────────────
    const { data: userMsg, error: userMsgErr } = await supabase
      .from('messages')
      .insert({
        session_id: sessionId,
        role: 'user',
        content: message.trim(),
        has_image: !!imageBase64,
        // Base64 is not persisted in Postgres; use /api/upload/image for a stored URL
        image_url: null,
      })
      .select()
      .single();

    if (userMsgErr || !userMsg) {
      return Response.json({ data: null, error: 'Failed to save message' }, { status: 500 });
    }

    // ── 10. Save assistant message ──────────────────────────
    // The DB trigger trg_track_daily_ai_usage fires here and atomically
    // increments daily_usage.ai_messages_count for this user.
    const { data: assistantMsg, error: assistantMsgErr } = await supabase
      .from('messages')
      .insert({
        session_id: sessionId,
        role: 'assistant',
        content: assistantText,
        has_image: false,
        tokens_used: tokensUsed,
      })
      .select()
      .single();

    if (assistantMsgErr || !assistantMsg) {
      return Response.json({ data: null, error: 'Failed to save assistant response' }, { status: 500 });
    }

    // ── 11. Respond ─────────────────────────────────────────
    return Response.json({
      data: {
        message: assistantMsg,
        tokens_used: tokensUsed,
        // Let the frontend decide whether to show the paywall warning modal
        messages_used: usedToday + 1,
        show_paywall_warning: !isPaid && usedToday + 1 >= PAYWALL_WARNING_AT,
      },
      error: null,
    });
  } catch (err) {
    // Re-throw the typed Response from requireServerUser (401)
    if (err instanceof Response) return err;
    console.error('[POST /api/chat/send]', err);
    return Response.json({ data: null, error: 'Internal server error' }, { status: 500 });
  }
}
