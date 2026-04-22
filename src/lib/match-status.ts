/**
 * Centralized match phase logic.
 * Derives a display phase from DB status + kickoff time so the UI
 * can instantly move matches into the correct section without waiting
 * for the backend sync to flip the status.
 */

export type MatchPhase =
  | "upcoming"
  | "transition_live"
  | "live"
  | "completed_pending"
  | "completed"
  | "cancelled";

const LIVE_DB_STATUSES = ["live", "1H", "2H", "HT", "ET"];
const COMPLETED_DB_STATUSES = ["completed", "FT", "AET", "PEN"];
const CANCELLED_DB_STATUSES = ["cancelled", "PST", "CANC", "ABD", "AWD", "WO"];

/** Window during which DB-status="upcoming" but kickoff has passed → still treat as live. */
const LIVE_WINDOW_MS = 2.5 * 60 * 60 * 1000; // 2.5h
const COMPLETED_PENDING_MS = 4 * 60 * 60 * 1000; // 2.5h–4h

export function deriveMatchPhase(dbStatus: string, matchDate: string): MatchPhase {
  if (LIVE_DB_STATUSES.includes(dbStatus)) return "live";
  if (COMPLETED_DB_STATUSES.includes(dbStatus)) return "completed";
  if (CANCELLED_DB_STATUSES.includes(dbStatus)) return "cancelled";

  if (dbStatus === "upcoming") {
    const kickoff = new Date(matchDate).getTime();
    const sinceKickoff = Date.now() - kickoff;
    if (sinceKickoff >= 0 && sinceKickoff < LIVE_WINDOW_MS) {
      return "transition_live";
    }
    if (sinceKickoff >= LIVE_WINDOW_MS && sinceKickoff < COMPLETED_PENDING_MS) {
      return "completed_pending";
    }
  }

  return "upcoming";
}

/** True if the phase indicates the match should poll live data. */
export function isMatchLive(phase: MatchPhase): boolean {
  return phase === "live" || phase === "transition_live";
}

/** True if a live API response status_short means a fixture is currently being played. */
export function isLiveLikeApiStatus(short?: string | null): boolean {
  if (!short) return false;
  return ["LIVE", "1H", "2H", "HT", "ET", "BT", "P"].includes(short);
}
