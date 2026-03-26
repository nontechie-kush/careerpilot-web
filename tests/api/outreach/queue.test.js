/**
 * Tests: POST /api/outreach/queue
 *
 * REGRESSION — modified to accept outreach_method + generate batch_id.
 *
 * Scenarios:
 *   1. Queues jobs with default outreach_method 'connect'
 *   2. Accepts custom outreach_method per job
 *   3. Returns batch_id in response
 *   4. Caps at 15 jobs per batch
 *   5. Skips jobs already in queue (pending/processing/sent)
 *   6. Skips jobs without linkedin_handle or connection_note
 *   7. Empty jobs array → 400
 *   8. Invalid outreach_method defaults to 'connect'
 *   9. Unauthenticated → 401
 *  10. Returns queued, skipped, positions
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mockSupabase, mockRequest } from '../../setup.js';
import { POST } from '@/app/api/outreach/queue/route.js';

describe('POST /api/outreach/queue', () => {
  beforeEach(() => {
    mockSupabase.reset();
    // No existing jobs by default
    mockSupabase.setResponse('outreach_queue', []);
  });

  // ── 1. Default outreach_method ─────────────────────────────────

  it('queues jobs and returns batch_id', async () => {
    const req = mockRequest({
      jobs: [{
        match_id: 'rm-1',
        linkedin_handle: 'jane-doe',
        connection_note: 'Hi Jane, great work on...',
      }],
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.body.queued).toBe(1);
    expect(res.body.batch_id).toBeDefined();
    expect(typeof res.body.batch_id).toBe('string');
    expect(res.body.positions).toHaveProperty('rm-1');
  });

  // ── 2. Custom outreach_method ──────────────────────────────────

  it('accepts custom outreach_method per job', async () => {
    const req = mockRequest({
      jobs: [{
        match_id: 'rm-1',
        linkedin_handle: 'jane-doe',
        connection_note: 'Hi',
        outreach_method: 'dm',
      }],
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.body.queued).toBe(1);

    // Check insert had outreach_method = 'dm'
    const inserts = mockSupabase.getInserts('outreach_queue');
    const dmJob = inserts.find(i => i.outreach_method === 'dm');
    expect(dmJob).toBeDefined();
  });

  // ── 3. Returns batch_id ────────────────────────────────────────

  it('batch_id is a valid UUID format', async () => {
    const req = mockRequest({
      jobs: [{ match_id: 'rm-1', linkedin_handle: 'handle', connection_note: 'note' }],
    });
    const res = await POST(req);

    expect(res.body.batch_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  // ── 4. Cap at 15 ───────────────────────────────────────────────

  it('caps batch at 15 jobs', async () => {
    const jobs = Array.from({ length: 20 }, (_, i) => ({
      match_id: `rm-${i}`,
      linkedin_handle: `handle-${i}`,
      connection_note: `Note ${i}`,
    }));
    const req = mockRequest({ jobs });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.body.queued).toBeLessThanOrEqual(15);
  });

  // ── 5. Skips already-queued ────────────────────────────────────

  it('skips jobs already in queue', async () => {
    // Simulate existing pending job
    mockSupabase.setResponse('outreach_queue', [
      { recruiter_match_id: 'rm-1', status: 'pending' },
    ]);

    const req = mockRequest({
      jobs: [
        { match_id: 'rm-1', linkedin_handle: 'jane', connection_note: 'Hi' },
        { match_id: 'rm-2', linkedin_handle: 'bob', connection_note: 'Hey' },
      ],
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    // rm-1 should be skipped, rm-2 queued
    expect(res.body.skipped).toBeGreaterThanOrEqual(1);
  });

  // ── 6. Skips invalid jobs ──────────────────────────────────────

  it('skips jobs missing linkedin_handle', async () => {
    const req = mockRequest({
      jobs: [{ match_id: 'rm-1', connection_note: 'Hi' }],
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.body.queued).toBe(0);
  });

  it('skips jobs missing connection_note', async () => {
    const req = mockRequest({
      jobs: [{ match_id: 'rm-1', linkedin_handle: 'jane' }],
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.body.queued).toBe(0);
  });

  // ── 7. Empty array → 400 ──────────────────────────────────────

  it('rejects empty jobs array with 400', async () => {
    const req = mockRequest({ jobs: [] });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('rejects non-array jobs with 400', async () => {
    const req = mockRequest({ jobs: 'not-an-array' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // ── 8. Invalid method defaults to connect ──────────────────────

  it('defaults invalid outreach_method to connect', async () => {
    const req = mockRequest({
      jobs: [{
        match_id: 'rm-1',
        linkedin_handle: 'jane',
        connection_note: 'Hi',
        outreach_method: 'fax', // invalid
      }],
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const inserts = mockSupabase.getInserts('outreach_queue');
    expect(inserts[0]?.outreach_method).toBe('connect');
  });

  // ── 9. Unauthenticated ────────────────────────────────────────

  it('returns 401 when not authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null } });
    const req = mockRequest({ jobs: [{ match_id: 'rm-1', linkedin_handle: 'j', connection_note: 'h' }] });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
