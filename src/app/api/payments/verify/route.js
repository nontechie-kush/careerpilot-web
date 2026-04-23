/**
 * POST /api/payments/verify
 *
 * Verifies Razorpay payment signature (HMAC-SHA256) and credits the user.
 * This is the ONLY place credits are added — all other paths are blocked.
 *
 * Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClientFromRequest } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service-client';

export const dynamic = 'force-dynamic';

const PLAN_TIERS = { '5': 'plan_5', '25': 'plan_25', '50': 'plan_50' };

export async function POST(request) {
  try {
    // Auth check
    const supabase = await createClientFromRequest(request);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = await request.json();

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ error: 'Missing payment fields' }, { status: 400 });
    }

    // ── SECURITY: Verify HMAC-SHA256 signature ─────────────────────────────
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expected !== razorpay_signature) {
      console.warn('[verify] Signature mismatch — possible tamper attempt', { user_id: user.id, razorpay_order_id });
      return NextResponse.json({ error: 'Payment verification failed' }, { status: 400 });
    }
    // ── END SECURITY CHECK ─────────────────────────────────────────────────

    const service = createServiceClient();

    // Find the pending order — must belong to this user
    const { data: order, error: orderErr } = await service
      .from('rolepitch_orders')
      .select('*')
      .eq('razorpay_order_id', razorpay_order_id)
      .eq('user_id', user.id)       // user owns this order
      .eq('status', 'created')      // not already paid
      .maybeSingle();

    if (orderErr || !order) {
      console.warn('[verify] Order not found or already paid', { razorpay_order_id, user_id: user.id });
      return NextResponse.json({ error: 'Order not found or already processed' }, { status: 400 });
    }

    // ── SECURITY: Idempotency — mark payment_id UNIQUE prevents double-credit ─
    const { error: updateErr } = await service
      .from('rolepitch_orders')
      .update({
        razorpay_payment_id,   // UNIQUE constraint rejects replay
        status: 'paid',
        paid_at: new Date().toISOString(),
      })
      .eq('id', order.id)
      .eq('status', 'created');   // double-check status (race condition guard)

    if (updateErr) {
      // UNIQUE violation = replay attack or double submit
      console.warn('[verify] Payment already processed (replay?)', { razorpay_payment_id, user_id: user.id });
      return NextResponse.json({ error: 'Payment already processed' }, { status: 400 });
    }

    // ── Atomic credit top-up via RPC (prevents race conditions) ───────────
    const { data: rpcResult, error: rpcErr } = await service.rpc('increment_pitch_credits', {
      p_user_id: user.id,
      p_amount: order.credits_to_add,
      p_plan_tier: PLAN_TIERS[order.plan] || 'plan_5',
    });

    if (rpcErr) {
      console.error('[verify] Credit increment failed', rpcErr);
      // Order is already marked paid — log for manual recovery
      return NextResponse.json({ error: 'Credit update failed — contact support' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      credits_added: order.credits_to_add,
      new_balance: rpcResult,
    });

  } catch (err) {
    console.error('[verify]', err);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
