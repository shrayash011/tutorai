import Stripe from 'stripe';
import type { Plan } from '@/types';

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('Missing STRIPE_SECRET_KEY');
  return new Stripe(key, { apiVersion: '2026-04-22.dahlia' });
}

export function getPriceId(plan: 'student' | 'family' | 'school'): string {
  const prices: Record<string, string | undefined> = {
    student: process.env.STRIPE_STUDENT_MONTHLY_PRICE_ID,
    family:  process.env.STRIPE_FAMILY_MONTHLY_PRICE_ID,
    school:  process.env.STRIPE_SCHOOL_MONTHLY_PRICE_ID,
  };
  const id = prices[plan];
  if (!id) throw new Error(`Missing Stripe price env var for plan: ${plan}`);
  return id;
}

/** Map a Stripe price ID back to a TutorAI plan name, built at call time. */
export function getPlanFromPriceId(priceId: string): Plan | null {
  const map: Partial<Record<string, Plan>> = {};
  if (process.env.STRIPE_STUDENT_MONTHLY_PRICE_ID) map[process.env.STRIPE_STUDENT_MONTHLY_PRICE_ID] = 'student';
  if (process.env.STRIPE_FAMILY_MONTHLY_PRICE_ID)  map[process.env.STRIPE_FAMILY_MONTHLY_PRICE_ID]  = 'family';
  if (process.env.STRIPE_SCHOOL_MONTHLY_PRICE_ID)  map[process.env.STRIPE_SCHOOL_MONTHLY_PRICE_ID]  = 'school';
  return map[priceId] ?? null;
}
