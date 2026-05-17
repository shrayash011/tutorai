'use client';

import { useState } from 'react';

interface Plan {
  id: 'student' | 'family';
  name: string;
  price: string;
  period: string;
  tagline: string;
  features: string[];
  popular: boolean;
  accentColor: string;
  buttonClass: string;
}

const PLANS: Plan[] = [
  {
    id: 'student',
    name: 'Student',
    price: '$5',
    period: '/month',
    tagline: 'Perfect for one student',
    popular: true,
    accentColor: '#F5A623',
    buttonClass: 'bg-[#F5A623] text-black hover:bg-[#F5A623]/90',
    features: [
      'Unlimited AI questions every day',
      'Unlimited practice questions',
      'All subjects & curricula',
      'Photo upload for textbook questions',
      'Progress tracking & weak topic reports',
    ],
  },
  {
    id: 'family',
    name: 'Family',
    price: '$12',
    period: '/month',
    tagline: 'Up to 3 student profiles',
    popular: false,
    accentColor: '#8B5CF6',
    buttonClass: 'bg-[#8B5CF6] text-white hover:bg-[#8B5CF6]/90',
    features: [
      'Everything in Student',
      '3 individual student profiles',
      'Parent overview dashboard',
      'Compare progress across children',
      'Priority support',
    ],
  },
];

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPlan?: string;
}

export function PricingModal({ isOpen, onClose, currentPlan }: PricingModalProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function subscribe(planId: 'student' | 'family') {
    if (loading) return;
    setLoading(planId);
    setError(null);
    try {
      const res = await fetch('/api/billing/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId }),
      });
      const json = await res.json() as { data?: { url: string }; error?: string };
      if (!res.ok || json.error || !json.data?.url) {
        setError(json.error ?? 'Something went wrong. Please try again.');
        return;
      }
      window.location.href = json.data.url;
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-md bg-[#141416] border border-[#2A2A30] rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="shrink-0 px-6 pt-6 pb-4 border-b border-[#2A2A30]">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-7 h-7 rounded-lg flex items-center justify-center text-[#888890] hover:text-[#F0EDE8] hover:bg-[#2A2A30] transition-colors text-xl leading-none"
          >
            ×
          </button>
          <h2 className="text-xl font-bold text-[#F0EDE8]">Upgrade TutorAI</h2>
          <p className="text-sm text-[#888890] mt-0.5">
            Unlimited learning for South Asian students
          </p>
        </div>

        {/* Plans */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {error && (
            <div className="bg-[#F43F5E]/10 border border-[#F43F5E]/30 text-[#F43F5E] text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          {PLANS.map(plan => {
            const isCurrent = currentPlan === plan.id;
            const isLoading = loading === plan.id;

            return (
              <div
                key={plan.id}
                className={`relative border rounded-xl p-4 transition-colors ${
                  plan.popular
                    ? 'border-[#F5A623]/40 bg-[#F5A623]/5'
                    : 'border-[#2A2A30] bg-[#1A1A1E]'
                }`}
              >
                {plan.popular && (
                  <span className="absolute -top-2.5 left-4 bg-[#F5A623] text-black text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                    Most popular
                  </span>
                )}

                {/* Plan header */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-[#F0EDE8] leading-tight">{plan.name}</h3>
                    <p className="text-xs text-[#888890] mt-0.5">{plan.tagline}</p>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <span className="text-2xl font-bold" style={{ color: plan.accentColor }}>
                      {plan.price}
                    </span>
                    <span className="text-xs text-[#888890]">{plan.period}</span>
                  </div>
                </div>

                {/* Features */}
                <ul className="space-y-1.5 mb-4">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-xs text-[#888890]">
                      <span className="text-[#14B8A6] shrink-0 mt-0.5">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <button
                  onClick={() => subscribe(plan.id)}
                  disabled={!!loading || isCurrent}
                  className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50 ${
                    isCurrent
                      ? 'bg-[#2A2A30] text-[#888890] cursor-default'
                      : plan.buttonClass
                  }`}
                >
                  {isCurrent
                    ? 'Current plan'
                    : isLoading
                      ? 'Redirecting to checkout…'
                      : `Upgrade to ${plan.name}`}
                </button>
              </div>
            );
          })}

          {/* School plan link */}
          <div className="bg-[#1A1A1E] border border-[#2A2A30] rounded-xl px-4 py-3 text-center">
            <p className="text-xs text-[#888890]">
              School or institution?{' '}
              <a
                href="mailto:schools@tutorai.app"
                className="text-[#F5A623] hover:underline"
              >
                Contact us — School plan is $299/month
              </a>
            </p>
          </div>

          <p className="text-center text-[10px] text-[#888890]/60 pb-1">
            Cancel anytime · Secure payment via Stripe · No hidden fees
          </p>
        </div>
      </div>
    </div>
  );
}
