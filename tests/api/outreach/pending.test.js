/**
 * Tests: GET /api/outreach/pending
 *
 * REGRESSION — modified to pick up dm_approved jobs alongside pending.
 *
 * Scenarios:
 *   1. Returns next pending connect job
 *   2. Returns next dm_approved job
 *   3. Returns null when no actionable jobs
 *   4. Returns outreach_method in job payload
 *   5. Returns total count of actionable jobs
 *   6. Unauthenticated → 401
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mockSupabase } from '../../setup.js';
import { GET } from '@/app/api/outreach/pending/route.js';

describe('GET /api/outreach/pending', () => {
  beforeEach(() => {
    mockSupabase.reset();
  });

  // ── 1. Next pending connect job ────────────────────────────────

  it('returns next pending job with outreach_method', async () => {
    mockSupabase.setResponse('outreach_queue', {
      id: 'job-1',
      linkedin_handle: 'jane-doe',
      connection_note: 'Hi Jane',
      dm_subject: '',
      dm_body: '',
      queue_position: 1,
      outreach_method: 'connect',
    });

    const req = { headers: new Map([['authorization', 'Bearer test']]) };
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.body.job).toBeDefined();
    expect(res.body.job.id).toBe('job-1');
    expect(res.body.job.outreach_method).toBe('connect');
  });

  // ── 2. DM approved job ─────────────────────────────────────────

  it('returns dm_approved job (method-aware pickup)', async () => {
    mockSupabase.setResponse('outreach_queue', {
      id: 'job-2',
      linkedin_handle: 'recruiter-bob',
      connection_note: '',
      dm_subject: 'Quick question',
      dm_body: 'Hey Bob, saw your work...',
      queue_position: 2,
      outreach_method: 'dm',
    });

    const req = { headers: new Map([['authorization', 'Bearer test']]) };
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.body.job).toBeDefined();
    expect(res.body.job.outreach_method).toBe('dm');
    expect(res.body.job.dm_body).toBeTruthy();
  });

  // ── 3. No actionable jobs ──────────────────────────────────────

  it('returns null job and 0 total when nothing pending', async () => {
    mockSupabase.setResponse('outreach_queue', null);

    const req = { headers: new Map([['authorization', 'Bearer test']]) };
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.body.job).toBeNull();
    expect(res.body.total).toBe(0);
  });

  // ── 4. Total count ─────────────────────────────────────────────

  it('returns total count of actionable jobs', async () => {
    mockSupabase.setResponse('outreach_queue', {
      id: 'job-1',
      linkedin_handle: 'handle',
      connection_note: 'note',
      dm_subject: '',
      dm_body: '',
      queue_position: 1,
      outreach_method: 'connect',
    });

    const req = { headers: new Map([['authorization', 'Bearer test']]) };
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(typeof res.body.total).toBe('number');
  });

  // ── 5. Unauthenticated ────────────────────────────────────────

  it('returns 401 when not authenticated', async () => {
    // getAuthUser mock returns null
    const { getAuthUser } = await import('@/lib/supabase/get-auth-user');
    getAuthUser.mockResolvedValueOnce(null);

    const req = { headers: new Map([['authorization', 'Bearer invalid']]) };
    const res = await GET(req);

    expect(res.status).toBe(401);
  });
});
