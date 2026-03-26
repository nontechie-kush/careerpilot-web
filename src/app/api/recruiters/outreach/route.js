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

    // Fetch user profile + prefs + enrichment (mutual connections)
    const [{ data: userRow }, { data: profile }, { data: enrichment }] = await Promise.all([
      supabase.from('users')
        .select('locations, target_roles, ic_or_lead, name, pilot_mode')
        .eq('id', user.id)
        .maybeSingle(),
      supabase.from('profiles')
        .select('parsed_json')
        .eq('user_id', user.id)
        .order('parsed_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('recruiter_enrichment')
        .select('mutual_connections, mutual_connections_count')
        .eq('recruiter_id', match.recruiters.id)
        .maybeSingle(),
    ]);

    const userProfile = profile?.parsed_json
      ? profile
      : { parsed_json: { name: userRow?.name || '', seniority: 'experienced', years_exp: 5 } };

    const mutualConnections = enrichment?.mutual_connections || [];

    const prompt = buildOutreachPrompt(
      userProfile,
      userRow,
      match.recruiters,
      userRow?.pilot_mode || 'steady',
      mutualConnections,
    );

    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not set');
    }

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: 'You output only valid JSON. No markdown, no code fences, no commentary. Just the JSON object.',
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = response.content[0]?.text?.trim() || '';
    // Strip markdown code fences if Claude wrapped the JSON
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Last resort: extract the first {...} block
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch {}
      }
      if (!parsed) throw new Error(`Claude returned malformed JSON: ${raw.slice(0, 100)}`);
    }

    const { connection_note, dm_subject, dm_body } = parsed;
    if (!connection_note || !dm_body) throw new Error('Claude returned incomplete draft');

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
