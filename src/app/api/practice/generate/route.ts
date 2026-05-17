import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, requireServerUser } from '@/lib/supabase';
import { getAnthropicClient, MODEL } from '@/lib/anthropic';
import type { Difficulty, StudentProfile } from '@/types';

const FREE_PRACTICE_LIMIT = 5;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return Response.json({ data: null, error: 'Invalid JSON' }, { status: 400 });
    }

    const { studentProfileId, subject, topic, difficulty = 'medium' } = body as {
      studentProfileId?: string;
      subject?: string;
      topic?: string;
      difficulty?: Difficulty;
    };

    if (!studentProfileId) return Response.json({ data: null, error: 'studentProfileId is required' }, { status: 400 });
    if (!subject)          return Response.json({ data: null, error: 'subject is required' }, { status: 400 });
    if (!topic?.trim())    return Response.json({ data: null, error: 'topic is required' }, { status: 400 });
    if (!['easy', 'medium', 'hard'].includes(difficulty)) {
      return Response.json({ data: null, error: 'difficulty must be easy, medium, or hard' }, { status: 400 });
    }

    // ── Auth ─────────────────────────────────────────────────
    const authUser = await requireServerUser();
    const supabase = createServerClient(await cookies());

    // ── Load plan + usage + profile in parallel ───────────────
    const today = new Date().toISOString().split('T')[0];
    const [
      { data: dbUser, error: userError },
      { data: usageRow },
      { data: profile, error: profileError },
    ] = await Promise.all([
      supabase.from('users').select('plan').eq('id', authUser.id).single(),
      supabase.from('daily_usage').select('practice_questions_count').eq('user_id', authUser.id).eq('usage_date', today).single(),
      supabase.from('student_profiles').select('*').eq('id', studentProfileId).eq('user_id', authUser.id).single(),
    ]);

    if (userError || !dbUser) return Response.json({ data: null, error: 'User not found' }, { status: 404 });
    if (profileError || !profile) return Response.json({ data: null, error: 'Student profile not found' }, { status: 404 });

    // ── Free-tier practice limit ──────────────────────────────
    const isPaid = dbUser.plan !== 'free';
    const practiceUsed = usageRow?.practice_questions_count ?? 0;

    if (!isPaid && practiceUsed >= FREE_PRACTICE_LIMIT) {
      return Response.json(
        {
          data: null,
          error: 'limit_reached',
          message: "You've used your 5 free practice questions today! Upgrade for unlimited.",
        },
        { status: 429 },
      );
    }

    // ── Generate question via Claude ──────────────────────────
    const p = profile as StudentProfile;
    const anthropic = getAnthropicClient();

    const aiResponse = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 512,
      system:
        'You are TutorAI generating practice questions for students in South Asia. ' +
        'Respond with ONLY valid JSON — no markdown fences, no prose, no explanation.',
      messages: [
        {
          role: 'user',
          content:
            `Generate one ${difficulty} practice question for a Grade ${p.grade} ${p.curriculum} student.\n` +
            `Subject: ${subject}\nTopic: ${topic.trim()}\n\n` +
            `Rules:\n` +
            `- Test deep understanding, not memorisation\n` +
            `- Answerable in 2–4 sentences\n` +
            `- Use South Asian context (cricket, farming, cooking, etc.) for examples when relevant\n\n` +
            `Respond with ONLY this JSON:\n{"question": "<question text here>"}`,
        },
      ],
    });

    const raw = aiResponse.content[0];
    if (!raw || raw.type !== 'text') throw new Error('Unexpected Claude response type');

    let questionText: string;
    try {
      const parsed = JSON.parse(raw.text.trim()) as { question: string };
      if (!parsed.question) throw new Error('Empty question');
      questionText = parsed.question;
    } catch {
      // Claude occasionally wraps in prose; use the raw text as fallback
      questionText = raw.text.trim().replace(/^["']|["']$/g, '');
    }

    // ── Save to DB ────────────────────────────────────────────
    const { data: savedQuestion, error: saveError } = await supabase
      .from('practice_questions')
      .insert({
        student_profile_id: studentProfileId,
        subject,
        topic: topic.trim(),
        question_text: questionText,
        difficulty,
      })
      .select()
      .single();

    if (saveError || !savedQuestion) {
      return Response.json({ data: null, error: 'Failed to save question' }, { status: 500 });
    }

    // ── Increment daily practice count ────────────────────────
    await supabase
      .from('daily_usage')
      .upsert(
        { user_id: authUser.id, usage_date: today, practice_questions_count: practiceUsed + 1 },
        { onConflict: 'user_id,usage_date' },
      );

    return Response.json({
      data: { question: savedQuestion, practice_used: practiceUsed + 1 },
      error: null,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error('[POST /api/practice/generate]', err);
    return Response.json({ data: null, error: 'Internal server error' }, { status: 500 });
  }
}
