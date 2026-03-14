/**
 * YC Work at a Startup scraper
 *
 * workatastartup.com is a React SPA — jobs are loaded via API after JS renders.
 * Direct fetch returns an empty shell with no job data in __NEXT_DATA__.
 *
 * Strategy: ScraperAPI render=true fetches the JS-rendered page, then Cheerio
 * parses job cards from the rendered HTML.
 *
 * Falls back to direct fetch attempt (works occasionally in non-bot-detection mode).
 * Skips gracefully if SCRAPERAPI_KEY is missing or placeholder.
 *
 * Pages: /jobs?role=pm, /jobs?role=eng — enough to get 80–200 relevant jobs.
 */

import { load } from 'cheerio';
import { stripHtml, detectRemote, makeDescHash } from './index';

const BASE_URL   = 'https://www.workatastartup.com';
const SCRAPER_API = 'https://api.scraperapi.com';
const sleep       = (ms) => new Promise((r) => setTimeout(r, ms));

// Role pages to scrape — 2 pages = 20 ScraperAPI credits
const ROLE_PAGES = [
  `${BASE_URL}/jobs?role=pm&role=designer&role=operations&limit=100`,
  `${BASE_URL}/jobs?role=eng&role=data&limit=100`,
];

export async function scrapeYC() {
  const key = process.env.SCRAPERAPI_KEY;
  if (!key || key === 'placeholder') {
    console.log('[yc] no SCRAPERAPI_KEY — skipping');
    return [];
  }

  const seen = new Set();
  const all  = [];

  for (const targetUrl of ROLE_PAGES) {
    try {
      const jobs = await fetchRenderedPage(key, targetUrl);
      for (const job of jobs) {
        if (!seen.has(job.description_hash)) {
          seen.add(job.description_hash);
          all.push(job);
        }
      }
      await sleep(2000); // be polite + allow ScraperAPI queue to settle
    } catch (err) {
      console.warn(`[yc] page failed: ${err.message}`);
    }
  }

  console.log(`[yc] scraped ${all.length} unique jobs`);
  return all;
}

async function fetchRenderedPage(apiKey, targetUrl) {
  const url = `${SCRAPER_API}?api_key=${apiKey}&url=${encodeURIComponent(targetUrl)}&render=true&wait=3000`;
  const res = await fetch(url, { signal: AbortSignal.timeout(45000) });

  if (!res.ok) throw new Error(`ScraperAPI HTTP ${res.status}`);
  const html = await res.text();

  // First try: look for __NEXT_DATA__ in the rendered page (may be populated post-render)
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]+?)<\/script>/);
  if (match) {
    try {
      const d = JSON.parse(match[1]);
      const jobs = extractFromNextData(d);
      if (jobs.length > 0) return jobs;
    } catch { /* fall through */ }
  }

  // Second try: parse rendered job cards from HTML
  return extractFromHTML(load(html));
}

function extractFromNextData(d) {
  const pageProps = d?.props?.pageProps;
  if (!pageProps) return [];

  // Walk all possible locations the job list might be
  const candidates = [
    pageProps?.roles,
    pageProps?.jobs,
    pageProps?.companyRoles,
    pageProps?.data?.roles,
    pageProps?.data?.jobs,
  ];
  for (const arr of candidates) {
    if (Array.isArray(arr) && arr.length > 0) {
      return arr.flatMap(normalizeNextDataJob).filter(Boolean);
    }
  }
  return [];
}

function normalizeNextDataJob(job) {
  try {
    const title = (job.title || '').trim();
    const company = (job.company?.name || job.companyName || '').trim();
    if (!title || !company) return null;

    const location = job.location || (job.remoteOk ? 'Remote' : 'San Francisco, CA');
    const desc = stripHtml(job.description || '');
    const domain = job.company?.url ? extractDomain(job.company.url) : null;

    return buildJob({ title, company, domain, location, desc, remoteOk: job.remoteOk,
      id: job.id || job.slug, applyUrl: job.url, batch: job.company?.batch });
  } catch { return null; }
}

function extractFromHTML($) {
  const jobs = [];

  // YC Work at a Startup renders role cards with specific data attributes
  // Common patterns: data-role-id, [class*="role"], [class*="job-row"]
  const selectors = [
    '[data-role-id]',
    '[class*="role-card"]',
    '[class*="job-row"]',
    '[class*="JobCard"]',
    'li[class*="role"]',
    'div[class*="company-role"]',
  ];

  const container = selectors.reduce((acc, sel) => {
    if (acc.length > 0) return acc;
    return $(sel);
  }, $());

  container.each((_, el) => {
    const $el = $(el);
    const title = $el.find('[class*="title"], [class*="role-title"], h2, h3').first().text().trim();
    const company = $el.find('[class*="company-name"], [class*="company"]').first().text().trim();
    if (!title || !company) return;

    const location = $el.find('[class*="location"]').first().text().trim() || 'Remote';
    const href = $el.find('a[href*="/jobs/"], a[href*="/role/"]').first().attr('href');
    const applyUrl = href?.startsWith('http') ? href : href ? `${BASE_URL}${href}` : `${BASE_URL}/jobs`;
    const desc = stripHtml($el.text()).slice(0, 2000);

    jobs.push(buildJob({ title, company, domain: null, location, desc,
      remoteOk: location.toLowerCase().includes('remote'),
      id: applyUrl, applyUrl, batch: null }));
  });

  return jobs;
}

function buildJob({ title, company, domain, location, desc, remoteOk, id, applyUrl, batch }) {
  return {
    source:           'yc',
    external_id:      String(id || `${company}-${title}`),
    title,
    company,
    company_domain:   domain,
    description:      desc.slice(0, 8000),
    requirements:     [],
    location:         location || 'Remote',
    remote_type:      detectRemote(location + (remoteOk ? ' remote' : '')),
    apply_url:        applyUrl || `${BASE_URL}/jobs`,
    apply_type:       'external',
    department:       null,
    company_stage:    batch ? 'series_a' : 'seed', // YC-backed = early-stage
    posted_at:        null,
    salary_min:       null,
    salary_max:       null,
    salary_currency:  'USD',
    description_hash: makeDescHash(company, title, desc),
    is_active:        true,
  };
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}
