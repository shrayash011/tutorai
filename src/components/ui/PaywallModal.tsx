'use client';

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  isHardBlock?: boolean;
  messagesRemaining?: number;
}

export function PaywallModal({
  isOpen,
  onClose,
  isHardBlock = false,
  messagesRemaining = 2,
}: PaywallModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={isHardBlock ? undefined : onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-sm bg-[#141416] border border-[#2A2A30] rounded-2xl p-6 shadow-2xl">
        {/* Close button — only for soft warning */}
        {!isHardBlock && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-7 h-7 rounded-lg flex items-center justify-center text-[#888890] hover:text-[#F0EDE8] hover:bg-[#2A2A30] transition-colors text-lg leading-none"
          >
            ×
          </button>
        )}

        <div className="text-center">
          {/* Icon */}
          <div className="w-14 h-14 rounded-2xl bg-[#F5A623]/10 border border-[#F5A623]/20 flex items-center justify-center mx-auto mb-4 text-2xl">
            {isHardBlock ? '🔒' : '⚡'}
          </div>

          <h2 className="text-xl font-bold text-[#F0EDE8] mb-2">
            {isHardBlock ? 'Daily limit reached' : 'Running low!'}
          </h2>
          <p className="text-[#888890] text-sm mb-5 leading-relaxed">
            {isHardBlock
              ? "You've used all 10 free questions today. Come back tomorrow or upgrade for unlimited access."
              : `Only ${messagesRemaining} free question${messagesRemaining !== 1 ? 's' : ''} left today. Upgrade to keep learning without interruption.`}
          </p>

          {/* Plan card */}
          <div className="bg-[#1A1A1E] border border-[#2A2A30] rounded-xl p-4 mb-5 text-left">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[#F0EDE8] font-semibold text-sm">Student Plan</span>
              <span className="text-[#F5A623] font-bold">$5/mo</span>
            </div>
            <ul className="space-y-1.5 text-xs text-[#888890]">
              {[
                'Unlimited AI questions every day',
                'Unlimited practice questions',
                'All subjects & curricula',
                'Photo upload to solve textbook questions',
              ].map(f => (
                <li key={f} className="flex items-center gap-2">
                  <span className="text-[#14B8A6]">✓</span> {f}
                </li>
              ))}
            </ul>
          </div>

          {/* CTA */}
          <button
            onClick={() => { window.location.href = '/settings?tab=billing'; }}
            className="w-full bg-[#F5A623] text-black font-semibold py-3 rounded-xl hover:bg-[#F5A623]/90 transition-colors text-sm mb-3"
          >
            Upgrade to Student Plan
          </button>

          {!isHardBlock && (
            <button
              onClick={onClose}
              className="w-full text-[#888890] text-xs py-2 hover:text-[#F0EDE8] transition-colors"
            >
              Keep my {messagesRemaining} question{messagesRemaining !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
