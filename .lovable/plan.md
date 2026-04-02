

# Add Player Roster to Teams Page + Dashboard Verification

## Current State

- **Sync completed successfully**: UCL (8), UEL (8), UECL (8), Eredivisie (54), KKD (51), Friendlies (1) now populated with API-Football data
- **139 players synced** — distributed across teams (Liverpool has 19, most teams have 2-5)
- **Dashboard dedup working**: `API_FOOTBALL_LEAGUES` filter correctly excludes Sportradar duplicates
- **"World Cup 2026" (104 matches)** from scraper still showing — needs cleanup since it's not in `API_FOOTBALL_LEAGUES` list and has no `api_football_id`
- **Teams page** is a flat grid with no detail view or player roster — clicking a team does nothing

## Plan

### 1. Create Team Detail page with player roster

New page at `/teams/:id` showing:
- Team header (logo, name, country, league)
- Player roster table/grid from `usePlayers(teamId)` hook (already exists)
- Each player: photo, name, position, age, nationality
- Group players by position (Goalkeeper, Defender, Midfielder, Attacker)

### 2. Make team cards clickable on Teams page

Wrap each team card in a `<Link to={/teams/${team.id}>` so users can navigate to the detail page.

### 3. Add route for team detail

Add `/teams/:id` route in `App.tsx` pointing to the new `TeamDetail` page.

### 4. Clean up stale non-API-Football matches

- Add "World Cup 2026" and "Football League Championship" and "Football League Two" to cleanup — either delete scraped matches without `api_football_id` for these leagues, or add them to the dedup filter
- Simplest: delete matches where `api_football_id IS NULL` and league names don't match any active filter (stale scraped data)

### 5. Dashboard verification fix

The "World Cup 2026" league name doesn't match any `LeagueFilter` option, but these 104 matches pass through the "all" filter because "World Cup 2026" is not in `API_FOOTBALL_LEAGUES`. Fix by adding a DB cleanup migration to remove matches without `api_football_id` for leagues not actively tracked.

## Files to Change

| File | Change |
|---|---|
| `src/pages/TeamDetail.tsx` | **New** — team header + player roster grouped by position |
| `src/pages/Teams.tsx` | Make team cards clickable links to `/teams/:id` |
| `src/App.tsx` | Add `/teams/:id` route |
| DB migration | Delete stale scraped matches without `api_football_id` (World Cup 2026, Football League Championship, Football League Two) |

## Technical Detail

```text
TeamDetail page layout:
┌─────────────────────────────┐
│  ← Back to Teams            │
│  [Logo] Team Name            │
│  Country · League            │
├─────────────────────────────┤
│  Squad (X players)           │
│                              │
│  Goalkeepers                 │
│  [photo] Name  Age  Nation   │
│                              │
│  Defenders                   │
│  [photo] Name  Age  Nation   │
│  ...                         │
│                              │
│  Midfielders                 │
│  ...                         │
│                              │
│  Attackers                   │
│  ...                         │
└─────────────────────────────┘
```

