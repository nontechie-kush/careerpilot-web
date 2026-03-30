/**
 * POST /api/recruiters/outreach
 *
 * Generates (or returns cached) Claude-drafted outreach for a recruiter match.
 * Returns three formats used by the automation flow:
 *   connection_note  — ≤200 chars for LinkedIn connect request
 *   dm_subject       — subject if falling back to DM
 *   dm_body          — full message body
 *
 * Body: { match_id }
 * Returns: { connection_note, dm_subject, dm_body, cached }
 */

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClientFromRequest } from '@/lib/supabase/server';
import { buildOutreachPrompt } from '@/lib/ai/prompts/draft-outreach';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request) {
  try {
    const supabase = await createClientFromRequest(request);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { match_id } = await request.json();
    if (!match_id) return NextResponse.json({ error: 'match_id is required' }, { status: 400 });

    // Fetch match + recruiter
    const { data: match, error: matchError } = await supabase
      .from('recruiter_matches')
      .select(`
        id, outreach_draft, user_id,
        recruiters!inner (
          id, name, title, current_company, specialization,
          geography, placements_at, response_rate, linkedin_url
        )
      `)
      .eq('id', match_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (matchError) throw new Error(`Match query failed: ${matchError.message}`);
    if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });

    // Return cached draft if available (parse stored JSON)
    if (match.outreach_draft) {
      try {
        const cached = JSON.parse(match.outreach_draft);
        if (cached.connection_note) {
          return NextResponse.json({ ...cached, cached: true });
        }
      } catch {
        // Old format (plain string) — regenerate below
      }
    }

    // TODO: re-enable Claude-generated messages when ready.
    // Using a fixed default message for now to avoid API costs during testing.
    const connection_note = 'Hi, It would be great to connect. Regards Kushendra';
    const dm_subject = 'Connecting on LinkedIn';
    const dm_body = 'Hi, It would be great to connect. Regards Kushendra';

    // Enforce 200 char hard limit on connection_note
    const safeNote = connection_note.slice(0, 200);

    const result = { connection_note: safeNote, dm_subject: dm_subject || '', dm_body };

    // Cache as JSON string in outreach_draft column
    await supabase
      .from('recruiter_matches')
      .update({ outreach_draft: JSON.stringify(result) })
      .eq('id', match_id)
      .eq('user_id', user.id);

    return NextResponse.json({ ...result, cached: false });
  } catch (err) {
    console.error('[recruiters/outreach]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
