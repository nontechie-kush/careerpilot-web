/**
 * POST /api/outreach/enrich
 *
 * Extension calls this after visiting any LinkedIn profile during automation.
 * Upserts recruiter_enrichment with data read from the DOM.
 * This is our Apollo-over-time play — every visit = free data point.
 *
 * Body: {
 *   recruiter_id:             string,
 *   current_title:            string,
 *   current_company:          string,
 *   location:                 string,
 *   follower_count:           number,
 *   is_premium:               boolean,
 *   open_to_messages:         boolean,
 *   accepts_connections:      boolean,
 *   connection_degree:        number,   // 1, 2, or 3
 *   mutual_connections:       [{name, profile_url}],
 *   last_activity_date:       string,   // ISO date or null
 *   profile_exists:           boolean,
 * }
 */

import { NextResponse } from 'next/server';
import { createClientFromRequest } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service-client';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    // Auth — extension must be authenticated as a user
    const supabase = await createClientFromRequest(request);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { recruiter_id } = body;
    if (!recruiter_id) return NextResponse.json({ error: 'recruiter_id required' }, { status: 400 });

    // Service client — recruiter_enrichment has no RLS
    const service = createServiceClient();

    // Check if profile_exists = false → deactivate recruiter
    if (body.profile_exists === false) {
      await service
        .from('recruiter_enrichment')
        .upsert({
          recruiter_id,
          profile_exists:      false,
          deactivated:         true,
          deactivated_reason:  'profile_not_found',
          deactivated_at:      new Date().toISOString(),
          last_enriched_at:    new Date().toISOString(),
        }, { onConflict: 'recruiter_id' });

      return NextResponse.json({ ok: true, action: 'deactivated' });
    }

    // Check company mismatch — if both title and company changed → flag
    const { data: existing } = await service
      .from('recruiter_enrichment')
      .select('current_title, current_company, enriched_by_user_count')
      .eq('recruiter_id', recruiter_id)
      .maybeSingle();

    const userCount = (existing?.enriched_by_user_count || 0) + 1;

    const enrichData = {
      recruiter_id,
      current_title:           body.current_title || existing?.current_title,
      current_company:         body.current_company || existing?.current_company,
      location:                body.location,
      follower_count:          body.follower_count,
      is_premium:              body.is_premium,
      open_to_messages:        body.open_to_messages,
      accepts_connections:     body.accepts_connections,
      connection_degree:       body.connection_degree,
      mutual_connections:      body.mutual_connections || [],
      mutual_connections_count: (body.mutual_connections || []).length,
      last_activity_date:      body.last_activity_date || null,
      profile_exists:          true,
      enriched_by_user_count:  userCount,
      last_enriched_at:        new Date().toISOString(),
    };

    await service
      .from('recruiter_enrichment')
      .upsert(enrichData, { onConflict: 'recruiter_id' });

    return NextResponse.json({ ok: true, enriched_by_user_count: userCount });
  } catch (err) {
    console.error('[outreach/enrich]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
