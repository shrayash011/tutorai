import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, requireServerUser } from '@/lib/supabase';
import { getAnthropicClient, MODEL } from '@/lib/anthropic';
import type { PracticeQuestion, StudentProfile } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return Response.json({ data: null, error: 'Invalid JSON' }, { status: 400 });
    }

    const { questionId, studentAnswer } = body as {
      questionId?: string;
      studentAnswer?: string;
    };

    if (!questionId)           return Response.json({ data: null, error: 'questionId is required' }, { status: 400 });
    if (!studentAnswer?.trim()) return Response.json({ data: null, error: 'studentAnswer is required' }, { status: 400 });

    // ── Auth ─────────────────────────────────────────────────
    const authUser = await requireServerUser();
    const supabase = createServerClient(await cookies());

    // ── Load question ─────────────────────────────────────────
    const { data: question, error: qError } = await supabase
      .from('practice_questions')
      .select('*')
      .eq('id', questionId)
      .single();

    if (qError || !question) {
      return Response.json({ data: null, error: 'Question not found' }, { status: 404 });
    }

    const q = question as PracticeQuestion;

    // ── Verify ownership through profile ──────────────────────
    const { data: profile, error: profileError } = await supabase
      .from('student_profiles')
      .select('*')
      .eq('id', q.student_profile_id)
      .eq('user_id', authUser.id)
      .single();

    if (profileError || !profile) {
      return Response.json({ data: null, error: 'Unauthorized' }, { status: 403 });
    }

    // ── Evaluate via Claude ───────────────────────────────────
    const p = profile as StudentProfile;
    const anthropic = getAnthropicClient();

    const aiResponse = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 512,
      system:
        'You are TutorAI evaluating student answers. Be warm, encouraging, and specific. ' +
        'Respond with ONLY valid JSON — no markdown fences, no prose.',
      messages: [
        {
          role: 'user',
          content:
            `Evaluate this Grade ${p.grade} ${p.curriculum} student's answer.\n\n` +
            `Subject: ${q.subject}\nTopic: ${q.topic}\nDifficulty: ${q.difficulty}\n\n` +
            `Question: ${q.question_text}\n\n` +
            `Student's answer: ${studentAnswer.trim()}\n\n` +
            `Scoring guide:\n` +
            `- 90–100: Excellent, shows deep understanding\n` +
            `- 70–89: Good, covers the main points with minor gaps\n` +
            `- 50–69: Partial, missing key concepts\n` +
            `- Below 50: Needs more work; guide them gently\n\n` +
            `Respond with ONLY this JSON:\n` +
            `{"score": <integer 0-100>, "is_correct": <true if score >= 70>, "feedback": "<2-3 warm, specific sentences>"}`,
        },
      ],
    });

    const raw = aiResponse.content[0];
    if (!raw || raw.type !== 'text') throw new Error('Unexpected Claude response type');

    let score: number;
    let isCorrect: boolean;
    let feedback: string;

    try {
      const parsed = JSON.parse(raw.text.trim()) as {
        score: number;
        is_correct: boolean;
        feedback: string;
      };
      score = Math.max(0, Math.min(100, Math.round(Number(parsed.score))));
      isCorrect = parsed.is_correct ?? score >= 70;
      feedback = parsed.feedback ?? '';
      if (!feedback) throw new Error('Empty feedback');
    } catch {
      // Graceful fallback when JSON parsing fails
      score = 70;
      isCorrect = true;
      feedback = raw.text.trim();
    }

    // ── Persist results on the question row ───────────────────
    await supabase
      .from('practice_questions')
      .update({ student_answer: studentAnswer.trim(), ai_feedback: feedback, score, is_correct: isCorrect })
      .eq('id', questionId);

    // ── Upsert topic_performance (read-modify-write) ──────────
    const { data: existing } = await supabase
      .from('topic_performance')
      .select('questions_attempted, questions_correct')
      .eq('student_profile_id', q.student_profile_id)
      .eq('subject', q.subject)
      .eq('topic', q.topic)
      .single();

    await supabase.from('topic_performance').upsert(
      {
        student_profile_id: q.student_profile_id,
        subject: q.subject,
        topic: q.topic,
        questions_attempted: (existing?.questions_attempted ?? 0) + 1,
        questions_correct: (existing?.questions_correct ?? 0) + (isCorrect ? 1 : 0),
        last_practiced_at: new Date().toISOString(),
      },
      { onConflict: 'student_profile_id,subject,topic' },
    );

    return Response.json({ data: { score, is_correct: isCorrect, feedback }, error: null });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error('[POST /api/practice/submit]', err);
    return Response.json({ data: null, error: 'Internal server error' }, { status: 500 });
  }
}
