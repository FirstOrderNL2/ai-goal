
# Football Prediction Platform — MVP Plan

## Overview
A dashboard-style web app showing upcoming football matches with mock AI-generated win/draw/loss probabilities, expected goals, and over/under predictions. Uses Supabase for database and seed data, with the architecture ready to plug in real APIs and ML models later.

## Database (Supabase)
Set up tables:
- **teams** — id, name, league, country, logo_url
- **matches** — id, date, home/away team refs, goals, xG values, status (upcoming/completed)
- **predictions** — match_id, home_win/draw/away_win probabilities, xG home/away, over_under_25, model_confidence
- **odds** — match_id, home/draw/away odds

Seed with ~30 teams across 3 leagues (Premier League, La Liga, Serie A) and ~50 matches (mix of completed with results and upcoming without).

## Prediction Engine (Mock)
An edge function `/predictions` that generates realistic-looking predictions using simple heuristics based on team form and historical averages stored in the database. Returns JSON with probabilities, xG, and confidence scores. Designed to be swappable with a real ML API later.

## Frontend Dashboard
### Main Page — Upcoming Matches
- Header with platform branding ("FootballAI Predictions")
- Filter bar: league selector, date range picker
- Match cards showing: team names/logos, date/time, prediction probabilities (visual bar chart), xG estimates, over/under 2.5 indicator, confidence badge
- Color-coded probability bars (green for favorite, yellow for draw, red for underdog)

### Match Detail View
- Expanded prediction breakdown
- Head-to-head stats (from seed data)
- Recent form (last 5 matches indicator: W/D/L dots)
- Odds comparison section

### Predictions Accuracy Page
- Track past predictions vs actual results
- Simple accuracy percentage display
- Chart showing prediction performance over time

## Design
- Dark theme with football/sports aesthetic
- Card-based layout, mobile-responsive
- Clean data visualization using charts (recharts)
- Green/dark green accent colors

## Pages & Routes
- `/` — Dashboard with upcoming matches and predictions
- `/match/:id` — Match detail with full prediction breakdown
- `/accuracy` — Prediction tracking page
- `/teams` — Team listing with basic stats
