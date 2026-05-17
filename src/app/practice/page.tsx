'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase';
import type { Difficulty, PracticeQuestion, StudentProfile, User } from '@/types';

// ── Helpers ────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 90) return '#10B981';
  if (score >= 70) return '#14B8A6';
  if (score >= 50) return '#F59E0B';
  return '#F43F5E';
}

function scoreLabel(score: number) {
  if (score >= 90) return 'Excellent!';
  if (score >= 70) return 'Good job!';
  if (score >= 50) return 'Getting there';
  return 'Keep practising';
}

// ── Sub-components ─────────────────────────────────────────

function BottomNav({ active }: { active: string }) {
  const router = useRouter();
  const items = [
    { id: 'dashboard', label: 'Home',     icon: '⊞', path: '/dashboard' },
    { id: 'practice',  label: 'Practice', icon: '✏️', path: '/practice' },
    { id: 'progress',  label: 'Progress', icon: '📈', path: '/progress' },
    { id: 'settings',  label: 'Settings', icon: '⚙️', path: '/settings' },
  ];
  return (
    <nav className="fixed bottom-0 inset-x-0 bg-[#0D0D0F] border-t border-[#2A2A30] flex z-20">
      {items.map(item => (
        <button
          key={item.id}
          onClick={() => router.push(item.path)}
          className={`flex-1 flex flex-col items-center justify-center py-3 gap-0.5 transition-colors ${
            active === item.id ? 'text-[#F5A623]' : 'text-[#888890] hover:text-[#F0EDE8]'
          }`}
        >
          <span className="text-lg leading-none">{item.icon}</span>
          <span className="text-[10px] font-medium">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

function Skeleton() {
  return (
    <div className="min-h-screen bg-[#0D0D0F] px-4 pt-6 pb-28 animate-pulse">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="h-7 w-40 bg-[#1A1A1E] rounded-lg" />
        <div className="h-40 bg-[#1A1A1E] rounded-xl" />
        <div className="h-10 bg-[#1A1A1E] rounded-xl" />
      </div>
    </div>
  );
}

function DifficultyPill({
  value,
  selected,
  onSelect,
}: {
  value: Difficulty;
  selected: boolean;
  onSelect: () => void;
}) {
  const colors: Record<Difficulty, string> = {
    easy:   selected ? 'bg-[#14B8A6]/20 text-[#14B8A6] border-[#14B8A6]/40' : 'bg-[#1A1A1E] text-[#888890] border-[#2A2A30]',
    medium: selected ? 'bg-[#F5A623]/20 text-[#F5A623] border-[#F5A623]/40' : 'bg-[#1A1A1E] text-[#888890] border-[#2A2A30]',
    hard:   selected ? 'bg-[#F43F5E]/20 text-[#F43F5E] border-[#F43F5E]/40' : 'bg-[#1A1A1E] text-[#888890] border-[#2A2A30]',
  };
  return (
    <button
      onClick={onSelect}
      className={`px-4 py-1.5 rounded-full border text-sm font-medium transition-all ${colors[value]}`}
    >
      {value.charAt(0).toUpperCase() + value.slice(1)}
    </button>
  );
}

// ── Types ──────────────────────────────────────────────────

type Step = 'setup' | 'generating' | 'question' | 'submitting' | 'feedback';

interface FeedbackResult {
  score: number;
  is_correct: boolean;
  feedback: string;
}

// ── Page ───────────────────────────────────────────────────

export default function PracticePage() {
  const router = useRouter();

  // Auth / data
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [practiceUsed, setPracticeUsed] = useState(0);
  const [recentHistory, setRecentHistory] = useState<PracticeQuestion[]>([]);

  // Form state
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');

  // Flow state
  const [step, setStep] = useState<Step>('setup');
  const [question, setQuestion] = useState<PracticeQuestion | null>(null);
  const [answer, setAnswer] = useState('');
  const [feedbackResult, setFeedbackResult] = useState<FeedbackResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const answerRef = useRef<HTMLTextAreaElement>(null);

  // ── Load on mount ──────────────────────────────────────────

  useEffect(() => {
    const supabase = createBrowserClient();

    async function load() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { router.replace('/login'); return; }

      const today = new Date().toISOString().split('T')[0];
      const [
        { data: dbUser },
        { data: profiles },
        { data: usageRow },
      ] = await Promise.all([
        supabase.from('users').select('*').eq('id', authUser.id).single(),
        supabase.from('student_profiles').select('*').eq('user_id', authUser.id).order('is_primary', { ascending: false }).limit(1),
        supabase.from('daily_usage').select('practice_questions_count').eq('user_id', authUser.id).eq('usage_date', today).single(),
      ]);

      const prim = profiles?.[0] ?? null;
      setUser(dbUser as User);
      setProfile(prim as StudentProfile | null);
      setPracticeUsed(usageRow?.practice_questions_count ?? 0);

      if (prim?.subjects?.length) setSubject(prim.subjects[0]);

      // Recent history (completed questions only)
      if (prim) {
        const { data: hist } = await supabase
          .from('practice_questions')
          .select('*')
          .eq('student_profile_id', prim.id)
          .not('ai_feedback', 'is', null)
          .order('created_at', { ascending: false })
          .limit(5);
        setRecentHistory((hist ?? []) as PracticeQuestion[]);
      }

      setLoading(false);
    }

    load();
  }, [router]);

  // ── Generate question ──────────────────────────────────────

  const generateQuestion = useCallback(async () => {
    if (!profile || !subject || !topic.trim()) {
      setError('Please fill in subject and topic.');
      return;
    }
    setError(null);
    setStep('generating');

    try {
      const res = await fetch('/api/practice/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentProfileId: profile.id, subject, topic: topic.trim(), difficulty }),
      });
      const json = await res.json() as { data?: { question: PracticeQuestion; practice_used: number }; error?: string };

      if (res.status === 429) {
        setError(json.error ?? "Daily limit reached. Upgrade for unlimited practice.");
        setStep('setup');
        return;
      }
      if (!res.ok || !json.data?.question) {
        setError(json.error ?? 'Failed to generate question. Please try again.');
        setStep('setup');
        return;
      }

      setQuestion(json.data.question);
      setPracticeUsed(json.data.practice_used);
      setAnswer('');
      setStep('question');
      setTimeout(() => answerRef.current?.focus(), 100);
    } catch {
      setError('Network error. Please try again.');
      setStep('setup');
    }
  }, [profile, subject, topic, difficulty]);

  // ── Submit answer ──────────────────────────────────────────

  const submitAnswer = useCallback(async () => {
    if (!question || !answer.trim()) return;
    setError(null);
    setStep('submitting');

    try {
      const res = await fetch('/api/practice/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: question.id, studentAnswer: answer.trim() }),
      });
      const json = await res.json() as { data?: FeedbackResult; error?: string };

      if (!res.ok || !json.data) {
        setError(json.error ?? 'Failed to evaluate answer. Please try again.');
        setStep('question');
        return;
      }

      setFeedbackResult(json.data);
      setStep('feedback');

      // Refresh history
      const supabase = createBrowserClient();
      if (profile) {
        const { data: hist } = await supabase
          .from('practice_questions')
          .select('*')
          .eq('student_profile_id', profile.id)
          .not('ai_feedback', 'is', null)
          .order('created_at', { ascending: false })
          .limit(5);
        setRecentHistory((hist ?? []) as PracticeQuestion[]);
      }
    } catch {
      setError('Network error. Please try again.');
      setStep('question');
    }
  }, [question, answer, profile]);

  const resetToSetup = useCallback(() => {
    setStep('setup');
    setQuestion(null);
    setAnswer('');
    setFeedbackResult(null);
    setError(null);
  }, []);

  // ── Render ─────────────────────────────────────────────────

  if (loading) return <Skeleton />;

  const isPaid = user?.plan !== 'free';
  const isGenerating = step === 'generating';
  const isSubmitting = step === 'submitting';

  return (
    <div className="min-h-screen bg-[#0D0D0F]">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-[#0D0D0F]/90 backdrop-blur border-b border-[#2A2A30] px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <h1 className="text-base font-bold text-[#F0EDE8]">Practice</h1>
          {!isPaid && (
            <span className="text-[11px] text-[#888890] bg-[#1A1A1E] border border-[#2A2A30] px-2.5 py-1 rounded-full">
              {practiceUsed}/5 today
            </span>
          )}
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pt-5 pb-28 space-y-4">

        {/* ── Error banner ── */}
        {error && (
          <div className="bg-[#F43F5E]/10 border border-[#F43F5E]/30 text-[#F43F5E] text-sm px-4 py-3 rounded-xl flex items-start gap-2">
            <span className="shrink-0 mt-0.5">⚠</span>
            <span>{error}</span>
          </div>
        )}

        {/* ══════════════════════════════════════════
            SETUP STEP
        ══════════════════════════════════════════ */}
        {(step === 'setup' || step === 'generating') && (
          <div className="space-y-4">
            {!profile ? (
              <div className="bg-[#141416] border border-[#2A2A30] rounded-xl p-6 text-center">
                <p className="text-[#888890] text-sm mb-4">Set up your profile first to practise.</p>
                <button
                  onClick={() => router.push('/onboarding')}
                  className="bg-[#F5A623] text-black font-semibold px-5 py-2.5 rounded-xl text-sm"
                >
                  Complete setup
                </button>
              </div>
            ) : (
              <div className="bg-[#141416] border border-[#2A2A30] rounded-xl p-5 space-y-4">
                <h2 className="text-sm font-semibold text-[#888890] uppercase tracking-wider">
                  Set up your question
                </h2>

                {/* Subject */}
                <div>
                  <label className="block text-xs font-medium text-[#888890] mb-1.5">Subject</label>
                  <select
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    disabled={isGenerating}
                    className="w-full bg-[#1A1A1E] border border-[#2A2A30] text-[#F0EDE8] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#F5A623]/50 transition-colors disabled:opacity-60"
                  >
                    <option value="" disabled>Select a subject…</option>
                    {profile.subjects.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                {/* Topic */}
                <div>
                  <label className="block text-xs font-medium text-[#888890] mb-1.5">Topic</label>
                  <input
                    type="text"
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && generateQuestion()}
                    disabled={isGenerating}
                    placeholder="e.g. Photosynthesis, Quadratic equations…"
                    className="w-full bg-[#1A1A1E] border border-[#2A2A30] text-[#F0EDE8] placeholder-[#888890] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#F5A623]/50 transition-colors disabled:opacity-60"
                  />
                </div>

                {/* Difficulty */}
                <div>
                  <label className="block text-xs font-medium text-[#888890] mb-2">Difficulty</label>
                  <div className="flex gap-2">
                    {(['easy', 'medium', 'hard'] as Difficulty[]).map(d => (
                      <DifficultyPill
                        key={d}
                        value={d}
                        selected={difficulty === d}
                        onSelect={() => setDifficulty(d)}
                      />
                    ))}
                  </div>
                </div>

                {/* CTA */}
                <button
                  onClick={generateQuestion}
                  disabled={!subject || !topic.trim() || isGenerating || (!isPaid && practiceUsed >= 5)}
                  className="w-full bg-[#F5A623] text-black font-semibold py-3 rounded-xl text-sm hover:bg-[#F5A623]/90 disabled:opacity-40 transition-all active:scale-[0.98]"
                >
                  {isGenerating ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Generating…
                    </span>
                  ) : !isPaid && practiceUsed >= 5
                    ? 'Daily limit reached — Upgrade'
                    : 'Generate Question'}
                </button>
              </div>
            )}

            {/* Recent history */}
            {recentHistory.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-[#888890] uppercase tracking-wider mb-3">
                  Recent practice
                </h2>
                <div className="space-y-2">
                  {recentHistory.map(q => (
                    <div
                      key={q.id}
                      className="bg-[#141416] border border-[#2A2A30] rounded-xl px-4 py-3 flex items-center gap-3"
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0"
                        style={{
                          backgroundColor: `${scoreColor(q.score ?? 0)}18`,
                          color: scoreColor(q.score ?? 0),
                        }}
                      >
                        {q.score ?? '–'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-[#F0EDE8] truncate">{q.topic}</p>
                        <p className="text-xs text-[#888890]">{q.subject} · {q.difficulty}</p>
                      </div>
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full shrink-0"
                        style={{
                          backgroundColor: `${q.is_correct ? '#14B8A6' : '#F43F5E'}18`,
                          color: q.is_correct ? '#14B8A6' : '#F43F5E',
                        }}
                      >
                        {q.is_correct ? '✓ Correct' : '✗ Incorrect'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════
            QUESTION STEP
        ══════════════════════════════════════════ */}
        {(step === 'question' || step === 'submitting') && question && (
          <div className="space-y-4">
            {/* Question card */}
            <div className="bg-[#141416] border border-[#2A2A30] rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <span
                  className="text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider"
                  style={{
                    backgroundColor: difficulty === 'easy' ? '#14B8A618' : difficulty === 'medium' ? '#F5A62318' : '#F43F5E18',
                    color: difficulty === 'easy' ? '#14B8A6' : difficulty === 'medium' ? '#F5A623' : '#F43F5E',
                  }}
                >
                  {difficulty}
                </span>
                <span className="text-xs text-[#888890]">{subject} · {question.topic}</span>
              </div>
              <p className="text-[#F0EDE8] text-sm leading-relaxed font-medium">
                {question.question_text}
              </p>
            </div>

            {/* Answer textarea */}
            <div>
              <label className="block text-xs font-medium text-[#888890] mb-1.5">Your answer</label>
              <textarea
                ref={answerRef}
                value={answer}
                onChange={e => setAnswer(e.target.value)}
                disabled={isSubmitting}
                placeholder="Write your answer here…"
                rows={5}
                className="w-full bg-[#141416] border border-[#2A2A30] focus:border-[#F5A623]/50 text-[#F0EDE8] placeholder-[#888890] rounded-xl px-4 py-3 text-sm outline-none resize-none transition-colors disabled:opacity-60 leading-relaxed"
              />
              <p className="text-[11px] text-[#888890] mt-1 text-right">{answer.length} chars</p>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={resetToSetup}
                disabled={isSubmitting}
                className="flex-1 py-3 rounded-xl border border-[#2A2A30] text-[#888890] text-sm font-medium hover:text-[#F0EDE8] hover:border-[#3A3A40] transition-colors disabled:opacity-40"
              >
                New question
              </button>
              <button
                onClick={submitAnswer}
                disabled={!answer.trim() || isSubmitting}
                className="flex-1 bg-[#F5A623] text-black font-semibold py-3 rounded-xl text-sm hover:bg-[#F5A623]/90 disabled:opacity-40 transition-all active:scale-[0.98]"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Evaluating…
                  </span>
                ) : 'Submit Answer'}
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            FEEDBACK STEP
        ══════════════════════════════════════════ */}
        {step === 'feedback' && feedbackResult && question && (
          <div className="space-y-4">
            {/* Score card */}
            <div className="bg-[#141416] border border-[#2A2A30] rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-[#F0EDE8]">Result</h2>
                <span
                  className="text-[10px] font-bold px-2.5 py-0.5 rounded-full"
                  style={{
                    backgroundColor: `${feedbackResult.is_correct ? '#14B8A6' : '#F43F5E'}18`,
                    color: feedbackResult.is_correct ? '#14B8A6' : '#F43F5E',
                  }}
                >
                  {feedbackResult.is_correct ? '✓ Correct' : '✗ Needs work'}
                </span>
              </div>

              {/* Score gauge */}
              <div className="flex items-end gap-4 mb-4">
                <div>
                  <span
                    className="text-5xl font-bold tabular-nums"
                    style={{ color: scoreColor(feedbackResult.score) }}
                  >
                    {feedbackResult.score}
                  </span>
                  <span className="text-lg text-[#888890] font-normal">/100</span>
                </div>
                <p className="text-sm font-medium pb-1" style={{ color: scoreColor(feedbackResult.score) }}>
                  {scoreLabel(feedbackResult.score)}
                </p>
              </div>

              {/* Progress bar */}
              <div className="h-2.5 bg-[#2A2A30] rounded-full overflow-hidden mb-4">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${feedbackResult.score}%`,
                    backgroundColor: scoreColor(feedbackResult.score),
                  }}
                />
              </div>

              {/* Feedback text */}
              <div className="bg-[#1A1A1E] rounded-xl p-4">
                <p className="text-xs font-semibold text-[#888890] uppercase tracking-wider mb-2">
                  AI Feedback
                </p>
                <p className="text-sm text-[#F0EDE8] leading-relaxed">{feedbackResult.feedback}</p>
              </div>
            </div>

            {/* Your answer recap */}
            <div className="bg-[#141416] border border-[#2A2A30] rounded-xl p-4">
              <p className="text-xs font-semibold text-[#888890] uppercase tracking-wider mb-2">
                Your answer
              </p>
              <p className="text-sm text-[#888890] leading-relaxed">{question.student_answer}</p>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={resetToSetup}
                className="flex-1 py-3 rounded-xl border border-[#2A2A30] text-[#888890] text-sm font-medium hover:text-[#F0EDE8] hover:border-[#3A3A40] transition-colors"
              >
                Change topic
              </button>
              <button
                onClick={generateQuestion}
                disabled={!isPaid && practiceUsed >= 5}
                className="flex-1 bg-[#F5A623] text-black font-semibold py-3 rounded-xl text-sm hover:bg-[#F5A623]/90 disabled:opacity-40 transition-all active:scale-[0.98]"
              >
                Try another
              </button>
            </div>

            {!isPaid && practiceUsed >= 5 && (
              <p className="text-center text-xs text-[#888890]">
                Daily limit reached.{' '}
                <button
                  onClick={() => router.push('/settings?tab=billing')}
                  className="text-[#F5A623] hover:underline"
                >
                  Upgrade for unlimited practice
                </button>
              </p>
            )}
          </div>
        )}
      </main>

      <BottomNav active="practice" />
    </div>
  );
}
