# Cron Ownership

This project intentionally uses **two schedulers**:

1. **Vercel Cron** for app-level background tasks exposed as Next.js routes.
2. **GitHub Actions** for heavier data pipelines (scraping + matching) run from workflows.

This split is the source of truth and is **not** config drift.

## Vercel Cron (configured in `vercel.json`)

File: `vercel.json`

- `/api/cron/culture-refresh` — `0 2 * * *`
- `/api/cron/flywheel` — `0 3 * * 0`
- `/api/cron/notify` — `0 9 * * *`
- `/api/cron/gmail-sync` — `0 10 * * *`

## GitHub Actions Cron (configured in `.github/workflows`)

- `.github/workflows/scrape.yml`
  - schedule: `0 0,6,12,18 * * *`
  - runs scraper pipeline (`scripts/run-scrapers.mjs`)

- `.github/workflows/match.yml`
  - schedule: `0 1,7,13,19 * * *`
  - also runs on successful completion of `Scrape Jobs`
  - runs matcher pipeline (`scripts/run-matcher.mjs`)

## Why this split exists

- Scraping and matching are longer-running and dependency-heavy, so they run more reliably in GitHub Actions runners.
- User-facing operational tasks stay close to the deployed app via Vercel cron routes.

## Maintenance rule

When adding or changing scheduled jobs, update this file in the same PR so ownership stays explicit.
