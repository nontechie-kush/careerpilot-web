/**
 * POST /api/recruiters/report
 *
 * User reports a bad recruiter profile from inside the app.
 * Auto-deactivates if 3+ distinct users report the same recruiter
 * (enforced via DB trigger on recruiter_reports).
 *
 * Body: { recruiter_id, reason, note? }
 * reason: 'wrong_person'|'profile_gone'|'not_a_recruiter'|'spam'|'other'
 */

import { NextResponse } from 'next/server';
import { createClientFromRequest } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const VALID_REASONS = new Set(['wrong_person', 'profile_gone', 'not_a_recruiter', 'spam', 'other']);

export async function POST(request) {
  try {
    const supabase = await createClientFromRequest(request);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { recruiter_id, reason, note } = await request.json();
    if (!recruiter_id || !reason) {
      return NextResponse.json({ error: 'recruiter_id and reason required' }, { status: 400 });
    }
    if (!VALID_REASONS.has(reason)) {
      return NextResponse.json({ error: 'Invalid reason' }, { status: 400 });
    }

    const { error } = await supabase
      .from('recruiter_reports')
      .insert({ user_id: user.id, recruiter_id, reason, note: note || null });

    if (error) {
      // Duplicate report from same user — silently ignore
      if (error.code === '23505') return NextResponse.json({ ok: true, duplicate: true });
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[recruiters/report]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
