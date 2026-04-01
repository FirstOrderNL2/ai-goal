

# Full System Audit — April 1, 2026

## ✅ What is Working

| Component | Status |
|---|---|
| **Sportradar sync** | 2,936 matches across 9 leagues synced correctly |
| **AI predictions** | 77/489 upcoming matches have AI-generated predictions with real xG values |
| **Web scraping** | Firecrawl + Gemini pipeline scrapes iservoetbalvanavond.nl and vi.nl successfully |
| **Homepage** | Loads with league filters, 20 upcoming / 12 completed limits |
| **Match detail page** | Shows predictions, H2H, AI insights button |
| **Team logos** | 174/314 teams have logos with fallback initials for missing ones |
| **Prediction quality** | All 1,462 predictions sum to 1.0 correctly |
| **News integration** | 18 matches have AI insights, 3 have post-match reviews |

## ❌ Critical Bugs Found

### Bug 1: USA vs Portugal still showing as "upcoming" — already finished 0-2
- **Root cause**: The scraper inserted this match with `status: 'upcoming'` but the game has ended (March 31, 23:00 UTC = today). There is **no mechanism to update scraped matches from "upcoming" to "completed"**. The Sportradar sync updates status only for Sportradar-tracked matches.
- **Also affected**: Brazil vs Croatia (April 1, 00:00 UTC) and 2 Women's Champions League matches (April 1)
- **Impact**: Users see finished matches as upcoming — destroys credibility

### Bug 2: Women's Champions League matches labeled as "Champions League"
- The scraper pulled Women's UCL matches (Bayern München Vrouwen vs Man United Vrouwen, Chelsea Vrouwen vs Arsenal Vrouwen) and labeled them "Champions League" — mixing women's and men's competitions
- **Impact**: Misleading league labels, confuses users expecting men's UCL

### Bug 3: Duplicate teams created by scraper
- The scraper creates new teams instead of matching existing ones:
  - "Paris Saint-Germain F.C." (scraped) vs "Paris Saint-Germain" (Sportradar) — same club, two DB entries
  - "Brazilië" (Dutch name) vs "Brazil" (English name)
  - "Manchester United Vrouwen", "FC Barcelona Vrouwen", "Real Madrid Vrouwen" — all created as separate teams
- **Result**: PSG vs Toulouse appears **twice** in the upcoming matches list with different team IDs

### Bug 4: 412/489 upcoming matches have NO predictions
- Only 77 of 489 upcoming matches have predictions (16%)
- The batch prediction function only runs when manually triggered or after sync
- World Cup 2026 matches (104) have zero predictions

### Bug 5: 96.5% of predictions have xG = 0.0
- 1,411 of 1,462 predictions still have `expected_goals_home = 0` and `expected_goals_away = 0`
- Only the 51 AI-generated predictions have real xG values
- Sportradar predictions were never backfilled with AI xG estimates

### Bug 6: Zero odds data
- The `odds` table has 0 rows — no odds API is connected
- The UI has odds display code but nothing to show

### Bug 7: Only 3 post-match reviews and 3 accuracy scores out of 2,447 completed matches
- The AI learning loop barely runs — 0.1% coverage

## ⚠️ Issues & Risks

| Issue | Severity | Detail |
|---|---|---|
| **No status update for scraped matches** | Critical | Scraped matches stay "upcoming" forever |
| **Team name resolution is weak** | High | Dutch names, women's team suffixes not handled |
| **No deduplication on scrape** | High | Same match inserted under different team names |
| **No automated scheduling** | High | Everything requires manual trigger or page load |
| **WCQ leagues show 0 upcoming** | Medium | All WCQ Europe/CONMEBOL/CONCACAF marked completed — seasons may have ended |
| **Eredivisie not synced from Sportradar** | Medium | Season ID added but 0 Eredivisie matches in DB |
| **No model retraining** | Medium | AI predictions use static prompts, no learning from accuracy scores |

## 🔧 Phase-by-Phase Fix Plan

### Phase 1: Fix Critical Data Integrity (Immediate)

**1a. Auto-update match status for scraped matches**
- Create a cleanup function that checks matches where `status = 'upcoming'` and `match_date < NOW()` 
- For scraped matches (no `sportradar_id`), re-scrape or mark as "completed" and attempt to get scores
- Run this as part of every sync cycle

**1b. Fix team deduplication**
- Merge duplicate teams: "Paris Saint-Germain F.C." → "Paris Saint-Germain", "Brazilië" → "Brazil"
- Update the scraper's `resolveTeamName` to handle Dutch names (Brazilië, Verenigde Staten, Kroatië) and strip "Vrouwen" suffix
- Add fuzzy matching: before creating a new team, search existing teams with `ILIKE '%name%'`

**1c. Separate Women's competitions**
- Either filter out women's matches from the scraper, or label them correctly as "Women's Champions League"

**1d. Delete duplicate matches**
- Remove the PSG F.C. vs Toulouse duplicate match and team entries

### Phase 2: Fill Prediction Gaps

**2a. Batch-generate predictions for all 412 unpredicted matches**
- Run `batch-generate-predictions` with higher limits in multiple passes
- Prioritize matches in the next 7 days first

**2b. Backfill xG for Sportradar predictions**
- Run a one-time update: for predictions with xG = 0, call the AI to estimate xG based on team form and probabilities

### Phase 3: Automate the Pipeline

**3a. Add a scheduled cleanup step to the sync flow**
- After Sportradar sync: update status of past-dated "upcoming" matches
- After scrape: deduplicate teams and matches
- After status updates: auto-trigger post-match reviews for newly completed matches

**3b. Trigger predictions automatically**
- After any new upcoming match is inserted, queue it for AI prediction generation

### Phase 4: Improve Prediction Quality

**4a. Scale post-match reviews**
- Generate reviews for at least the last 100 completed matches to build accuracy data
- Use accuracy scores to calibrate future predictions

**4b. Add Eredivisie data**
- The Sportradar season ID is configured but producing 0 matches — verify the season ID is correct

### Files to Change

| File | Change |
|---|---|
| `supabase/functions/scrape-matches/index.ts` | Add Dutch→English team name mapping, strip "Vrouwen", filter/label women's matches, add deduplication, add status-update for past matches |
| `supabase/functions/batch-generate-predictions/index.ts` | Add backfill mode for xG on existing predictions |
| `supabase/functions/sync-sportradar-data/index.ts` | Add post-sync cleanup step to mark past upcoming matches as completed |
| `src/hooks/useMatches.ts` | Add filter `match_date >= now()` for upcoming matches query to hide past matches on the frontend as a safety net |

### Database Changes

- Migration to merge duplicate teams and reassign matches to canonical team IDs
- Delete orphaned duplicate match rows

