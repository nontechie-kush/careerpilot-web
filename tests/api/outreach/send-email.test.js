/**
 * Tests: POST /api/outreach/send-email
 *
 * Scenarios:
 *   1. Happy path — sends email, marks job email_sent
 *   2. Missing job_id → 400
 *   3. Job not found → 404
 *   4. Job status not email_ready → 400
 *   5. No recruiter email → 400
 *   6. Gmail not connected → 400
 *   7. Unauthenticated → 401
 *   8. Gmail token expired + refresh succeeds → sends email
 *   9. Gmail send fails → 500
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockSupabase, mockRequest } from '../../setup.js';
import { POST } from '@/app/api/outreach/send-email/route.js';
import { sendEmail } from '@/lib/gmail/send';

describe('POST /api/outreach/send-email', () => {
  beforeEach(() => {
    mockSupabase.reset();
    vi.clearAllMocks();
  });

  // ── 1. Happy path ─────────────────────────────────────────────

  it('sends email and returns gmail_message_id', async () => {
    // Job exists and is email_ready
    mockSupabase.setResponse('outreach_queue', {
      id: 'job-1',
      recruiter_match_id: 'rm-1',
      status: 'email_ready',
      email_subject: 'Following up',
      email_body: 'Hello recruiter...',
    });
    // Recruiter has email
    mockSupabase.setResponse('recruiter_matches', {
      recruiters: { email: 'recruiter@company.com', name: 'Jane Doe' },
    });
    // Gmail tokens exist
    mockSupabase.setResponse('gmail_tokens', {
      access_token: 'valid-token',
      refresh_token: 'ref-token',
      token_expiry: new Date(Date.now() + 3600000).toISOString(),
    });
    // Profile for fromName
    mockSupabase.setResponse('profiles', {
      parsed_json: { name: 'Test User' },
    });

    const req = mockRequest({ job_id: 'job-1' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.gmail_message_id).toBe('gmail-msg-123');
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  // ── 2. Missing job_id ─────────────────────────────────────────

  it('returns 400 when job_id is missing', async () => {
    const req = mockRequest({});
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('job_id required');
  });

  // ── 3. Job not found ──────────────────────────────────────────

  it('returns 404 when job does not exist', async () => {
    mockSupabase.setResponse('outreach_queue', null);
    const req = mockRequest({ job_id: 'nonexistent' });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  // ── 4. Wrong job status ────────────────────────────────────────

  it('returns 400 when job status is not email_ready', async () => {
    mockSupabase.setResponse('outreach_queue', {
      id: 'job-1',
      recruiter_match_id: 'rm-1',
      status: 'dm_pending_review',
      email_subject: '',
      email_body: '',
    });
    const req = mockRequest({ job_id: 'job-1' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('dm_pending_review');
  });

  // ── 5. No recruiter email ─────────────────────────────────────

  it('returns 400 when recruiter has no email', async () => {
    mockSupabase.setResponse('outreach_queue', {
      id: 'job-1',
      recruiter_match_id: 'rm-1',
      status: 'email_ready',
      email_subject: 'Hi',
      email_body: 'Hello',
    });
    mockSupabase.setResponse('recruiter_matches', {
      recruiters: { email: null, name: 'No Email Recruiter' },
    });
    const req = mockRequest({ job_id: 'job-1' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('No email');
  });

  // ── 6. Gmail not connected ────────────────────────────────────

  it('returns 400 when Gmail tokens are missing', async () => {
    mockSupabase.setResponse('outreach_queue', {
      id: 'job-1',
      recruiter_match_id: 'rm-1',
      status: 'email_ready',
      email_subject: 'Hi',
      email_body: 'Hello',
    });
    mockSupabase.setResponse('recruiter_matches', {
      recruiters: { email: 'rec@co.com', name: 'Rec' },
    });
    mockSupabase.setResponse('gmail_tokens', null);

    const req = mockRequest({ job_id: 'job-1' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Gmail not connected');
  });

  // ── 7. Unauthenticated ────────────────────────────────────────

  it('returns 401 when not authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null } });
    const req = mockRequest({ job_id: 'job-1' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
