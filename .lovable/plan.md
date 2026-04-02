

# Fix Remaining Garbage Data & Clarify Match Status

## Analysis

### Bayern Munich Women vs Man Utd Women (71347f3b)
This match is scheduled for **today April 2 at 16:45 UTC** (18:45 CET). It has NOT been played yet — it's ~6 hours from now. The confusion comes from the **AI insights text**, which scraped first-leg match reports (Bayern beat Man Utd 2-1 on April 1) and mistakenly interpreted them as this match having concluded. The AI even says "CRITICAL NOTE: this match has already concluded" — but that refers to the first leg. The match entry itself is correctly "upcoming."

**This is an AI reasoning bug, not a data bug.** The prediction engine confused first-leg results with the second-leg fixture.

### Garbage Teams Still Present
Two garbage teams survived the previous cleanup:
- `SC Cambuur Copier` (f2f96f8e)
- `SC Cambuur Joint` (81b284c3)

Each has a duplicate match (VVV-Venlo vs SC Cambuur appears 3 times on Apr 3).

### Duplicate Matches Summary
The real VVV-Venlo vs SC Cambuur match is `5f107ea4`. The other two (`b7c47d5b` and `a0a92e14`) are garbage duplicates.

## Fix Plan

### 1. Database Cleanup (migration)
- Delete predictions for matches linked to garbage teams (SC Cambuur Copier, SC Cambuur Joint)
- Delete those 2 garbage matches
- Delete the 2 garbage teams

SQL:
```sql
DELETE FROM predictions WHERE match_id IN (
  SELECT m.id FROM matches m
  JOIN teams t ON t.id = m.team_home_id OR t.id = m.team_away_id
  WHERE t.name IN ('SC Cambuur Copier', 'SC Cambuur Joint')
);
DELETE FROM matches WHERE id IN (
  SELECT m.id FROM matches m
  JOIN teams t ON t.id = m.team_home_id OR t.id = m.team_away_id
  WHERE t.name IN ('SC Cambuur Copier', 'SC Cambuur Joint')
);
DELETE FROM teams WHERE name IN ('SC Cambuur Copier', 'SC Cambuur Joint');
```

### 2. Fix misleading AI insights on Bayern match
- Update match `71347f3b` to clear the misleading `ai_insights` that says the match already concluded (it hasn't — that was first-leg data)
- Also regenerate or clear the prediction that has 10.8% confidence and post-match language

### 3. No code changes needed
The garbage name filter in `sync-sportradar-data` already blocks "copier" and "joint" — these teams were created before the filter was added. The frontend 2-hour filter is working correctly. No code changes required.

## Files to Change

| Target | Change |
|---|---|
| DB migration | Delete 2 garbage teams, their matches, and predictions |
| DB migration | Clear misleading AI insights on Bayern Women match |

