export interface Team {
  id: string;
  name: string;
  league: string;
  country: string;
  logo_url: string | null;
  api_football_id: number | null;
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
  over_under_25: string;
  model_confidence: number;
}

export interface Odds {
  id: string;
  match_id: string;
  home_win_odds: number;
  draw_odds: number;
  away_win_odds: number;
}
