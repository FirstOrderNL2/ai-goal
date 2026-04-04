export interface Team {
  id: string;
  name: string;
  league: string;
  country: string;
  logo_url: string | null;
  api_football_id: number | null;
  sportradar_id: string | null;
}

export interface Match {
  id: string;
  match_date: string;
  team_home_id: string;
  team_away_id: string;
  goals_home: number | null;
  goals_away: number | null;
  xg_home: number | null;
  xg_away: number | null;
  status: string;
  league: string;
  api_football_id: number | null;
  round: string | null;
  sportradar_id: string | null;
  fun_facts: string[] | null;
  ai_insights: string | null;
  ai_post_match_review: string | null;
  ai_accuracy_score: number | null;
  home_team?: Team;
  away_team?: Team;
  prediction?: Prediction;
  odds?: Odds;
}

export interface Prediction {
  id: string;
  match_id: string;
  home_win: number;
  draw: number;
  away_win: number;
  expected_goals_home: number;
  expected_goals_away: number;
  predicted_score_home: number | null;
  predicted_score_away: number | null;
  over_under_25: string;
  btts: string | null;
  model_confidence: number;
  ai_reasoning: string | null;
  goal_lines: Record<string, number> | null;
  goal_distribution: Record<string, number> | null;
  best_pick: string | null;
  best_pick_confidence: number | null;
  last_prediction_at: string | null;
  prediction_intervals: Array<{ at: string; minutesBefore?: number; label?: string }> | null;
  pre_match_snapshot: Record<string, unknown> | null;
}

export interface Odds {
  id: string;
  match_id: string;
  home_win_odds: number;
  draw_odds: number;
  away_win_odds: number;
}

export interface MatchContext {
  id: string;
  match_id: string;
  injuries_home: any[] | null;
  injuries_away: any[] | null;
  lineup_home: any[] | null;
  lineup_away: any[] | null;
  suspensions: any[] | null;
  news_items: any[] | null;
  weather: string | null;
  h2h_summary: string | null;
  scraped_at: string;
}

export interface League {
  id: string;
  api_football_id: number;
  name: string;
  country: string;
  season: number;
  logo_url: string | null;
  standings_data: any[];
  updated_at: string;
}

export interface TeamStatistics {
  id: string;
  team_id: string;
  league_id: string;
  season: number;
  matches_played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_diff: number;
  form: string | null;
  home_record: any;
  away_record: any;
  clean_sheets: number;
  failed_to_score: number;
  avg_goals_scored: number;
  avg_goals_conceded: number;
  updated_at: string;
}

export interface MatchFeatures {
  id: string;
  match_id: string;
  home_form_last5: string | null;
  away_form_last5: string | null;
  home_avg_scored: number;
  home_avg_conceded: number;
  away_avg_scored: number;
  away_avg_conceded: number;
  h2h_results: any[] | null;
  league_position_home: number | null;
  league_position_away: number | null;
  position_diff: number | null;
  home_clean_sheet_pct: number;
  away_clean_sheet_pct: number;
  home_btts_pct: number;
  away_btts_pct: number;
  poisson_xg_home: number;
  poisson_xg_away: number;
  computed_at: string;
}

export interface Player {
  id: string;
  api_football_id: number;
  team_id: string | null;
  name: string;
  position: string | null;
  age: number | null;
  nationality: string | null;
  photo_url: string | null;
}
