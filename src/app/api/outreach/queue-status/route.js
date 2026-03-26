/**
 * GET /api/outreach/queue-status
 *
 * Returns status of all outreach_queue jobs for this user from the last 24h.
 * Used by the referrals page progress banner and cascade detection.
 *
 * Returns: {
 *   statuses: { [recruiter_match_id]: status },
 *   cascade: { connect_limit_hit: number, dm_pending_review: number, dm_limit_hit: number } | null
 * }
 */

import { NextResponse } from 'next/server';
import { createClientFromRequest } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const CASCADE_STATUSES = ['connect_limit_hit', 'dm_pending_review', 'dm_limit_hit', 'email_pending_review'];

export async function GET(request) {
  try {
    const supabase = await createClientFromRequest(request);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: jobs, error } = await supabase
      .from('outreach_queue')
      .select('id, recruiter_match_id, status, outreach_method, batch_id')
      .eq('user_id', user.id)
      .gte('created_at', since)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // If same match_id appears multiple times, take the most recent status
    const statuses = {};
    const cascadeCounts = {};
    for (const job of (jobs || [])) {
      if (!statuses[job.recruiter_match_id]) {
        statuses[job.recruiter_match_id] = job.status;
      }
      // Count cascade states
      if (CASCADE_STATUSES.includes(job.status)) {
        cascadeCounts[job.status] = (cascadeCounts[job.status] || 0) + 1;
      }
    }

    const hasCascade = Object.keys(cascadeCounts).length > 0;

    return NextResponse.json({
      statuses,
      cascade: hasCascade ? cascadeCounts : null,
    });
  } catch (err) {
    console.error('[outreach/queue-status]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
