

# Fix Logos Without API + Limit to 20 Upcoming Matches

## The Real Problem

All 102 teams have `logo_url = NULL`. The API-Football free tier rejects 2025 season requests, so the sync never populates logos. But logos don't need an API at all.

## Solution: Use Free Logo Sources Directly

Football team logos are publicly available from multiple free sources. The simplest and most reliable approach:

1. **Use Wikipedia/Wikimedia logo URLs** — every major club has a publicly accessible crest image
2. **Use the Sportradar competitor ID** to construct a logo URL from a free CDN
3. **Fallback**: Generate a colored circle with team initials

### Approach: Edge function that fetches logos via AI web search

Create a lightweight edge function `fix-team-logos` that:
- Reads all teams with `logo_url = NULL` from the database
- For each team, constructs a search query like `"{team name} football club logo wikipedia svg"`
- Uses the Lovable AI gateway (which you already pay for) to find the Wikipedia/Wikimedia Commons logo URL
- Updates the team record with the found logo URL
- This is a **one-time fix**, not a recurring sync

**Even simpler alternative**: Use a hardcoded mapping of team names to known free logo URLs from football-data.org or similar CDNs. For example, `https://crests.football-data.org/{football-data-id}.png` is completely free.

## Plan

### 1. Create `supabase/functions/fix-team-logos/index.ts`

- Query all teams where `logo_url IS NULL`
- For each team, use the AI to search for the team's official logo URL from Wikipedia
- Update the team's `logo_url` in the database
- Process in batches of 10 to avoid timeouts

### 2. Limit upcoming matches to 20

**File: `src/hooks/useMatches.ts`**
- Add `.limit(20)` to the upcoming matches query
- Add `.limit(12)` to the completed matches query

### 3. Add query limit for completed matches too

Same file, same pattern.

## Files Changed

| File | Change |
|---|---|
| `supabase/functions/fix-team-logos/index.ts` | New: AI-powered logo finder that searches Wikipedia for each team's crest URL |
| `src/hooks/useMatches.ts` | Add `.limit(20)` to upcoming, `.limit(12)` to completed |

No database changes needed.

## Technical Detail

The `fix-team-logos` function will use the Lovable AI gateway (google/gemini-3-flash-preview) with a prompt like:

> "What is the direct URL to the official Wikipedia/Wikimedia Commons logo image for {team name} football club? Return ONLY the URL, nothing else."

This avoids needing any football API for logos. It's a one-time operation — once logos are populated, they persist in the database.

