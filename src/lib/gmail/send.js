/**
 * Gmail send utility — sends email on behalf of the user via Gmail API.
 *
 * Uses the user's own Gmail account (access_token from gmail_tokens table).
 * Emails come FROM the user's address, not from CareerPilot.
 *
 * Requires gmail.send scope (added alongside gmail.readonly).
 */

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

/**
 * Build a raw RFC 2822 email message and Base64url-encode it.
 */
function buildRawEmail({ to, subject, body, fromName, fromEmail }) {
  const lines = [
    `From: ${fromName ? `${fromName} <${fromEmail}>` : fromEmail}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    body,
  ];
  const raw = lines.join('\r\n');
  // Base64url encode (Node Buffer → base64 → url-safe)
  return Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Send an email via Gmail API.
 *
 * @param {string} accessToken  — valid Gmail access token with gmail.send scope
 * @param {object} opts
 * @param {string} opts.to        — recipient email
 * @param {string} opts.subject   — email subject
 * @param {string} opts.body      — plain text body
 * @param {string} opts.fromName  — sender display name (optional)
 * @param {string} opts.fromEmail — sender email (optional, Gmail uses authenticated user)
 * @returns {{ id: string, threadId: string }} — Gmail message metadata
 */
export async function sendEmail(accessToken, { to, subject, body, fromName, fromEmail }) {
  const raw = buildRawEmail({ to, subject, body, fromName, fromEmail });

  const res = await fetch(`${GMAIL_API}/messages/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail send failed (${res.status}): ${err}`);
  }

  return res.json();
  // Returns: { id, threadId, labelIds }
}
