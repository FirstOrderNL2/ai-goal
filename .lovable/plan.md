

# Fix International Competition Sync — Wrong Season IDs

## Root Cause

The international competitions are not loading because the Sportradar season IDs in the code are **completely wrong**:

| Competition | Current (wrong) Season ID | Correct Season ID | Verified via API |
|---|---|---|---|
| WC Qualifiers Europe | `sr:season:118689` | `sr:season:127075` | Yes — "FIFA World Cup Qualification UEFA 2026" (25/26) |
| WC Qualifiers South America | `sr:season:118691` | `sr:season:109025` | Yes — "FIFA World Cup Qualification 2026, CONMEBOL" (23-25) |
| Friendlies | `sr:season:113069` | N/A — see below | Competition ID was wrong too |

Additionally, the **competition IDs** were wrong:
- Code used `sr:competition:36` (Scottish Premiership) and `sr:competition:37` (Eredivisie) — NOT world cup qualifiers
- Correct: `sr:competition:11` (WCQ UEFA), `sr:competition:295` (WCQ CONMEBOL)

**Friendlies**: `sr:competition:852` is **women's** friendlies. Men's international friendlies may not be available on the Sportradar trial API. The matches in your screenshot (USA vs Portugal, Brazil vs Croatia) are friendlies — we can add them via API-Football (league ID 10) as a fallback.

Also adding **CONCACAF WCQ** (`sr:competition:14`, `sr:season:115355`) and **FIFA World Cup 2026** (`sr:competition:16`, `sr:season:101177`) since those are relevant upcoming competitions.

## Plan

### 1. Fix Season IDs in `sync-sportradar-data`

Update `ALL_LEAGUES` with the verified correct season IDs:

```
wc_qualifiers_europe:     sr:season:127075
wc_qualifiers_conmebol:   sr:season:109025
wc_qualifiers_concacaf:   sr:season:115355
world_cup_2026:           sr:season:101177
```

Remove `friendlies` from Sportradar sync (wrong competition ID, men's friendlies not available on trial).

### 2. Fix Season IDs in `src/lib/seasons.ts`

Update to match the corrected IDs.

### 3. Update `src/hooks/useSportradar.ts`

Update `LEAGUE_KEYS` array: replace `wc_qualifiers_south_america` with `wc_qualifiers_conmebol`, add `wc_qualifiers_concacaf` and `world_cup_2026`, remove `friendlies`.

### 4. Update `src/components/LeagueFilter.tsx`

Update filter buttons to match new league keys. Add "World Cup" and "WCQ CONCACAF" buttons. Remove "Friendlies" (not available from Sportradar trial).

### 5. Add Friendlies via API-Football (league ID 10)

The `sync-football-data` function already has `{ id: 10, name: "Friendlies" }` configured. This is the correct source for international friendlies. Ensure its season parameter works (use `2024` instead of dynamic `2025` for the free tier, or `2026` if allowed for friendlies).

## Files Changed

| File | Change |
|---|---|
| `supabase/functions/sync-sportradar-data/index.ts` | Fix all international season IDs; rename `wc_qualifiers_south_america` → `wc_qualifiers_conmebol`; add `wc_qualifiers_concacaf` and `world_cup_2026`; remove `friendlies` |
| `src/lib/seasons.ts` | Update season entries to match |
| `src/hooks/useSportradar.ts` | Update `LEAGUE_KEYS` array |
| `src/components/LeagueFilter.tsx` | Update filter buttons |
| `supabase/functions/sync-football-data/index.ts` | Verify friendlies season param works |

No database changes needed.

