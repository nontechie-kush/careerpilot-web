/**
 * GET /api/outreach/pending
 *
 * Extension polls this every 15s to check for queued jobs.
 * Returns the next pending job for this user and marks it as 'processing'.
 * Only one job is returned at a time — extension processes sequentially.
 *
 * Picks up: 'pending' (connect jobs) OR 'dm_approved' (DM jobs user approved)
 * Returns outreach_method so extension knows which flow to run.
 *
 * Returns: { job: { id, linkedin_handle, connection_note, dm_subject, dm_body, queue_position, outreach_method } | null, total }
 */

import { NextResponse } from 'next/server';
import { createClientFromRequest } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/supabase/get-auth-user';

export const dynamic = 'force-dynamic';

// Reset stuck 'processing' jobs older than 5 minutes back to their previous actionable status
async function resetStuckJobs(supabase, userId) {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  await supabase
    .from('outreach_queue')
    .update({ status: 'pending', picked_up_at: null })
    .eq('user_id', userId)
    .eq('status', 'processing')
    .lt('picked_up_at', fiveMinutesAgo);
}

export async function GET(request) {
  try {
    const supabase = await createClientFromRequest(request);
    const user = await getAuthUser(supabase, request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await resetStuckJobs(supabase, user.id);

    // Get total actionable count (pending connect + approved DMs)
    const { count: totalPending } = await supabase
      .from('outreach_queue')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .in('status', ['pending', 'dm_approved']);

    // Fetch the next actionable job (pending connect OR approved DM)
    const { data: job, error } = await supabase
      .from('outreach_queue')
      .select('id, linkedin_handle, connection_note, dm_subject, dm_body, queue_position, outreach_method')
      .eq('user_id', user.id)
      .in('status', ['pending', 'dm_approved'])
      .order('queue_position', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!job) return NextResponse.json({ job: null, total: 0 });

    // Mark as processing
    await supabase
      .from('outreach_queue')
      .update({ status: 'processing', picked_up_at: new Date().toISOString() })
      .eq('id', job.id);

    return NextResponse.json({ job, total: (totalPending || 0) + 1 });
  } catch (err) {
    console.error('[outreach/pending]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
