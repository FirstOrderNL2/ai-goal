

# Automate the Full Pipeline with Scheduled Jobs

## Current State

Everything runs manually — either via the "Sync Live Data" button or the auto-sync on page load (localStorage 30-min cooldown). If nobody visits the site, nothing syncs.

## Solution: Server-Side Cron Jobs with pg_cron

Use PostgreSQL's `pg_cron` + `pg_net` extensions to schedule HTTP calls to edge functions on a fixed interval, completely independent of frontend visits.

## Proposed Schedule

| Job | Cron | Frequency | What it does |
|---|---|---|---|
| `sync-sportradar-data` | `0 */4 * * *` | Every 4 hours | Sync match data + probabilities from Sportradar |
| `scrape-matches` | `0 8,14,20 * * *` | 3x daily (8am, 2pm, 8pm CET) | Scrape Dutch sites for today's matches |
| `scrape-news` | `0 9,15,21 * * *` | 3x daily | Scrape VI.nl news and link to matches |
| `batch-generate-predictions` | `30 8,14 * * *` | 2x daily | Generate AI predictions for unpredicted matches |
| `cleanup-stale-matches` | `*/30 * * * *` | Every 30 min | Mark past "upcoming" matches as "completed" |

## Implementation

### 1. Create `supabase/functions/auto-sync/index.ts`
A single orchestrator function that runs all steps in sequence:
1. Call `sync-sportradar-data` internally
2. Call `scrape-matches` 
3. Call `scrape-news`
4. Mark stale matches as completed (direct DB update)
5. Call `batch-generate-predictions` for new matches

This avoids needing 5 separate cron jobs — one function handles the full pipeline.

### 2. Enable pg_cron + pg_net extensions
Database migration to enable the extensions.

### 3. Schedule the cron job
SQL insert to schedule `auto-sync` to run every 4 hours via `pg_cron` + `pg_net`.

### 4. Keep the manual sync button
The frontend button stays for on-demand refreshes, but the system no longer depends on it.

## Files to Create/Change

| File | Change |
|---|---|
| `supabase/functions/auto-sync/index.ts` | New orchestrator that calls all sync/scrape/predict functions in sequence |
| Database migration | Enable `pg_cron` and `pg_net` extensions |
| SQL insert (non-migration) | Create the cron schedule entry |

