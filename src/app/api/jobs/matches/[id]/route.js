/**
 * GET /api/jobs/matches/[id]
 *
 * Returns a single job match by match ID for the authenticated user.
 * Automatically marks the match as "viewed" if it was "pending".
 *
 * Returns 404 if the match doesn't belong to the user (RLS guard).
 */

import { NextResponse } from 'next/server';
import { createClientFromRequest } from '@/lib/supabase/server';

export async function GET(request, props) {
  try {
    const { id } = await props.params; // Next.js 16: params is a Promise
    const supabase = await createClientFromRequest(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase
      .from('job_matches')
      .select(
        `id,
         match_score,
         match_reasons,
         gap_analysis,
         status,
         scored_at,
         viewed_at,
         jobs (
           id, title, company, company_domain,
           location, remote_type, company_stage,
           apply_url, apply_type, department,
           salary_min, salary_max, salary_currency,
           posted_at, repost_count, description, source
         )`,
      )
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      throw error;
    }

    // Mark as viewed if still pending
    if (data.status === 'pending') {
      await supabase
        .from('job_matches')
        .update({ status: 'viewed', viewed_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', user.id);
    }

    // Fetch pdf_url from the latest tailored resume for this match (non-blocking on failure)
    const { data: tailored } = await supabase
      .from('tailored_resumes')
      .select('pdf_url, pipeline_version, updated_at')
      .eq('user_id', user.id)
      .eq('match_id', id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      match: data,
      tailored_resume: tailored
        ? { pdf_url: tailored.pdf_url || null, pipeline_version: tailored.pipeline_version }
        : null,
    });
  } catch (err) {
    console.error('[jobs/matches/[id]]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
