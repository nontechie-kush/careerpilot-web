/**
 * POST /api/outreach/approve-messages
 *
 * User approves (or skips) individual DM/email messages after reviewing them.
 * Called from the CascadeConsentSheet swipeable card UI.
 *
 * Body: {
 *   approvals: [{
 *     job_id:        string,
 *     dm_subject?:   string,   // edited subject (DM flow)
 *     dm_body?:      string,   // edited body (DM flow)
 *     email_subject?: string,  // edited subject (email flow)
 *     email_body?:    string,  // edited body (email flow)
 *     approved:      boolean,  // true = approve for automation, false = skip
 *   }]
 * }
 *
 * - approved + dm fields  → status 'dm_approved'
 * - approved + email fields → status 'email_ready'
 * - !approved → left as-is (dm_pending_review / email_pending_review)
 *
 * Returns: { approved_count, remaining_count }
 */

import { NextResponse } from 'next/server';
import { createClientFromRequest } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const supabase = await createClientFromRequest(request);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { approvals } = await request.json();
    if (!Array.isArray(approvals) || approvals.length === 0) {
      return NextResponse.json({ error: 'approvals array required' }, { status: 400 });
    }

    let approvedCount = 0;

    for (const item of approvals) {
      if (!item.job_id) continue;

      // Verify ownership
      const { data: job } = await supabase
        .from('outreach_queue')
        .select('id, status, outreach_method')
        .eq('id', item.job_id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!job) continue;

      if (!item.approved) continue; // leave as pending_review

      const update = {};

      if (job.outreach_method === 'email' || job.status === 'email_pending_review') {
        // Email approval
        update.status = 'email_ready';
        if (item.email_subject) update.email_subject = item.email_subject;
        if (item.email_body) update.email_body = item.email_body;
      } else {
        // DM approval
        update.status = 'dm_approved';
        if (item.dm_subject) update.dm_subject = item.dm_subject;
        if (item.dm_body) update.dm_body = item.dm_body;
      }

      const { error } = await supabase
        .from('outreach_queue')
        .update(update)
        .eq('id', item.job_id);

      if (!error) approvedCount++;
    }

    // Count remaining unapproved review items
    const { count: remaining } = await supabase
      .from('outreach_queue')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .in('status', ['dm_pending_review', 'email_pending_review']);

    return NextResponse.json({
      approved_count: approvedCount,
      remaining_count: remaining || 0,
    });
  } catch (err) {
    console.error('[outreach/approve-messages]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
