/**
 * POST /api/onboarding/save-preferences
 *
 * Body: { profile: ParsedProfile, preferences: { locations[], india_states[], work_style, ic_or_lead, target_roles[] } }
 *
 * Saves parsed profile + user preferences to Supabase.
 * Marks onboarding_completed = true.
 * Triggers async job match (Phase 3 — no-op placeholder for now).
 */

import { NextResponse } from 'next/server';
import { createClientFromRequest } from '@/lib/supabase/server';

// Store region labels only — scrapers decide how to query per-source.
// Don't expand India → 7 cities here; Naukri uses location=india for pan-India search.
const LOCATION_MAP = {
  india:     ['India'],
  usa:       ['United States'],
  canada:    ['Canada'],
  uk:        ['United Kingdom'],
  europe:    ['Europe'],
  thailand:  ['Thailand'],
  china:     ['China'],
  anywhere:  ['Anywhere'],
};

// Schema CHECK: remote_pref IN ('remote_only','hybrid','onsite_ok','open')
// work_style from onboarding UI is explicit user intent; fall back to location inference if absent
const WORK_STYLE_MAP = {
  remote:  'remote_only',
  hybrid:  'hybrid',
  onsite:  'onsite_ok',
  open:    'open',
};

// Schema CHECK: ic_or_lead IN ('ic','lead','either')
const IC_LEAD_MAP = {
  ic: 'ic',
  lead: 'lead',
  both: 'either',
};

export async function POST(request) {
  try {
    const supabase = await createClientFromRequest(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { profile, preferences } = await request.json();

    // locations is now an array (multi-select)
    const selectedLocs = Array.isArray(preferences?.locations) && preferences.locations.length > 0
      ? preferences.locations
      : ['remote'];
    const ic_or_lead = IC_LEAD_MAP[preferences?.ic_or_lead] || 'either';

    // Merge all selected location label arrays
    const mergedLocations = [...new Set(selectedLocs.flatMap((loc) => LOCATION_MAP[loc] || []))];
    const remote_pref = WORK_STYLE_MAP[preferences?.work_style] || 'open';

    // India state/city filter — stored for Naukri fine-grained search
    const indiaStates = Array.isArray(preferences?.india_states) && preferences.india_states.length > 0
      ? preferences.india_states
      : null;

    // Use explicit target_roles from user input — never infer from CV title
    const target_roles = Array.isArray(preferences?.target_roles) && preferences.target_roles.length > 0
      ? preferences.target_roles.slice(0, 3)
      : (profile?.title ? [profile.title] : []); // fallback only if user skipped (shouldn't happen)

    const updatePayload = {
      target_roles,
      locations: mergedLocations.length > 0 ? mergedLocations : ['Remote'],
      remote_pref,
      ic_or_lead,
      onboarding_completed: true,
      onboarding_step: 3,
      search_day_count: 1,
      last_active_at: new Date().toISOString(),
    };

    // Capture name from parsed CV (signup no longer collects name)
    if (profile?.name) updatePayload.name = profile.name;

    const { error } = await supabase
      .from('users')
      .update(updatePayload)
      .eq('id', user.id);

    if (error) throw error;

    // Save India state/city preferences if selected (fire-and-forget — column may not exist yet)
    if (indiaStates) {
      supabase.from('users')
        .update({ india_states: indiaStates })
        .eq('id', user.id)
        .then(() => {});
    }

    // Save job_search_titles to profiles if present (fire-and-forget, non-blocking)
    if (profile?.job_search_titles) {
      supabase.from('profiles')
        .update({ job_search_titles: profile.job_search_titles })
        .eq('user_id', user.id)
        .then(() => {});
    }

    // Phase 3: trigger async job matching (fire-and-forget, service-to-service)
    if (process.env.NEXT_PUBLIC_APP_URL) {
      fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/jobs/match`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.CRON_SECRET}`,
        },
        body: JSON.stringify({ user_id: user.id }),
      }).catch(() => {});
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[save-preferences]', err);
    return NextResponse.json({ error: 'Failed to save preferences' }, { status: 500 });
  }
}
