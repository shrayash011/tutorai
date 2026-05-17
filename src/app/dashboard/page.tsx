'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase';
import { SubjectCard } from '@/components/dashboard/SubjectCard';
import type { User, StudentProfile, DailyUsage, ChatSession } from '@/types';

// ── Helpers ────────────────────────────────────────────────

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function firstName(name: string | null | undefined) {
  return name?.split(' ')[0] ?? 'there';
}

// ── Sub-components ─────────────────────────────────────────

function StatCard({
  label,
  value,
  cap,
  color,
}: {
  label: string;
  value: number;
  cap?: number | null;
  color: string;
}) {
  return (
    <div className="bg-[#141416] border border-[#2A2A30] rounded-xl p-3 flex flex-col gap-1">
      <span className="font-bold text-2xl leading-none" style={{ color }}>
        {value}
        {cap != null && (
          <span className="text-sm font-normal text-[#888890]">/{cap}</span>
        )}
      </span>
      <span className="text-[11px] text-[#888890] leading-tight">{label}</span>
    </div>
  );
}

function BottomNav({ active }: { active: 'dashboard' | 'practice' | 'progress' | 'settings' }) {
  const router = useRouter();
  const items = [
    { id: 'dashboard', label: 'Home', icon: '⊞', path: '/dashboard' },
    { id: 'practice', label: 'Practice', icon: '✏️', path: '/practice' },
    { id: 'progress', label: 'Progress', icon: '📈', path: '/progress' },
    { id: 'settings', label: 'Settings', icon: '⚙️', path: '/settings' },
  ] as const;

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
    <div className="min-h-screen bg-[#0D0D0F] px-4 pt-6 pb-28">
      <div className="max-w-lg mx-auto space-y-6 animate-pulse">
        <div>
          <div className="h-7 w-52 bg-[#1A1A1E] rounded-lg mb-2" />
          <div className="h-4 w-36 bg-[#1A1A1E] rounded" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map(i => <div key={i} className="h-20 bg-[#1A1A1E] rounded-xl" />)}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-24 bg-[#1A1A1E] rounded-xl" />)}
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [usage, setUsage] = useState<DailyUsage | null>(null);
  const [sessionCounts, setSessionCounts] = useState<Record<string, number>>({});
  const [startingSubject, setStartingSubject] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
        supabase.from('daily_usage').select('*').eq('user_id', authUser.id).eq('usage_date', today).single(),
      ]);

      const primaryProfile = profiles?.[0] ?? null;
      setUser(dbUser as User);
      setProfile(primaryProfile as StudentProfile | null);
      setUsage(usageRow as DailyUsage | null);

      // Count sessions per subject for the profile
      if (primaryProfile) {
        const { data: sessions } = await supabase
          .from('chat_sessions')
          .select('subject')
          .eq('student_profile_id', primaryProfile.id);

        const counts: Record<string, number> = {};
        for (const s of (sessions as Pick<ChatSession, 'subject'>[] | null) ?? []) {
          counts[s.subject] = (counts[s.subject] ?? 0) + 1;
        }
        setSessionCounts(counts);
      }

      setLoading(false);
    }

    load();
  }, [router]);

  const startChat = useCallback(async (subject: string) => {
    if (!profile || startingSubject) return;
    setStartingSubject(subject);

    const supabase = createBrowserClient();
    const { data: session, error } = await supabase
      .from('chat_sessions')
      .insert({ student_profile_id: profile.id, subject, title: `${subject} Chat` })
      .select()
      .single();

    if (!error && session) {
      router.push(`/chat/${session.id}`);
    } else {
      setStartingSubject(null);
    }
  }, [profile, startingSubject, router]);

  if (loading) return <Skeleton />;

  const messagesUsed = usage?.ai_messages_count ?? 0;
  const practiceUsed = usage?.practice_questions_count ?? 0;
  const isPaid = user?.plan !== 'free';
  const usagePct = Math.min((messagesUsed / 10) * 100, 100);

  return (
    <div className="min-h-screen bg-[#0D0D0F]">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-[#0D0D0F]/90 backdrop-blur border-b border-[#2A2A30] px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <span className="text-[#F5A623] font-bold text-lg tracking-tight">TutorAI</span>
          <button
            onClick={() => router.push('/settings')}
            className="w-8 h-8 rounded-full bg-[#1A1A1E] border border-[#2A2A30] flex items-center justify-center text-sm font-bold text-[#F0EDE8] hover:border-[#F5A623]/40 transition-colors"
          >
            {firstName(user?.full_name)[0]?.toUpperCase() ?? '?'}
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pt-6 pb-28">
        {/* Greeting */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#F0EDE8]">
            {greeting()}, {firstName(profile?.name ?? user?.full_name)}!
          </h1>
          {profile ? (
            <p className="text-sm text-[#888890] mt-1">
              Grade {profile.grade} · {profile.curriculum}
            </p>
          ) : (
            <p className="text-sm text-[#888890] mt-1">Complete your profile to get started</p>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <StatCard
            label="Questions today"
            value={messagesUsed}
            cap={isPaid ? null : 10}
            color="#F5A623"
          />
          <StatCard label="Practice done" value={practiceUsed} color="#14B8A6" />
          <StatCard label="Subjects" value={profile?.subjects?.length ?? 0} color="#8B5CF6" />
        </div>

        {/* Subjects grid */}
        {profile && profile.subjects.length > 0 ? (
          <>
            <h2 className="text-sm font-semibold text-[#888890] uppercase tracking-wider mb-3">
              Your subjects
            </h2>
            <div className="grid grid-cols-2 gap-3 mb-6">
              {profile.subjects.map(subject => (
                <SubjectCard
                  key={subject}
                  subject={subject}
                  sessionCount={sessionCounts[subject] ?? 0}
                  loading={startingSubject === subject}
                  onClick={() => startChat(subject)}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="bg-[#141416] border border-[#2A2A30] rounded-xl p-6 text-center mb-6">
            <p className="text-[#888890] text-sm mb-4">
              Set up your profile to see your subjects
            </p>
            <button
              onClick={() => router.push('/onboarding')}
              className="bg-[#F5A623] text-black font-semibold px-5 py-2.5 rounded-xl text-sm hover:bg-[#F5A623]/90 transition-colors"
            >
              Complete setup
            </button>
          </div>
        )}

        {/* Free-tier usage bar */}
        {!isPaid && (
          <div className="bg-[#141416] border border-[#2A2A30] rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-[#F0EDE8]">Daily questions</span>
              <span className="text-sm text-[#888890] tabular-nums">{messagesUsed}/10</span>
            </div>
            <div className="h-2 bg-[#2A2A30] rounded-full overflow-hidden mb-2">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${usagePct}%`,
                  backgroundColor: messagesUsed >= 8 ? '#F43F5E' : '#F5A623',
                }}
              />
            </div>
            {messagesUsed >= 8 ? (
              <p className="text-xs text-[#F43F5E]">
                Almost out!{' '}
                <button
                  onClick={() => router.push('/settings?tab=billing')}
                  className="underline hover:text-[#F43F5E]/80"
                >
                  Upgrade for unlimited
                </button>
              </p>
            ) : (
              <p className="text-xs text-[#888890]">
                {10 - messagesUsed} question{10 - messagesUsed !== 1 ? 's' : ''} remaining today
              </p>
            )}
          </div>
        )}
      </main>

      <BottomNav active="dashboard" />
    </div>
  );
}
