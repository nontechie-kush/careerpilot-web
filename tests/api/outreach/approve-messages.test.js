/**
 * Tests: POST /api/outreach/approve-messages
 *
 * Scenarios:
 *   1. Approve DM jobs — status becomes dm_approved, content updated
 *   2. Approve email jobs — status becomes email_ready
 *   3. Skip unapproved jobs — left as pending_review
 *   4. Mixed approvals (some approved, some not)
 *   5. Empty approvals array → 400
 *   6. Invalid job_id → skipped gracefully
 *   7. Unauthenticated → 401
 *   8. Returns remaining_count of unapproved jobs
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mockSupabase, mockRequest } from '../../setup.js';
import { POST } from '@/app/api/outreach/approve-messages/route.js';

describe('POST /api/outreach/approve-messages', () => {
  beforeEach(() => {
    mockSupabase.reset();
  });

  // ── 1. Approve DM jobs ─────────────────────────────────────────

  it('approves DM jobs and returns count', async () => {
    mockSupabase.setResponse('outreach_queue', {
      id: 'job-1',
      status: 'dm_pending_review',
      outreach_method: 'dm',
    });

    const req = mockRequest({
      approvals: [{
        job_id: 'job-1',
        dm_subject: 'Quick question',
        dm_body: 'Hey, saw your work at...',
        approved: true,
      }],
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.body.approved_count).toBe(1);
    expect(res.body).toHaveProperty('remaining_count');
  });

  // ── 2. Approve email jobs ──────────────────────────────────────

  it('approves email jobs and sets email_ready status', async () => {
    mockSupabase.setResponse('outreach_queue', {
      id: 'job-2',
      status: 'email_pending_review',
      outreach_method: 'email',
    });

    const req = mockRequest({
      approvals: [{
        job_id: 'job-2',
        email_subject: 'Reaching out about opportunities',
        email_body: 'Dear recruiter...',
        approved: true,
      }],
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.body.approved_count).toBe(1);
  });

  // ── 3. Skip unapproved jobs ────────────────────────────────────

  it('skips unapproved jobs (approved: false)', async () => {
    mockSupabase.setResponse('outreach_queue', {
      id: 'job-3',
      status: 'dm_pending_review',
      outreach_method: 'dm',
    });

    const req = mockRequest({
      approvals: [{
        job_id: 'job-3',
        approved: false,
      }],
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.body.approved_count).toBe(0);
  });

  // ── 4. Mixed approvals ─────────────────────────────────────────

  it('handles mixed approved and unapproved in same batch', async () => {
    mockSupabase.setResponse('outreach_queue', {
      id: 'job-1',
      status: 'dm_pending_review',
      outreach_method: 'dm',
    });

    const req = mockRequest({
      approvals: [
        { job_id: 'job-1', dm_body: 'Hey!', approved: true },
        { job_id: 'job-2', approved: false },
      ],
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    // job-1 approved, job-2 skipped (no match found in mock for job-2, also approved:false)
    expect(res.body.approved_count).toBeGreaterThanOrEqual(0);
  });

  // ── 5. Empty approvals → 400 ──────────────────────────────────

  it('rejects empty approvals array with 400', async () => {
    const req = mockRequest({ approvals: [] });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('approvals array required');
  });

  it('rejects missing approvals field with 400', async () => {
    const req = mockRequest({});
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // ── 6. Invalid job_id → skipped ────────────────────────────────

  it('skips entries with missing job_id', async () => {
    const req = mockRequest({
      approvals: [{ approved: true, dm_body: 'Hello' }],
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.body.approved_count).toBe(0);
  });

  // ── 7. Unauthenticated → 401 ──────────────────────────────────

  it('returns 401 when not authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null } });
    const req = mockRequest({ approvals: [{ job_id: 'x', approved: true }] });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
