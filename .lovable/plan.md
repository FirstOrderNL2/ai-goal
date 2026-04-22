

# Add European top-flight leagues + Turkey

## Scope

Add the **top-tier league of every major European football country** that's not already covered, plus **Turkey**. The current sync covers England, Spain, Italy, Germany, France, Netherlands + UEFA cups. Missing top divisions to add:

| Country | League | API-Football ID |
|---|---|---|
| Portugal | Primeira Liga | 94 |
| Belgium | Jupiler Pro League | 144 |
| Turkey | Süper Lig | 203 |
| Scotland | Premiership | 179 |
| Switzerland | Super League | 207 |
| Austria | Bundesliga | 218 |
| Greece | Super League 1 | 197 |
| Denmark | Superliga | 119 |
| Sweden | Allsvenskan | 113 |
| Norway | Eliteserien | 103 |
| Poland | Ekstraklasa | 106 |
| Czech Republic | Chance Liga | 345 |
| Croatia | HNL | 210 |
| Ukraine | Premier League | 235 |
| Russia | Premier League | 235 → **excluded** (sanctioned, sparse data) |

Final list = **14 new leagues** (Russia excluded).

## Implementation

**1. `supabase/functions/sync-football-data/index.ts`**
Append the 14 entries to the `LEAGUES` array (lines 11–33). The existing code already uses `LEAGUE_IDS_STRING` for the live-fixtures call and iterates `LEAGUES` for season fixtures, so they'll be picked up automatically on the next cron run.

**2. `supabase/functions/fetch-match-context/index.ts`**
Add the same league IDs to the `LEAGUE_IDS` map (lines 11–17) so injuries/lineups/predictions endpoints can resolve a league ID when a match has no `api_football_id` yet.

**3. `src/components/LeagueFilter.tsx`**
Add filter chips for the 14 new leagues using short labels (e.g. "Süper Lig", "Primeira", "Pro League", "Premiership", "Super League", "Bundesliga AT" to disambiguate from German Bundesliga, "Super League GR", "Superliga", "Allsvenskan", "Eliteserien", "Ekstraklasa", "Chance Liga", "HNL", "Ukraine PL").

**4. `src/lib/seasons.ts`**
Add the same leagues to `LEAGUE_SEASONS` and to `TEAM_NAME_ALIASES` only the most common alias overlaps (e.g. "galatasaray sk" → "galatasaray", "fenerbahçe sk" → "fenerbahce", "fc porto" → "porto", "sl benfica" → "benfica", "sporting cp" → "sporting", "club brugge kv" → "club brugge", "rsc anderlecht" → "anderlecht", "celtic fc" → "celtic", "rangers fc" → "rangers"). Sportradar season IDs left blank — only required for the StatsBomb/Sportradar paths, which these leagues won't use.

**5. Initial backfill (one-shot trigger)**
After deploy, the next scheduled `sync-football-data` run will pull the new leagues. No manual migration needed; matches arrive within the regular cron tick (≤ 30 min). I'll also invoke the function once after deploy to seed immediately.

## Out of scope

- Standings page integration — `Standings.tsx` already reads from the `leagues` table; new leagues will appear automatically once `sync-football-data` populates them.
- StatsBomb/Sportradar coverage for these leagues (those providers don't cover most of them anyway).
- Russia (excluded for data-quality reasons; can revisit if requested).

## Files touched

- `supabase/functions/sync-football-data/index.ts`
- `supabase/functions/fetch-match-context/index.ts`
- `src/components/LeagueFilter.tsx`
- `src/lib/seasons.ts`

## Success criteria

- Within ~30 min of deploy, `SELECT DISTINCT league FROM matches` includes the 14 new leagues.
- League filter chips on `/dashboard` show the new leagues and filter the match grid correctly.
- Match cards for new-league fixtures render with team logos, predictions, and (where API-Football provides it) lineups & injuries.

