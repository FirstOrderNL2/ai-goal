

# Project Status Review and Next Phase Plan

## Current Bugs and Issues

### 1. React forwardRef Warnings (Medium)
Console shows repeated warnings: "Function components cannot be given refs" for `ProbabilityBar`, `Badge`, and `MatchCard`. These come from `MatchCard` being used inside a `<Link>` component which passes a ref to its child.

**Fix**: Wrap `MatchCard` with `React.forwardRef`, or restructure the `Link`/`Card` nesting so the ref target is a native element.

### 2. Standings Page — Hardcoded Sportradar Season IDs (Medium)
Season IDs (`sr:season:118689`, etc.) are hardcoded. When the 2025/26 season starts, these will break. The sync function has the same issue.

**Fix**: Derive season IDs dynamically, or at minimum centralize them in one config.

### 3. Team Name Matching Fragility (Medium)
Sportradar sync matches teams by exact lowercase name. Names like "Inter Milan" vs "Internazionale" or "Atlético Madrid" vs "Atletico Madrid" will fail to match, leaving `sportradar_id` null for those teams. This means no fun facts, no insights, no probabilities for those matches.

### 4. Predictions Upsert — Missing Unique Constraint (High)
The `sync-football-data` and `sync-sportradar-data` functions both upsert to `predictions` with `onConflict: "match_id"`, but the `predictions` table schema shows **no unique constraint** on `match_id`. This means upserts silently fail or create duplicates.

**Fix**: Add `ALTER TABLE predictions ADD CONSTRAINT predictions_match_id_unique UNIQUE (match_id);`

### 5. Sportradar xG Always Zero (Low)
In `sync-sportradar-data`, `expected_goals_home` and `expected_goals_away` are hardcoded to `0` when upserting predictions from Sportradar probabilities. This overwrites any real xG data from API-Football.

### 6. SportMonks Integration Unused (Low)
The edge function and hook exist but aren't actively used anywhere since Standings was switched to Sportradar. The SportMonks free plan doesn't cover the tracked leagues. This is dead code unless the user upgrades.

### 7. No Foreign Keys on Matches (Low)
`matches.team_home_id` and `matches.team_away_id` have no foreign key to `teams.id`. Orphaned references are possible.

---

## What is Built (Completed Phases)

| Feature | Status |
|---|---|
| Database schema (teams, matches, predictions, odds) | Done |
| API-Football sync (fixtures, teams, predictions) | Done |
| Sportradar sync (probabilities, team/match ID mapping) | Done |
| SportMonks edge function + hook | Done (unused) |
| Dashboard with upcoming/completed matches | Done |
| Match detail page (predictions, odds, H2H, xG) | Done |
| AI insights generation (Gemini via Lovable AI) | Done |
| StatsBomb open data (shot maps, key events, pass stats) | Done |
| Sportradar fun facts + insights | Done |
| Standings page (Sportradar) | Done |
| Accuracy tracking page | Done |
| Teams directory with logos | Done |

---

## Next Phase Plan

### Phase 1: Fix Critical Bugs (Priority)

1. **Add `match_id` unique constraint** on `predictions` table — prevents duplicate/failed upserts
2. **Fix forwardRef warnings** — wrap `MatchCard` with `forwardRef` so `Link` doesn't throw warnings
3. **Fix Sportradar xG overwrite** — preserve existing xG values when Sportradar syncs (only update if current values are 0/null)

### Phase 2: Data Quality Improvements

4. **Add team name aliases for matching** — create a name alias map (e.g., "Inter Milan" = "Internazionale", "Atletico Madrid" = "Atlético Madrid") in the Sportradar sync so more teams get matched
5. **Centralize season ID config** — move all season IDs to a single shared config or a `seasons` DB table so they only need updating in one place

### Phase 3: New Features

6. **Add team logos to Standings table** — match Sportradar competitor names to the `teams` table and show `logo_url` in the standings rows
7. **Live match status** — show "Live", "HT", "FT" badges on match cards using the `status` field, with auto-refresh for in-progress matches
8. **Head-to-Head on match detail improvements** — show H2H win/draw/loss summary stats, not just the match list
9. **Dark/light theme toggle** — add a theme switcher to the header
10. **Mobile nav improvements** — on the current 411px viewport, nav labels are hidden but icons are cramped. Add a hamburger menu or bottom tab bar for mobile.

### Technical Details

- **Unique constraint migration**: `ALTER TABLE predictions ADD CONSTRAINT predictions_match_id_unique UNIQUE (match_id);`
- **forwardRef fix**: Wrap `MatchCard` export with `React.forwardRef` and spread the ref onto the outer `Link` or `Card` element
- **xG preservation**: In `sync-sportradar-data`, change the upsert to only set `expected_goals_home/away` when the existing values are null/0, or skip those fields entirely from the Sportradar upsert
- **Team alias map**: A simple `Record<string, string>` mapping alternate names to canonical names, applied before the `teamsByName.get()` lookup
- **Standings logos**: Query `teams` table by matching competitor name, then render `logo_url` in the table row

