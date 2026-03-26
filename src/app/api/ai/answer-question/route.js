/**
 * POST /api/ai/answer-question
 *
 * Body: { match_id: string, question: string }
 *
 * Real-time answering of a single application form question.
 * User pastes the actual question from the portal form into the Pilot Kit
 * (DPIP window or main sheet), we generate a targeted, specific answer.
 *
 * Returns: { answer: string }
 */

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClientFromRequest } from '@/lib/supabase/server';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request) {
  try {
    const supabase = await createClientFromRequest(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { match_id, question } = await request.json();
    if (!match_id) return NextResponse.json({ error: 'match_id required' }, { status: 400 });
    if (!question?.trim()) return NextResponse.json({ error: 'question required' }, { status: 400 });

    // Fetch job + profile + user mode in parallel
    const [{ data: match }, { data: profileRow }, { data: userRow }] = await Promise.all([
      supabase
        .from('job_matches')
        .select(`
          id,
          jobs ( id, title, company, description )
        `)
        .eq('id', match_id)
        .eq('user_id', user.id)
        .single(),
      supabase
        .from('profiles')
        .select('parsed_json')
        .eq('user_id', user.id)
        .order('parsed_at', { ascending: false })
        .maybeSingle(),
      supabase
        .from('users')
        .select('pilot_mode')
        .eq('id', user.id)
        .maybeSingle(),
    ]);

    if (!match?.jobs) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    const job = match.jobs;
    const p = profileRow?.parsed_json || {};
    const name = p.name || 'the candidate';
    const title = p.title || '';
    const skills = (p.skills || []).slice(0, 6).join(', ') || '';
    const strongest = p.strongest_card || '';
    const yearsExp = p.years_exp ? `${p.years_exp} years` : '';
    const recentCompany = (p.companies || [])[0] || '';
    const descExcerpt = (job.description || '').replace(/<[^>]+>/g, ' ').slice(0, 600);

    const PILOT_MODES = {
      steady:     'Calm, methodical. Minimal words. Just clarity.',
      coach:      'Encouraging and tactical. Help them see their strength.',
      hype:       'Confident, high-energy. Make them sound capable and ready.',
      unfiltered: 'Brutally honest. No sugarcoating. Say exactly what the answer needs to say.',
    };
    const pilotMode = userRow?.pilot_mode || 'steady';
    const modeDesc = PILOT_MODES[pilotMode] || PILOT_MODES.steady;

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 350,
      temperature: 0.7,
      system: `You are Pilot — a job application assistant writing in first person as the candidate.
Be specific and concrete. 2–4 sentences max. Never say "passionate", "excited to join", or "I believe".
Use actual experience and skills from the candidate profile. No filler. Return plain text — no JSON, no markdown.
Current mode: ${pilotMode} — ${modeDesc}`,
      messages: [
        {
          role: 'user',
          content: `Answer this application form question for a ${job.title} role at ${job.company}.

QUESTION: "${question.trim()}"

CANDIDATE:
- Name: ${name}
- Current/recent role: ${title} at ${recentCompany}
- Top skills: ${skills}
- Strongest card: ${strongest}
- Experience: ${yearsExp}

ROLE CONTEXT (from job description):
${descExcerpt}

Write a concise, specific answer in first person. Reference actual skills or experience from the profile. 2–4 sentences.`,
        },
      ],
    });

    const answer = message.content[0].text.trim();

    return NextResponse.json({ answer });
  } catch (err) {
    console.error('[answer-question]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
