/**
 * GET /api/outreach/queue-status
 *
 * Returns status of all outreach_queue jobs for this user from the last 24h.
 * Used by the referrals page progress banner to show live automation status.
 *
 * Returns: { statuses: { [recruiter_match_id]: status } }
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: jobs, error } = await supabase
      .from('outreach_queue')
      .select('recruiter_match_id, status')
      .eq('user_id', user.id)
      .gte('created_at', since)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // If same match_id appears multiple times, take the most recent status
    const statuses = {};
    for (const job of (jobs || [])) {
      if (!statuses[job.recruiter_match_id]) {
        statuses[job.recruiter_match_id] = job.status;
      }
    }

    return NextResponse.json({ statuses });
  } catch (err) {
    console.error('[outreach/queue-status]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
