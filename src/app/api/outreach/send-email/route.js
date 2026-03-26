/**
 * POST /api/outreach/send-email
 *
 * Sends an outreach email via the user's connected Gmail account.
 * Called from CascadeConsentSheet when user approves an email card.
 *
 * Body: { job_id: string }
 *
 * Flow:
 *   1. Verify job ownership + status = 'email_ready'
 *   2. Look up recruiter email via recruiter_matches → recruiters
 *   3. Get user's Gmail tokens (service client — no RLS)
 *   4. Refresh token if needed
 *   5. Send email via Gmail API
 *   6. Mark job as 'email_sent'
 *
 * Requires: Gmail connected with gmail.send scope.
 */

import { NextResponse } from 'next/server';
import { createClientFromRequest, createServiceClient } from '@/lib/supabase/server';
import { refreshAccessToken } from '@/lib/gmail/client';
import { sendEmail } from '@/lib/gmail/send';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const supabase = await createClientFromRequest(request);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { job_id } = await request.json();
    if (!job_id) return NextResponse.json({ error: 'job_id required' }, { status: 400 });

    // 1. Fetch the job
    const { data: job, error: jobErr } = await supabase
      .from('outreach_queue')
      .select('id, recruiter_match_id, status, email_subject, email_body')
      .eq('id', job_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (jobErr) throw jobErr;
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    if (job.status !== 'email_ready') {
      return NextResponse.json({ error: `Job status is '${job.status}', expected 'email_ready'` }, { status: 400 });
    }

    // 2. Get recruiter email
    const { data: match } = await supabase
      .from('recruiter_matches')
      .select('recruiters(email, name)')
      .eq('id', job.recruiter_match_id)
      .single();

    const recruiterEmail = match?.recruiters?.email;
    if (!recruiterEmail) {
      return NextResponse.json({ error: 'No email on file for this recruiter' }, { status: 400 });
    }

    // 3. Get Gmail tokens (service client — gmail_tokens uses service role)
    const serviceClient = createServiceClient();
    const { data: tokenRow } = await serviceClient
      .from('gmail_tokens')
      .select('access_token, refresh_token, token_expiry')
      .eq('user_id', user.id)
      .single();

    if (!tokenRow) {
      return NextResponse.json({ error: 'Gmail not connected. Connect Gmail first.' }, { status: 400 });
    }

    // 4. Refresh token if expired
    let accessToken = tokenRow.access_token;
    const expiryBuffer = 5 * 60 * 1000;
    if (new Date(tokenRow.token_expiry).getTime() - Date.now() < expiryBuffer) {
      try {
        const refreshed = await refreshAccessToken(tokenRow.refresh_token);
        accessToken = refreshed.access_token;
        const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
        await serviceClient
          .from('gmail_tokens')
          .update({ access_token: accessToken, token_expiry: newExpiry })
          .eq('user_id', user.id);
      } catch (err) {
        return NextResponse.json({ error: 'Gmail token expired. Please reconnect Gmail.' }, { status: 401 });
      }
    }

    // 5. Get user's name for From header
    const { data: profile } = await supabase
      .from('profiles')
      .select('parsed_json')
      .eq('user_id', user.id)
      .single();

    const fromName = profile?.parsed_json?.name || '';

    // 6. Send email
    const result = await sendEmail(accessToken, {
      to: recruiterEmail,
      subject: job.email_subject || 'Following up on opportunities',
      body: job.email_body || '',
      fromName,
      fromEmail: user.email,
    });

    // 7. Mark job as email_sent
    await supabase
      .from('outreach_queue')
      .update({
        status: 'email_sent',
        result_detail: `gmail_message_id:${result.id}`,
        completed_at: new Date().toISOString(),
      })
      .eq('id', job_id);

    // Update recruiter_matches
    await supabase
      .from('recruiter_matches')
      .update({
        status: 'messaged',
        outreach_sent_at: new Date().toISOString(),
      })
      .eq('id', job.recruiter_match_id)
      .eq('user_id', user.id);

    return NextResponse.json({ ok: true, gmail_message_id: result.id });
  } catch (err) {
    console.error('[outreach/send-email]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
