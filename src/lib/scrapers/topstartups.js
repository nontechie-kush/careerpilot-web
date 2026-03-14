/**
 * TopStartups.io scraper — DISABLED
 *
 * Site is fully JS-rendered; class-name selectors broke with their redesign.
 * Job volume is thin (~20–30 jobs) and covered by YC + Ashby (better quality).
 * Re-enable if they expose a JSON feed or __NEXT_DATA__ with jobs.
 */

export async function scrapeTopStartups() {
  console.log('[topstartups] scraper disabled — covered by YC + Ashby');
  return [];
}
