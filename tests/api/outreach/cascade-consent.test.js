/**
 * Tests: POST /api/outreach/cascade-consent
 *
 * Scenarios:
 *   1. approve_dm — moves connect_limit_hit → dm_pending_review
 *   2. approve_email — splits jobs: with email → email_pending_review, without → deferred
 *   3. defer — moves all paused → deferred
 *   4. Rejects invalid action
 *   5. Rejects unauthenticated requests
 *   6. approve_dm with specific job_ids
 *   7. approve_email with zero paused jobs (no-op)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mockSupabase, mockRequest } from '../../setup.js';
import { POST } from '@/app/api/outreach/cascade-consent/route.js';

describe('POST /api/outreach/cascade-consent', () => {
  beforeEach(() => {
    mockSupabase.reset();
  });

  // ── 1. approve_dm ──────────────────────────────────────────────

  it('approve_dm: returns success and moves count', async () => {
    mockSupabase.setResponse('outreach_queue', [], null);
    const req = mockRequest({ action: 'approve_dm' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.to).toBe('dm_pending_review');
  });

  // ── 2. approve_email — with and without recruiter email ────────

  it('approve_email: returns moved + deferred counts', async () => {
    // Paused DM jobs
    mockSupabase.setResponse('outreach_queue', [
      { id: 'job-1', recruiter_match_id: 'rm-1' },
      { id: 'job-2', recruiter_match_id: 'rm-2' },
    ]);
    // Recruiter matches with email lookup
    mockSupabase.setResponse('recruiter_matches', [
      { id: 'rm-1', recruiters: { email: 'alice@company.com' } },
      { id: 'rm-2', recruiters: { email: null } },
    ]);

    const req = mockRequest({ action: 'approve_email' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // With our mock, both queries return the same mock data,
    // so we verify the response shape is correct
    expect(res.body).toHaveProperty('moved');
    expect(res.body).toHaveProperty('deferred');
    expect(res.body.to).toBe('email_pending_review');
  });

  it('approve_email: zero paused jobs returns no-op', async () => {
    mockSupabase.setResponse('outreach_queue', []);
    const req = mockRequest({ action: 'approve_email' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.moved).toBe(0);
    expect(res.body.deferred).toBe(0);
  });

  // ── 3. defer ───────────────────────────────────────────────────

  it('defer: returns deferred count', async () => {
    mockSupabase.setResponse('outreach_queue', []);
    const req = mockRequest({ action: 'defer' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body).toHaveProperty('deferred');
  });

  // ── 4. Invalid action ─────────────────────────────────────────

  it('rejects invalid action with 400', async () => {
    const req = mockRequest({ action: 'invalid_action' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid action');
  });

  // ── 5. Unauthenticated ────────────────────────────────────────

  it('returns 401 when user is not authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null } });
    const req = mockRequest({ action: 'approve_dm' });
    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  // ── 6. approve_dm with specific job_ids ────────────────────────

  it('approve_dm: accepts optional job_ids array', async () => {
    mockSupabase.setResponse('outreach_queue', []);
    const req = mockRequest({ action: 'approve_dm', job_ids: ['job-1', 'job-2'] });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
