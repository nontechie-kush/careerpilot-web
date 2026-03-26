# Changelog

All notable changes to CareerPilot are documented here.
Format: [Semantic Versioning](https://semver.org/) — `MAJOR.MINOR.PATCH`

---

## [1.0.0] — 2026-03-22

### Summary
First versioned release. Establishes baseline for all existing features + the new Universal Cascading Outreach system.

### Added — Cascading Outreach (Phase 1 + 2)
- **State machine**: Connect → DM → Email → Wait with user consent at each transition
- **New API routes**:
  - `POST /api/outreach/cascade-consent` — user consents to switch outreach method
  - `POST /api/outreach/approve-messages` — per-job DM/email approval with content editing
  - `POST /api/outreach/send-email` — sends email via user's Gmail account
- **Modified API routes** (cascade logic):
  - `POST /api/outreach/result` — `limit_hit` pauses remaining jobs (not cancels), `already_connected` reroutes to DM
  - `GET /api/outreach/pending` — picks up `dm_approved` jobs alongside `pending`
  - `POST /api/outreach/queue` — accepts `outreach_method` per job, generates `batch_id`
  - `GET /api/outreach/queue-status` — returns cascade state counts
- **Gmail send capability**:
  - Added `gmail.send` scope to OAuth flow (`src/lib/gmail/client.js`)
  - New `src/lib/gmail/send.js` — RFC 2822 message builder + Gmail API send
- **CascadeConsentSheet component** — 5 screens:
  - Connect limit hit → "Switch to DMs?"
  - DM review → swipeable cards with subject/body editor
  - DM limit hit → "Switch to email?"
  - Email review → same card pattern for email
  - Deferred → "X recruiters parked"
- **Referrals page cascade integration**:
  - Cascade detection polling (10s intervals during active automation)
  - Amber banner to re-open cascade sheet
  - New status labels/colors for all cascade states
- **Test suite**: 66 tests across 9 test files
  - Vitest runner + mock Supabase infrastructure
  - Functional tests for all new + modified API routes
  - Integration tests for full cascade flow scenarios

### Database Migration Required
```sql
ALTER TABLE outreach_queue
  ADD COLUMN IF NOT EXISTS outreach_method text NOT NULL DEFAULT 'connect',
  ADD COLUMN IF NOT EXISTS email_subject text DEFAULT '',
  ADD COLUMN IF NOT EXISTS email_body text DEFAULT '',
  ADD COLUMN IF NOT EXISTS batch_id uuid DEFAULT gen_random_uuid();

ALTER TABLE outreach_queue
  ADD CONSTRAINT outreach_method_check CHECK (outreach_method IN ('connect', 'dm', 'email'));
```

### Existing Features (baseline)
- Onboarding: PDF/URL/paste resume → Claude Opus parsing → structured profile
- Job scraping: 12 scrapers (Greenhouse, Lever, Ashby, Remotive, Naukri, Cutshort, etc.)
- Intent-first matching: Claude Haiku scoring with INTENT GATE + FIT QUALITY
- Recruiter engine: CSV import → Claude classify → relevance scoring → daily capsule
- Single outreach: OutreachFlow bottom sheet with draft generation
- Batch outreach: Multi-select → ReviewSheet → Chrome extension automation
- Gmail sync: ATS email detection → application stage tracking
- Push notifications: scheduled outreach reminders, follow-up nudges
- Pre-apply intelligence: cover letter + bio + screening Q&A generation

---

## Version Convention

| Bump | When |
|------|------|
| MAJOR (X.0.0) | Breaking changes to API contracts, DB schema, or extension protocol |
| MINOR (1.X.0) | New features, new API routes, UI additions |
| PATCH (1.0.X) | Bug fixes, copy changes, performance improvements |

### Pre-release checklist
1. `npm test` — all tests pass
2. `npm run build` — 0 errors
3. Update version in `package.json`
4. Add entry to this CHANGELOG
5. Run any required SQL migrations
6. Deploy: `cd careerpilot-ai && vercel --prod --yes`
7. Git tag: `git tag v1.0.0 && git push --tags`
