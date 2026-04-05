/**
 * Centralized match phase logic.
 * Derives a display phase from DB status + kickoff time so the UI
 * can instantly move matches into the correct section without waiting
 * for the backend sync to flip the status.
 */

export type MatchPhase = "upcoming" | "transition_live" | "live" | "completed" | "cancelled";

const LIVE_DB_STATUSES = ["live", "1H", "2H", "HT", "ET"];
const COMPLETED_DB_STATUSES = ["completed", "FT", "AET", "PEN"];
const CANCELLED_DB_STATUSES = ["cancelled", "PST", "CANC", "ABD", "AWD", "WO"];

/** How long after kickoff we consider the match "transition_live" (3 hours). */
const TRANSITION_WINDOW_MS = 3 * 60 * 60 * 1000;

export function deriveMatchPhase(dbStatus: string, matchDate: string): MatchPhase {
  // Already live in DB
  if (LIVE_DB_STATUSES.includes(dbStatus)) return "live";

  // Already completed
  if (COMPLETED_DB_STATUSES.includes(dbStatus)) return "completed";

  // Cancelled / postponed
  if (CANCELLED_DB_STATUSES.includes(dbStatus)) return "cancelled";

  // DB says "upcoming" but kickoff has passed → transition_live
  if (dbStatus === "upcoming") {
    const kickoff = new Date(matchDate).getTime();
    const now = Date.now();
    if (now >= kickoff && now - kickoff < TRANSITION_WINDOW_MS) {
      return "transition_live";
    }
  }

  return "upcoming";
}

/** Returns true if the derived phase means the match is active / should poll live. */
export function isMatchLive(phase: MatchPhase): boolean {
  return phase === "live" || phase === "transition_live";
}
