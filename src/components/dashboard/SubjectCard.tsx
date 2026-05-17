'use client';

const ICONS: Record<string, string> = {
  Mathematics: '📐', Math: '📐', Maths: '📐',
  Science: '🔬', Physics: '⚛️', Chemistry: '🧪', Biology: '🧬',
  English: '📖', Nepali: '🏔️', Hindi: '📜', Bengali: '🌿',
  'Social Studies': '🌍', History: '🏛️', Geography: '🗺️',
  Computer: '💻', Economics: '📊', Accounting: '🧮',
  'Optional Math': '∑',
};

const COLORS: Record<string, string> = {
  Mathematics: '#F5A623', Math: '#F5A623', Maths: '#F5A623',
  Science: '#14B8A6', Biology: '#14B8A6',
  Physics: '#8B5CF6', Chemistry: '#8B5CF6',
  English: '#3B82F6',
  Nepali: '#EF4444', Hindi: '#F97316', Bengali: '#10B981',
  'Social Studies': '#10B981', History: '#A78BFA', Geography: '#06B6D4',
  Computer: '#06B6D4', Economics: '#F59E0B', Accounting: '#F59E0B',
};

interface SubjectCardProps {
  subject: string;
  sessionCount?: number;
  onClick: () => void;
  loading?: boolean;
}

export function SubjectCard({ subject, sessionCount = 0, onClick, loading = false }: SubjectCardProps) {
  const icon = ICONS[subject] ?? '📚';
  const color = COLORS[subject] ?? '#F5A623';

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="group w-full text-left bg-[#141416] hover:bg-[#1A1A1E] border border-[#2A2A30] hover:border-[#3A3A40] rounded-xl p-4 transition-all active:scale-[0.97] disabled:opacity-60"
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
          style={{ backgroundColor: `${color}18` }}
        >
          {icon}
        </div>
        <svg
          className="w-4 h-4 text-[#2A2A30] group-hover:text-[#F5A623] transition-colors mt-1 shrink-0"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
      <p className="font-semibold text-[#F0EDE8] text-sm leading-tight mb-0.5">{subject}</p>
      <p className="text-xs text-[#888890]">
        {sessionCount > 0
          ? `${sessionCount} session${sessionCount !== 1 ? 's' : ''}`
          : 'Start learning'}
      </p>
    </button>
  );
}
