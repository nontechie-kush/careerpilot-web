/**
 * Tests: GET /api/outreach/queue-status
 *
 * REGRESSION — modified to return cascade state info.
 *
 * Scenarios:
 *   1. Returns statuses map (recruiter_match_id → status)
 *   2. Returns cascade counts when cascade states present
 *   3. Returns null cascade when no cascade states
 *   4. Most recent status wins for duplicate match_ids
 *   5. Unauthenticated → 401
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mockSupabase } from '../../setup.js';
import { GET } from '@/app/api/outreach/queue-status/route.js';

describe('GET /api/outreach/queue-status', () => {
  beforeEach(() => {
    mockSupabase.reset();
  });

  // ── 1. Returns statuses map ────────────────────────────────────

  it('returns statuses keyed by recruiter_match_id', async () => {
    mockSupabase.setResponse('outreach_queue', [
      { id: 'j1', recruiter_match_id: 'rm-1', status: 'sent', outreach_method: 'connect', batch_id: 'b1' },
      { id: 'j2', recruiter_match_id: 'rm-2', status: 'pending', outreach_method: 'connect', batch_id: 'b1' },
    ]);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(res.body.statuses['rm-1']).toBe('sent');
    expect(res.body.statuses['rm-2']).toBe('pending');
  });

  // ── 2. Cascade counts ─────────────────────────────────────────

  it('returns cascade counts when cascade states present', async () => {
    mockSupabase.setResponse('outreach_queue', [
      { id: 'j1', recruiter_match_id: 'rm-1', status: 'connect_limit_hit', outreach_method: 'connect', batch_id: 'b1' },
      { id: 'j2', recruiter_match_id: 'rm-2', status: 'connect_limit_hit', outreach_method: 'connect', batch_id: 'b1' },
      { id: 'j3', recruiter_match_id: 'rm-3', status: 'dm_pending_review', outreach_method: 'dm', batch_id: 'b1' },
    ]);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(res.body.cascade).toBeDefined();
    expect(res.body.cascade).not.toBeNull();
    expect(res.body.cascade.connect_limit_hit).toBe(2);
    expect(res.body.cascade.dm_pending_review).toBe(1);
  });

  // ── 3. No cascade ─────────────────────────────────────────────

  it('returns null cascade when no cascade states', async () => {
    mockSupabase.setResponse('outreach_queue', [
      { id: 'j1', recruiter_match_id: 'rm-1', status: 'sent', outreach_method: 'connect', batch_id: 'b1' },
      { id: 'j2', recruiter_match_id: 'rm-2', status: 'pending', outreach_method: 'connect', batch_id: 'b1' },
    ]);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(res.body.cascade).toBeNull();
  });

  // ── 4. Most recent status wins ─────────────────────────────────

  it('uses most recent status for duplicate match_ids', async () => {
    mockSupabase.setResponse('outreach_queue', [
      // More recent (first in order desc)
      { id: 'j2', recruiter_match_id: 'rm-1', status: 'sent', outreach_method: 'connect', batch_id: 'b1' },
      // Older
      { id: 'j1', recruiter_match_id: 'rm-1', status: 'pending', outreach_method: 'connect', batch_id: 'b1' },
    ]);

    const res = await GET();

    expect(res.status).toBe(200);
    // First occurrence wins (already ordered desc by created_at)
    expect(res.body.statuses['rm-1']).toBe('sent');
  });

  // ── 5. Unauthenticated ────────────────────────────────────────

  it('returns 401 when not authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await GET();
    expect(res.status).toBe(401);
  });
});
