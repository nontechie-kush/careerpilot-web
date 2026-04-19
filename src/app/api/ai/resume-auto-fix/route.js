/**
 * POST /api/ai/resume-auto-fix
 *
 * Body: { tailored_resume_id: string }
 *
 * Triggered when a user hits "Skip — just generate PDF" on the analysis screen.
 * Pilot picks the highest-impact gaps (using gap analysis already cached on the
 * tailored_resumes record) and rewrites bullets/summary in-place. The output is
 * a list of `accepted_changes` in the same shape the existing
 * /api/ai/resume-apply-changes endpoint already consumes.
 *
 * This route does NOT mutate tailored_version itself — the caller is expected
 * to pipe the returned changes through resume-apply-changes for that.
 *
 * Returns: { changes: [{action, section, entry_id, bullet_id, before, after}] }
 */

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClientFromRequest } from '@/lib/supabase/server';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You are Pilot, a resume editor. The user clicked "just generate it" — they trust you to apply the highest-impact fixes from the gap analysis without further input.

You'll receive:
- The user's structured resume (JSON with experience entries and bullet IDs)
- The gap analysis for the target job (missing signals, weak bullets, suggestions)
- The job context

Pick 3-6 changes that close the BIGGEST gaps with content the user has already proven they could honestly claim (i.e. don't fabricate experience the resume gives no signal of). Output a JSON array of changes the apply-changes engine can execute.

CHANGE SHAPES — exactly one of these per item:

1. Replace an existing bullet (rewrite for impact / inject missing keyword the user already has):
   { "action": "replace", "section": "experience", "entry_id": "exp_001", "bullet_id": "b_003", "before": "<original bullet text>", "after": "<rewritten bullet>" }

2. Add a new bullet to an existing role:
   { "action": "add", "section": "experience", "entry_id": "exp_001", "after": "<new bullet text>" }

3. Rewrite the summary:
   { "action": "replace", "section": "summary", "before": "<original summary or empty>", "after": "<new 2-3 sentence summary>" }

RULES
- Use the EXACT entry_id and bullet_id from the resume JSON. Never invent IDs.
- Each "after" bullet must be one tight sentence with a metric or a concrete artifact when possible.
- Do not invent experience. If the gap is "no Python" and the resume has no Python signal, skip that gap rather than lying.
- Do not duplicate content already in the resume.
- 3-6 changes total. Quality over volume.
- Return ONLY valid JSON. No prose, no fences. Shape: { "changes": [...] }`;

export async function POST(request) {
  try {
    const supabase = await createClientFromRequest(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { tailored_resume_id } = await request.json();
    if (!tailored_resume_id) {
      return NextResponse.json({ error: 'tailored_resume_id required' }, { status: 400 });
    }

    const { data: tailored } = await supabase
      .from('tailored_resumes')
      .select('id, match_id, tailored_version, changes')
      .eq('id', tailored_resume_id)
      .eq('user_id', user.id)
      .single();

    if (!tailored) {
      return NextResponse.json({ error: 'Tailored resume not found' }, { status: 404 });
    }

    // Gap analysis is cached on changes._gap_analysis (see resume-gap-analysis route).
    const gapAnalysis = tailored.changes?._gap_analysis || null;

    let jobContext = { title: '', company: '', description: '' };
    if (tailored.match_id) {
      const { data: matchRow } = await supabase
        .from('job_matches')
        .select('jobs(title, company, description)')
        .eq('id', tailored.match_id)
        .maybeSingle();
      if (matchRow?.jobs) {
        jobContext = {
          title: matchRow.jobs.title || '',
          company: matchRow.jobs.company || '',
          description: (matchRow.jobs.description || '').slice(0, 4000),
        };
      }
    }

    const userPayload = {
      resume: tailored.tailored_version,
      gap_analysis: gapAnalysis,
      job: jobContext,
    };

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2500,
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: `Resume + gap analysis + target job:\n\n${JSON.stringify(userPayload, null, 2)}\n\nReturn { "changes": [...] } with 3-6 items.`,
      }],
    });

    const raw = msg.content[0].text
      .trim()
      .replace(/^```(?:json)?\n?/, '')
      .replace(/\n?```$/, '');

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error('[resume-auto-fix] JSON parse failed:', raw.slice(0, 300));
      return NextResponse.json({ error: 'Auto-fix output malformed' }, { status: 500 });
    }

    const changes = Array.isArray(parsed.changes) ? parsed.changes : [];

    // Sanitize: drop changes referencing IDs that don't exist in the resume.
    const validIds = new Set();
    const validBulletIds = new Set();
    for (const exp of tailored.tailored_version?.experience || []) {
      if (exp.id) validIds.add(exp.id);
      for (const b of exp.bullets || []) if (b.id) validBulletIds.add(b.id);
    }

    const safeChanges = changes.filter((c) => {
      if (!c || typeof c !== 'object') return false;
      if (c.section === 'summary') return typeof c.after === 'string' && c.after.length > 0;
      if (c.section !== 'experience') return false;
      if (c.action === 'replace') {
        return validBulletIds.has(c.bullet_id) && typeof c.after === 'string' && c.after.length > 0;
      }
      if (c.action === 'add') {
        return validIds.has(c.entry_id) && typeof c.after === 'string' && c.after.length > 0;
      }
      return false;
    });

    return NextResponse.json({ changes: safeChanges });
  } catch (err) {
    console.error('[resume-auto-fix]', err);
    return NextResponse.json({ error: err.message || 'Auto-fix failed' }, { status: 500 });
  }
}
