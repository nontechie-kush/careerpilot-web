/**
 * Ashby scraper — ScraperAPI renders jobs.ashbyhq.com/{slug}, parse stable CSS classes.
 *
 * Ashby's posting-public.list API now requires auth (401 for all orgs as of Mar 2026).
 * Their job board SPA (Vite) renders job cards with stable Ashby-prefixed CSS classes:
 *   .ashby-job-posting-brief-title   — job title
 *   .ashby-job-posting-brief-details — "Department • Location • Type • Remote"
 *
 * Each company = 1 ScraperAPI credit (render=true).
 * 15 companies × 4 runs/day = 60 credits/day.
 */

import { load } from 'cheerio';
import { detectRemote, makeDescHash } from './index';

// Top 15 companies by relevance — PM + tech roles most likely
const COMPANIES = [
  // AI / frontier
  ['anthropic', 'Anthropic', 'anthropic.com'],
  ['openai',    'OpenAI',    'openai.com'],
  ['perplexity-ai', 'Perplexity AI', 'perplexity.ai'],
  ['scale-ai',  'Scale AI',  'scale.com'],
  ['runway',    'Runway ML', 'runwayml.com'],
  // Dev tools / infra
  ['linear',    'Linear',    'linear.app'],
  ['vercel',    'Vercel',    'vercel.com'],
  ['replit',    'Replit',    'replit.com'],
  ['posthog',   'PostHog',   'posthog.com'],
  ['raycast',   'Raycast',   'raycast.com'],
  // Fintech / growth
  ['ramp',      'Ramp',      'ramp.com'],
  ['cursor',    'Cursor',    'cursor.com'],
  // India — modern startups on Ashby
  ['smallcase', 'Smallcase', 'smallcase.com'],
  ['fi-money',  'Fi',        'fi.money'],
  ['setu',      'Setu',      'setu.co'],
];

const SCRAPER_API = 'https://api.scraperapi.com';
const BASE        = 'https://jobs.ashbyhq.com';
const sleep       = (ms) => new Promise((r) => setTimeout(r, ms));

export async function scrapeAshby() {
  const scraperKey = process.env.SCRAPERAPI_KEY;
  if (!scraperKey || scraperKey === 'placeholder') {
    console.log('[ashby] no SCRAPERAPI_KEY — skipping');
    return [];
  }

  const jobs = [];

  for (const [slug, company, domain] of COMPANIES) {
    try {
      const targetUrl = `${BASE}/${slug}`;
      const proxyUrl  = `${SCRAPER_API}?api_key=${scraperKey}&url=${encodeURIComponent(targetUrl)}&render=true&wait=4000`;

      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(60000) });
      if (!res.ok) {
        console.warn(`[ashby] ${slug}: HTTP ${res.status}`);
        await sleep(500);
        continue;
      }

      const html = await res.text();
      const $ = load(html);
      const parsed = extractAshbyJobs($, slug, company, domain);
      jobs.push(...parsed);

      console.log(`[ashby] ${slug}: ${parsed.length} jobs`);
      await sleep(500);
    } catch (err) {
      console.warn(`[ashby] ${slug}: ${err.message}`);
    }
  }

  console.log(`[ashby] total: ${jobs.length} jobs`);
  return jobs;
}

function extractAshbyJobs($, slug, company, domain) {
  const jobs = [];

  // Ashby renders job cards with stable prefixed class names — reliable across deploys
  $('a[href*="/' + slug + '/"]').each((_, el) => {
    const $el   = $(el);
    const title = $el.find('.ashby-job-posting-brief-title').text().trim();
    if (!title) return;

    const details  = $el.find('.ashby-job-posting-brief-details p').text().trim();
    // details format: "Department • Location • Full time • Remote"
    const parts    = details.split('•').map((s) => s.trim());
    const location = parts[1] || 'Unknown';
    const isRemote = details.toLowerCase().includes('remote');

    const href   = $el.attr('href') || '';
    const jobId  = href.split('/').filter(Boolean).pop() || href;
    const applyUrl = href.startsWith('http') ? href : `${BASE}${href}`;
    const desc   = `${title} at ${company} — ${details}`;

    jobs.push({
      source:           'ashby',
      external_id:      jobId,
      title,
      company,
      company_domain:   domain,
      description:      desc,
      requirements:     [],
      location,
      remote_type:      detectRemote(location + (isRemote ? ' remote' : '')),
      apply_url:        applyUrl,
      apply_type:       'ashby',
      department:       parts[0] || null,
      company_stage:    null,
      posted_at:        null,
      salary_min:       null,
      salary_max:       null,
      salary_currency:  'USD',
      description_hash: makeDescHash(company, title, desc),
    });
  });

  return jobs;
}
