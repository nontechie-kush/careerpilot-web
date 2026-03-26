/**
 * POST /api/outreach/result
 *
 * Extension calls this after each LinkedIn automation attempt.
 * Updates outreach_queue + recruiter_matches with the result.
 *
 * CASCADING LOGIC:
 * - limit_hit on connect → remaining pending jobs become 'connect_limit_hit' (not cancelled)
 * - already_connected → that job becomes 'dm_pending_review' (reroute to DM)
 * - dm_limit_hit → remaining dm jobs become 'dm_limit_hit'
 * - account_restricted → cancel everything (safety)
 *
 * Body: {
 *   job_id:        string,
 *   status:        string,
 *   result_detail: string,
 * }
 */

import { NextResponse } from 'next/server';
import { createClientFromRequest } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/supabase/get-auth-user';

export const dynamic = 'force-dynamic';

// Map outreach result status → recruiter_matches status
const MATCH_STATUS_MAP = {
  sent:               'messaged',
  dm_sent:            'messaged',
  limit_hit:          'pending',
  connect_limit_hit:  'pending',
  dm_limit_hit:       'pending',
  dm_pending_review:  'pending',
  failed:             'pending',
  interrupted:        'pending',
  already_pending:    'pending',
  already_connected:  'pending',
  profile_not_found:  'pending',
  captcha:            'pending',
  restricted:         'pending',
  account_restricted: 'pending',
};

const TERMINAL_STATUSES = new Set([
  'sent', 'dm_sent', 'limit_hit', 'connect_limit_hit', 'dm_limit_hit',
  'failed', 'interrupted', 'already_pending', 'profile_not_found',
  'restricted', 'already_connected', 'dm_pending_review',
]);

export async function POST(request) {
  try {
    const supabase = await createClientFromRequest(request);
    const user = await getAuthUser(supabase, request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { job_id, status, result_detail } = await request.json();
    if (!job_id || !status) {
      return NextResponse.json({ error: 'job_id and status required' }, { status: 400 });
    }

    // Fetch the job (verify ownership + get method)
    const { data: job, error: jobError } = await supabase
      .from('outreach_queue')
      .select('id, recruiter_match_id, status, outreach_method')
      .eq('id', job_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (jobError) throw jobError;
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    // Update queue job
    await supabase
      .from('outreach_queue')
      .update({
        status,
        result_detail: result_detail || null,
        completed_at: TERMINAL_STATUSES.has(status) ? new Date().toISOString() : null,
      })
      .eq('id', job_id);

    // Update recruiter_matches
    const matchStatus = MATCH_STATUS_MAP[status] || 'pending';
    const matchUpdate = { status: matchStatus };
    if (status === 'sent' || status === 'dm_sent') {
      matchUpdate.outreach_sent_at = new Date().toISOString();
    }

    await supabase
      .from('recruiter_matches')
      .update(matchUpdate)
      .eq('id', job.recruiter_match_id)
      .eq('user_id', user.id);

    // ── CASCADE LOGIC ──

    // Connect limit hit → pause remaining pending connect jobs (don't cancel)
    if (status === 'limit_hit' && (job.outreach_method === 'connect' || !job.outreach_method)) {
      await supabase
        .from('outreach_queue')
        .update({
          status: 'connect_limit_hit',
          result_detail: 'cascade_paused_connect_limit',
        })
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .eq('outreach_method', 'connect');
    }

    // DM limit hit → pause remaining pending DM jobs
    if (status === 'limit_hit' && job.outreach_method === 'dm') {
      await supabase
        .from('outreach_queue')
        .update({
          status: 'dm_limit_hit',
          result_detail: 'cascade_paused_dm_limit',
        })
        .eq('user_id', user.id)
        .in('status', ['pending', 'dm_approved'])
        .eq('outreach_method', 'dm');
    }

    // Already connected → reroute this specific job to DM review
    if (status === 'already_connected') {
      await supabase
        .from('outreach_queue')
        .update({
          status: 'dm_pending_review',
          outreach_method: 'dm',
          result_detail: 'rerouted_1st_degree',
        })
        .eq('id', job_id);
    }

    // Account restricted → cancel everything (safety first)
    if (status === 'account_restricted') {
      await supabase
        .from('outreach_queue')
        .update({ status: 'cancelled', result_detail: 'account_restricted' })
        .eq('user_id', user.id)
        .in('status', ['pending', 'processing']);
    }

    // Return cascade info so extension/frontend knows what happened
    let cascade = null;
    if (status === 'limit_hit' || status === 'already_connected') {
      const { count } = await supabase
        .from('outreach_queue')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .in('status', ['connect_limit_hit', 'dm_pending_review']);
      cascade = { paused_count: count || 0 };
    }

    return NextResponse.json({ ok: true, cascade });
  } catch (err) {
    console.error('[outreach/result]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
