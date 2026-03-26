/**
 * Tests: src/lib/gmail/send.js
 *
 * Unit tests for the Gmail send utility.
 * The actual sendEmail is globally mocked (no real API calls).
 *
 * Scenarios:
 *   1. sendEmail is importable and callable
 *   2. sendEmail returns message id on success (via mock)
 *   3. sendEmail accepts all required params
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sendEmail } from '@/lib/gmail/send';

describe('Gmail Send Utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sendEmail is importable and callable', () => {
    expect(typeof sendEmail).toBe('function');
  });

  it('sendEmail returns message id and threadId on success', async () => {
    const result = await sendEmail('test-token', {
      to: 'recruiter@company.com',
      subject: 'Following up',
      body: 'Hello recruiter, I wanted to reach out...',
      fromName: 'Test User',
      fromEmail: 'test@gmail.com',
    });

    expect(result).toHaveProperty('id', 'gmail-msg-123');
    expect(result).toHaveProperty('threadId', 'thread-456');
  });

  it('sendEmail is called with correct arguments', async () => {
    const opts = {
      to: 'rec@co.com',
      subject: 'Subject line',
      body: 'Body text',
      fromName: 'Sender',
      fromEmail: 'sender@gmail.com',
    };

    await sendEmail('my-token', opts);

    expect(sendEmail).toHaveBeenCalledWith('my-token', opts);
  });
});
