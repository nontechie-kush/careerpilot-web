/**
 * Integration Tests: Full Cascade Outreach Flow
 *
 * These test the END-TO-END cascade state machine transitions
 * as they'd happen in production, calling routes in sequence.
 *
 * Flow A: Connect → Connect Limit → DM Consent → DM Review → DM Sent
 * Flow B: Connect → Connect Limit → DM Consent → DM Review → DM Limit → Email Consent → Email Sent
 * Flow C: Connect → Connect Limit → Defer (user declines DM)
 * Flow D: Connect → Already Connected → DM Reroute
 * Flow E: Connect → Account Restricted → Cancel All
 * Flow F: Email consent → some deferred (no recruiter email)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mockSupabase, mockRequest } from '../setup.js';

describe('Cascade Flow Integration', () => {
  beforeEach(() => {
    mockSupabase.reset();
  });

  // ── Flow A: Connect → Limit → DM → Sent ───────────────────────

  describe('Flow A: Connect → DM cascade', () => {
    it('Step 1: Queue batch of connect jobs', async () => {
      mockSupabase.setResponse('outreach_queue', []);
      const { POST } = await import('@/app/api/outreach/queue/route.js');

      const req = mockRequest({
        jobs: [
          { match_id: 'rm-1', linkedin_handle: 'alice', connection_note: 'Hi Alice' },
          { match_id: 'rm-2', linkedin_handle: 'bob', connection_note: 'Hi Bob' },
          { match_id: 'rm-3', linkedin_handle: 'carol', connection_note: 'Hi Carol' },
        ],
      });
      const res = await POST(req);

      expect(res.status).toBe(200);
      expect(res.body.queued).toBe(3);
      expect(res.body.batch_id).toBeDefined();

      // Verify all inserts have outreach_method = 'connect'
      const inserts = mockSupabase.getInserts('outreach_queue');
      expect(inserts.every(i => i.outreach_method === 'connect')).toBe(true);
      expect(inserts.every(i => i.batch_id === res.body.batch_id)).toBe(true);
    });

    it('Step 2: First job sent successfully', async () => {
      mockSupabase.setResponse('outreach_queue', {
        id: 'job-1', recruiter_match_id: 'rm-1', status: 'processing', outreach_method: 'connect',
      });
      const { POST } = await import('@/app/api/outreach/result/route.js');

      const req = mockRequest({ job_id: 'job-1', status: 'sent', result_detail: 'success' });
      const res = await POST(req);

      expect(res.status).toBe(200);
      expect(res.body.cascade).toBeNull(); // No cascade on success
    });

    it('Step 3: Second job hits limit → cascade pauses remaining', async () => {
      mockSupabase.setResponse('outreach_queue', {
        id: 'job-2', recruiter_match_id: 'rm-2', status: 'processing', outreach_method: 'connect',
      });
      const { POST } = await import('@/app/api/outreach/result/route.js');

      const req = mockRequest({ job_id: 'job-2', status: 'limit_hit', result_detail: 'daily_limit' });
      const res = await POST(req);

      expect(res.status).toBe(200);
      expect(res.body.cascade).toBeDefined();
      expect(res.body.cascade.paused_count).toBeGreaterThanOrEqual(0);

      // Verify cascade update was issued
      const updates = mockSupabase.getUpdates('outreach_queue');
      const cascadeUpdate = updates.find(u =>
        u._data.status === 'connect_limit_hit'
      );
      expect(cascadeUpdate).toBeDefined();
    });

    it('Step 4: User consents to DM → moves paused to dm_pending_review', async () => {
      mockSupabase.setResponse('outreach_queue', []);
      const { POST } = await import('@/app/api/outreach/cascade-consent/route.js');

      const req = mockRequest({ action: 'approve_dm' });
      const res = await POST(req);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.to).toBe('dm_pending_review');

      // Verify update was issued
      const updates = mockSupabase.getUpdates('outreach_queue');
      const dmUpdate = updates.find(u => u._data.status === 'dm_pending_review');
      expect(dmUpdate).toBeDefined();
    });

    it('Step 5: User approves DM messages', async () => {
      mockSupabase.setResponse('outreach_queue', {
        id: 'job-3', status: 'dm_pending_review', outreach_method: 'dm',
      });
      const { POST } = await import('@/app/api/outreach/approve-messages/route.js');

      const req = mockRequest({
        approvals: [{
          job_id: 'job-3',
          dm_subject: 'Quick question about PM roles',
          dm_body: 'Hi Carol, saw you work at...',
          approved: true,
        }],
      });
      const res = await POST(req);

      expect(res.status).toBe(200);
      expect(res.body.approved_count).toBe(1);

      // Verify status updated to dm_approved
      const updates = mockSupabase.getUpdates('outreach_queue');
      const approvalUpdate = updates.find(u => u._data.status === 'dm_approved');
      expect(approvalUpdate).toBeDefined();
    });
  });

  // ── Flow C: Connect Limit → User Defers ────────────────────────

  describe('Flow C: Connect limit → Defer', () => {
    it('User defers all paused jobs', async () => {
      mockSupabase.setResponse('outreach_queue', []);
      const { POST } = await import('@/app/api/outreach/cascade-consent/route.js');

      const req = mockRequest({ action: 'defer' });
      const res = await POST(req);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body).toHaveProperty('deferred');

      // Verify deferred update
      const updates = mockSupabase.getUpdates('outreach_queue');
      const deferUpdate = updates.find(u => u._data.status === 'deferred');
      expect(deferUpdate).toBeDefined();
      expect(deferUpdate._data.result_detail).toBe('user_deferred');
      expect(deferUpdate._data.completed_at).toBeDefined();
    });
  });

  // ── Flow D: Already Connected → Auto DM Reroute ────────────────

  describe('Flow D: Already connected → DM reroute', () => {
    it('already_connected reroutes single job to dm_pending_review', async () => {
      mockSupabase.setResponse('outreach_queue', {
        id: 'job-1', recruiter_match_id: 'rm-1', status: 'processing', outreach_method: 'connect',
      });
      const { POST } = await import('@/app/api/outreach/result/route.js');

      const req = mockRequest({
        job_id: 'job-1',
        status: 'already_connected',
      });
      const res = await POST(req);

      expect(res.status).toBe(200);
      expect(res.body.cascade).toBeDefined();

      // Verify reroute update
      const updates = mockSupabase.getUpdates('outreach_queue');
      const reroute = updates.find(u =>
        u._data.status === 'dm_pending_review' &&
        u._data.outreach_method === 'dm'
      );
      expect(reroute).toBeDefined();
      expect(reroute._data.result_detail).toBe('rerouted_1st_degree');
    });
  });

  // ── Flow E: Account Restricted → Cancel All ────────────────────

  describe('Flow E: Account restricted → Cancel', () => {
    it('account_restricted cancels all pending/processing jobs', async () => {
      mockSupabase.setResponse('outreach_queue', {
        id: 'job-1', recruiter_match_id: 'rm-1', status: 'processing', outreach_method: 'connect',
      });
      const { POST } = await import('@/app/api/outreach/result/route.js');

      const req = mockRequest({
        job_id: 'job-1',
        status: 'account_restricted',
      });
      const res = await POST(req);

      expect(res.status).toBe(200);

      // Verify cancel update
      const updates = mockSupabase.getUpdates('outreach_queue');
      const cancel = updates.find(u =>
        u._data.status === 'cancelled' &&
        u._data.result_detail === 'account_restricted'
      );
      expect(cancel).toBeDefined();
    });
  });

  // ── Flow F: Email consent with mixed email availability ────────

  describe('Flow F: Email consent — mixed availability', () => {
    it('approve_email splits jobs by recruiter email availability', async () => {
      mockSupabase.setResponse('outreach_queue', [
        { id: 'job-1', recruiter_match_id: 'rm-1' },
        { id: 'job-2', recruiter_match_id: 'rm-2' },
      ]);
      mockSupabase.setResponse('recruiter_matches', [
        { id: 'rm-1', recruiters: { email: 'recruiter@co.com' } },
        { id: 'rm-2', recruiters: { email: null } },
      ]);

      const { POST } = await import('@/app/api/outreach/cascade-consent/route.js');
      const req = mockRequest({ action: 'approve_email' });
      const res = await POST(req);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body).toHaveProperty('moved');
      expect(res.body).toHaveProperty('deferred');
    });
  });
});
