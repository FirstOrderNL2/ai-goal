

# Add Live Match Minute Indicator to MatchCard

## Changes

**`src/components/MatchCard.tsx`** — single file change:

1. **Match minute badge**: When `isLive`, show a pulsing match minute indicator next to the score (e.g., `45'`, `HT`, `90+2'`). Derive the minute from `match.status` — if status is `HT` show "HT", otherwise estimate elapsed time from `match_date` kickoff time (half 1: 0-45, half 2: 45-90). For precise minute data, use the `useLiveFixture` hook's `fixture.status.elapsed` if available, but since MatchCard is rendered in a list, we'll compute a lightweight estimate from `match_date` and `status` to avoid per-card API calls.

2. **Pulsing score styling**: When live, the score text gets a green color and a subtle pulse animation to draw attention, plus a small blinking dot indicator.

3. **Status-to-minute mapping**:
   - `1H` → compute minutes elapsed since kickoff (capped at 45)
   - `HT` → show "HT"
   - `2H` → compute minutes elapsed since kickoff minus 15min break (capped at 90)
   - `ET` → show "ET"
   - `live` (generic) → compute from kickoff time

4. **Auto-updating**: Use a 30-second `setInterval` inside the component (only when `isLive`) to re-render the minute counter without additional API calls.

### Technical detail

- Add a `useLiveMinute(matchDate, status)` helper inside the file that returns the current estimated minute string
- Use `useEffect` + `useState` with a 30s interval for the ticker
- Style: green text, tabular-nums, small `'` suffix, pulsing dot beside score

