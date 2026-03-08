/**
 * GET /api/cron/scrape-naukri
 *
 * Dedicated Naukri scrape endpoint — runs separately from scrape-jobs.
 * Naukri needs ScraperAPI render=true (~40s per cluster) and can't share
 * the 300s budget with Greenhouse/Lever/Ashby. Runs daily at 00:30 UTC.
 *
 * Protected by x-cron-secret middleware + Authorization: Bearer header.
 */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { scrapeNaukri } from '@/lib/scrapers/naukri';
import { upsertJobs } from '@/lib/scrapers/index';
import { withCircuitBreaker } from '@/lib/circuit-breaker';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  const expectedSecret = process.env.CRON_SECRET;

  if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const supabase = createServiceClient();

  try {
    // Fetch active users to build preference-driven clusters
    let activeUsers = [];
    try {
      const { data } = await supabase
        .from('users')
        .select('target_roles, locations, remote_pref, profiles(parsed_json)')
        .eq('onboarding_completed', true)
        .limit(200);
      activeUsers = data || [];
    } catch (err) {
      console.warn('[scrape-naukri] could not fetch users — using default clusters:', err.message);
    }

    console.log(`[scrape-naukri] starting with ${activeUsers.length} users`);

    // Cap at 5 clusters — each render=true call takes ~40s, 5×40=200s fits 300s budget
    const cbResult = await withCircuitBreaker('naukri', () => scrapeNaukri(activeUsers, { maxClusters: 5 }));

    if (cbResult?.skipped) {
      return NextResponse.json({ skipped: true, reason: cbResult.reason });
    }
    if (cbResult?.error) {
      return NextResponse.json({ error: cbResult.error }, { status: 500 });
    }

    const jobs = cbResult || [];
    const { inserted, updated } = await upsertJobs(supabase, jobs);

    const summary = {
      duration_ms: Date.now() - startedAt,
      scraped: jobs.length,
      inserted,
      updated,
    };

    console.log('[scrape-naukri] done:', JSON.stringify(summary));
    return NextResponse.json(summary);
  } catch (err) {
    console.error('[scrape-naukri] fatal error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
