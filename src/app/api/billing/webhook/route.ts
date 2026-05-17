import { NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { getStripe, getPlanFromPriceId } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase';
import type { Plan } from '@/types';

// Stripe sends the raw body — Next.js App Router does NOT pre-parse it,
// so req.text() gives the exact bytes needed for signature verification.
export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[webhook] STRIPE_WEBHOOK_SECRET is not set');
    return Response.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  const body = await req.text();
  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    return Response.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error('[webhook] Signature verification failed:', err);
    return Response.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Helper: subscription item period end (moved from sub root in API 2026-04-22)
  function itemPeriodEnd(sub: Stripe.Subscription): string | null {
    const endTs = sub.items.data[0]?.current_period_end;
    return endTs != null ? new Date(endTs * 1000).toISOString() : null;
  }

  try {
    switch (event.type) {
      // ── Checkout completed → subscription is now active ────
      case 'checkout.session.completed': {
        // event.data.object is typed as Stripe.Checkout.Session in this SDK version
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const plan   = session.metadata?.plan as Plan | undefined;

        if (!userId || !plan) {
          console.warn('[webhook] checkout.session.completed missing metadata', session.id);
          break;
        }

        // Fetch the created subscription to get the period end date
        let periodEnd: string | null = null;
        if (session.subscription) {
          const sub = await getStripe().subscriptions.retrieve(
            session.subscription as string,
            { expand: ['items'] },
          );
          periodEnd = itemPeriodEnd(sub);
        }

        await admin
          .from('users')
          .update({
            plan,
            plan_expires_at: periodEnd,
            stripe_customer_id: session.customer as string,
          })
          .eq('id', userId);

        break;
      }

      // ── Subscription renewed or plan changed ───────────────
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;

        // Prefer metadata set at checkout; fall back to price-ID lookup
        const plan: Plan =
          (sub.metadata.plan as Plan | undefined) ??
          getPlanFromPriceId(sub.items.data[0]?.price.id ?? '') ??
          'free';

        const periodEnd = itemPeriodEnd(sub);

        const update =
          sub.status === 'active' || sub.status === 'trialing'
            ? { plan, plan_expires_at: periodEnd }
            : { plan: 'free' as Plan, plan_expires_at: null };

        const userId = sub.metadata.userId;
        if (userId) {
          await admin.from('users').update(update).eq('id', userId);
        } else {
          await admin
            .from('users')
            .update(update)
            .eq('stripe_customer_id', sub.customer as string);
        }

        break;
      }

      // ── Subscription cancelled ─────────────────────────────
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const resetPayload = { plan: 'free' as Plan, plan_expires_at: null };

        const userId = sub.metadata.userId;
        if (userId) {
          await admin.from('users').update(resetPayload).eq('id', userId);
        } else {
          await admin
            .from('users')
            .update(resetPayload)
            .eq('stripe_customer_id', sub.customer as string);
        }

        break;
      }

      // ── Invoice payment failed → log; Stripe handles dunning emails
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        console.warn('[webhook] Payment failed for customer:', invoice.customer);
        break;
      }

      default:
        // Acknowledge unhandled events to prevent Stripe retries
        break;
    }
  } catch (err) {
    console.error(`[webhook] Error handling ${event.type}:`, err);
    return Response.json({ error: 'Handler failed' }, { status: 500 });
  }

  return Response.json({ received: true });
}
