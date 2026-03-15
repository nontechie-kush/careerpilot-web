/**
 * Quick scraper test — runs each scraper, takes first 3 results, attempts DB upsert.
 * Usage: node --experimental-loader ./scripts/alias-loader.mjs scripts/test-scraper.mjs [scraper-name]
 * Examples:
 *   node --experimental-loader ./scripts/alias-loader.mjs scripts/test-scraper.mjs          # all
 *   node --experimental-loader ./scripts/alias-loader.mjs scripts/test-scraper.mjs ashby    # one
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Load .env.local
const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dir, '../.env.local');
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const [k, ...v] = line.split('=');
  if (k && !k.startsWith('#') && v.length) process.env[k.trim()] = v.join('=').trim();
}

import { createServiceClient } from '@/lib/supabase/service-client';
import { upsertJobs } from '@/lib/scrapers/index';
import { scrapeAshby }    from '@/lib/scrapers/ashby';
import { scrapeCutshort } from '@/lib/scrapers/cutshort';
import { scrapeFoundit }  from '@/lib/scrapers/foundit';
import { scrapeHirect }   from '@/lib/scrapers/hirect';
import { scrapeIIMJobs }  from '@/lib/scrapers/iimjobs';
import { scrapeInstahyre } from '@/lib/scrapers/instahyre';

const SCRAPERS = {
  ashby:       scrapeAshby,
  cutshort:    scrapeCutshort,
  foundit:     scrapeFoundit,
  hirect:      scrapeHirect,
  iimjobs:     scrapeIIMJobs,
  instahyre:   scrapeInstahyre,
};

const LIMIT = 3;
const target = process.argv[2];
const toRun = target ? { [target]: SCRAPERS[target] } : SCRAPERS;

if (target && !SCRAPERS[target]) {
  console.error(`Unknown scraper: ${target}. Options: ${Object.keys(SCRAPERS).join(', ')}`);
  process.exit(1);
}

const supabase = createServiceClient();
const results = [];

for (const [name, fn] of Object.entries(toRun)) {
  process.stdout.write(`[${name}] running... `);
  try {
    const jobs = await fn();
    const sample = jobs.slice(0, LIMIT);
    if (sample.length === 0) {
      console.log(`0 jobs returned ⚠`);
      results.push({ name, jobs: 0, status: 'empty' });
      continue;
    }
    const { inserted, updated, errors } = await upsertJobs(supabase, sample);
    const status = errors === 0 ? '✓' : '✗';
    console.log(`${jobs.length} jobs → sample ${sample.length}: inserted=${inserted} updated=${updated} errors=${errors} ${status}`);
    results.push({ name, jobs: jobs.length, inserted, updated, errors, status: errors === 0 ? 'ok' : 'error' });
  } catch (err) {
    console.log(`CRASHED: ${err.message} ✗`);
    results.push({ name, jobs: 0, status: 'crash' });
  }
}

console.log('\n── Summary ──────────────────────────');
for (const r of results) {
  const icon = r.status === 'ok' ? '✓' : r.status === 'empty' ? '⚠' : '✗';
  console.log(`${icon} ${r.name.padEnd(12)} ${r.jobs ?? 0} jobs`);
}
