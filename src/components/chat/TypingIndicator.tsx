'use client';

export function TypingIndicator() {
  return (
    <div className="flex items-end gap-2.5 px-4 py-1">
      <div className="w-7 h-7 rounded-full bg-[#F5A623] flex items-center justify-center text-[11px] font-bold text-black shrink-0 mb-0.5">
        T
      </div>
      <div className="bg-[#1A1A1E] border border-[#2A2A30] rounded-2xl rounded-bl-sm px-4 py-3">
        <span className="inline-flex items-center gap-1.5">
          {[0, 1, 2].map(i => (
            <span
              key={i}
              className="w-2 h-2 rounded-full bg-[#888890] animate-bounce"
              style={{ animationDelay: `${i * 0.18}s`, animationDuration: '1s' }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
