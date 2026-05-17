import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, requireServerUser } from '@/lib/supabase';
import { getStripe, getPriceId } from '@/lib/stripe';

type BillingPlan = 'student' | 'family' | 'school';
const VALID_PLANS: BillingPlan[] = ['student', 'family', 'school'];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return Response.json({ data: null, error: 'Invalid JSON' }, { status: 400 });
    }

    const { plan } = body as { plan?: string };
    if (!plan || !VALID_PLANS.includes(plan as BillingPlan)) {
      return Response.json(
        { data: null, error: `plan must be one of: ${VALID_PLANS.join(', ')}` },
        { status: 400 },
      );
    }

    // ── Auth ─────────────────────────────────────────────────
    const authUser = await requireServerUser();
    const supabase = createServerClient(await cookies());

    const { data: dbUser, error: userError } = await supabase
      .from('users')
      .select('full_name, stripe_customer_id, plan')
      .eq('id', authUser.id)
      .single();

    if (userError || !dbUser) {
      return Response.json({ data: null, error: 'User not found' }, { status: 404 });
    }

    // Block upgrade to same plan
    if ((dbUser.plan as string) === plan) {
      return Response.json({ data: null, error: 'You are already on this plan.' }, { status: 400 });
    }

    const stripe = getStripe();

    // ── Get or create Stripe customer ─────────────────────────
    let stripeCustomerId = dbUser.stripe_customer_id as string | null;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: authUser.email ?? '',
        name: (dbUser.full_name as string | null) ?? undefined,
        metadata: { userId: authUser.id },
      });
      stripeCustomerId = customer.id;
      // Persist immediately so the webhook can find the user by customer ID
      await supabase
        .from('users')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', authUser.id);
    }

    // ── Create Stripe Checkout session ────────────────────────
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [{ price: getPriceId(plan as BillingPlan), quantity: 1 }],
      success_url: `${appUrl}/settings?tab=billing&success=true`,
      cancel_url:  `${appUrl}/settings?tab=billing&canceled=true`,
      allow_promotion_codes: true,
      // Store plan + userId so the webhook can update the user record without
      // needing a price-ID → plan lookup.
      metadata: { plan, userId: authUser.id },
      subscription_data: {
        metadata: { plan, userId: authUser.id },
      },
    });

    if (!session.url) {
      return Response.json({ data: null, error: 'Failed to create checkout session' }, { status: 500 });
    }

    return Response.json({ data: { url: session.url }, error: null });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error('[POST /api/billing/subscribe]', err);
    return Response.json({ data: null, error: 'Internal server error' }, { status: 500 });
  }
}
