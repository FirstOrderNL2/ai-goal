const BASE_URL = "https://raw.githubusercontent.com/statsbomb/open-data/master/data";

export interface SBCompetition {
  competition_id: number;
  season_id: number;
  competition_name: string;
  competition_gender: string;
  country_name: string;
  season_name: string;
  match_updated: string;
  match_available: string;
}

export interface SBMatch {
  match_id: number;
  match_date: string;
  kick_off: string;
  competition: { competition_id: number; competition_name: string; country_name: string };
  season: { season_id: number; season_name: string };
  home_team: { home_team_id: number; home_team_name: string; home_team_gender: string; country: { id: number; name: string } };
  away_team: { away_team_id: number; away_team_name: string; away_team_gender: string; country: { id: number; name: string } };
  home_score: number;
  away_score: number;
  match_status: string;
  stadium?: { id: number; name: string; country: { id: number; name: string } };
  referee?: { id: number; name: string; country: { id: number; name: string } };
}

export interface SBEvent {
  id: string;
  index: number;
  period: number;
  timestamp: string;
  minute: number;
  second: number;
  type: { id: number; name: string };
  possession: number;
  possession_team: { id: number; name: string };
  play_pattern: { id: number; name: string };
  team: { id: number; name: string };
  player?: { id: number; name: string };
  position?: { id: number; name: string };
  location?: [number, number];
  pass?: {
    recipient?: { id: number; name: string };
    length?: number;
    angle?: number;
    height?: { id: number; name: string };
    end_location?: [number, number];
    outcome?: { id: number; name: string };
  };
  shot?: {
    statsbomb_xg?: number;
    end_location?: [number, number, number];
    outcome?: { id: number; name: string };
    technique?: { id: number; name: string };
    body_part?: { id: number; name: string };
    type?: { id: number; name: string };
  };
  foul_committed?: { card?: { id: number; name: string } };
  substitution?: { replacement: { id: number; name: string }; outcome: { id: number; name: string } };
}

export interface SBLineupEntry {
  team_id: number;
  team_name: string;
  lineup: {
    player_id: number;
    player_name: string;
    player_nickname: string | null;
    jersey_number: number;
    country: { id: number; name: string };
  }[];
}

export async function fetchCompetitions(): Promise<SBCompetition[]> {
  const res = await fetch(`${BASE_URL}/competitions.json`);
  if (!res.ok) throw new Error("Failed to fetch StatsBomb competitions");
  return res.json();
}

export async function fetchMatches(competitionId: number, seasonId: number): Promise<SBMatch[]> {
  const res = await fetch(`${BASE_URL}/matches/${competitionId}/${seasonId}.json`);
  if (!res.ok) throw new Error("Failed to fetch StatsBomb matches");
  return res.json();
}

export async function fetchEvents(matchId: number): Promise<SBEvent[]> {
  const res = await fetch(`${BASE_URL}/events/${matchId}.json`);
  if (!res.ok) throw new Error("Failed to fetch StatsBomb events");
  return res.json();
}

export async function fetchLineups(matchId: number): Promise<SBLineupEntry[]> {
  const res = await fetch(`${BASE_URL}/lineups/${matchId}.json`);
  if (!res.ok) throw new Error("Failed to fetch StatsBomb lineups");
  return res.json();
}
