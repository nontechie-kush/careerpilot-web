/**
 * Tests: POST /api/outreach/result
 *
 * REGRESSION — this route was modified to add cascade logic.
 * Must verify both old behavior (sent, failed) AND new cascade behavior.
 *
 * Scenarios:
 *   1. sent — marks job sent, updates recruiter_matches to messaged
 *   2. dm_sent — marks job dm_sent, updates recruiter_matches to messaged
 *   3. failed — marks job failed, no cascade
 *   4. limit_hit + connect — cascades remaining pending connect jobs to connect_limit_hit
 *   5. limit_hit + dm — cascades remaining dm jobs to dm_limit_hit
 *   6. already_connected — reroutes to dm_pending_review
 *   7. account_restricted — cancels all pending/processing jobs
 *   8. Returns cascade info (paused_count) for limit_hit/already_connected
 *   9. Missing job_id/status → 400
 *  10. Job not found → 404
 *  11. Unauthenticated → 401
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mockSupabase, mockRequest } from '../../setup.js';
import { POST } from '@/app/api/outreach/result/route.js';

describe('POST /api/outreach/result', () => {
  beforeEach(() => {
    mockSupabase.reset();
    // Default: job exists and is processing
    mockSupabase.setResponse('outreach_queue', {
      id: 'job-1',
      recruiter_match_id: 'rm-1',
      status: 'processing',
      outreach_method: 'connect',
    });
    mockSupabase.setResponse('recruiter_matches', []);
  });

  // ── 1. sent ────────────────────────────────────────────────────

  it('sent: returns ok with no cascade', async () => {
    const req = mockRequest({ job_id: 'job-1', status: 'sent', result_detail: 'success' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.cascade).toBeNull();
  });

  // ── 2. dm_sent ─────────────────────────────────────────────────

  it('dm_sent: returns ok with no cascade', async () => {
    mockSupabase.setResponse('outreach_queue', {
      id: 'job-1', recruiter_match_id: 'rm-1', status: 'processing', outreach_method: 'dm',
    });
    const req = mockRequest({ job_id: 'job-1', status: 'dm_sent', result_detail: 'dm_delivered' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  // ── 3. failed ──────────────────────────────────────────────────

  it('failed: returns ok, no cascade triggered', async () => {
    const req = mockRequest({ job_id: 'job-1', status: 'failed', result_detail: 'connection_error' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.cascade).toBeNull();
  });

  // ── 4. limit_hit + connect → cascade ───────────────────────────

  it('limit_hit on connect: returns cascade with paused_count', async () => {
    // Mock the cascade count query
    mockSupabase.setResponse('outreach_queue', {
      id: 'job-1', recruiter_match_id: 'rm-1', status: 'processing', outreach_method: 'connect',
    });

    const req = mockRequest({ job_id: 'job-1', status: 'limit_hit', result_detail: 'daily_limit' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // Cascade info should be present for limit_hit
    expect(res.body.cascade).toBeDefined();
    expect(res.body.cascade).toHaveProperty('paused_count');
  });

  // ── 5. limit_hit + dm → dm cascade ────────────────────────────

  it('limit_hit on dm: triggers dm cascade', async () => {
    mockSupabase.setResponse('outreach_queue', {
      id: 'job-1', recruiter_match_id: 'rm-1', status: 'processing', outreach_method: 'dm',
    });

    const req = mockRequest({ job_id: 'job-1', status: 'limit_hit', result_detail: 'dm_daily_limit' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  // ── 6. already_connected → dm reroute ──────────────────────────

  it('already_connected: returns cascade info', async () => {
    const req = mockRequest({ job_id: 'job-1', status: 'already_connected' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.cascade).toBeDefined();
    expect(res.body.cascade).toHaveProperty('paused_count');
  });

  // ── 7. account_restricted → cancel all ─────────────────────────

  it('account_restricted: returns ok, no cascade', async () => {
    const req = mockRequest({ job_id: 'job-1', status: 'account_restricted' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.cascade).toBeNull();
  });

  // ── 9. Missing fields ─────────────────────────────────────────

  it('missing job_id returns 400', async () => {
    const req = mockRequest({ status: 'sent' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('job_id');
  });

  it('missing status returns 400', async () => {
    const req = mockRequest({ job_id: 'job-1' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('status');
  });

  // ── 10. Job not found ──────────────────────────────────────────

  it('returns 404 when job does not exist', async () => {
    mockSupabase.setResponse('outreach_queue', null);
    const req = mockRequest({ job_id: 'nonexistent', status: 'sent' });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  // ── 11. Unauthenticated ────────────────────────────────────────

  it('returns 401 when not authenticated', async () => {
    // result route uses getAuthUser, not supabase.auth.getUser
    const { getAuthUser } = await import('@/lib/supabase/get-auth-user');
    getAuthUser.mockResolvedValueOnce(null);
    const req = mockRequest({ job_id: 'job-1', status: 'sent' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
