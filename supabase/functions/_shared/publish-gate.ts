// Shared publish-gate logic used by generate-statistical-prediction and generate-ai-prediction.
// Single source of truth — keep both functions aligned to avoid silent overrides.

export const leagueReliabilityTable: Record<string, number> = {
  "premier league": 1.0,
  "bundesliga": 1.0,
  "la liga": 0.95,
  "serie a": 0.95,
  "ligue 1": 0.9,
  "eredivisie": 0.85,
  "championship": 0.75,
  "keuken kampioen divisie": 0.7,
};

export function getLeagueReliability(league: string | null | undefined): number {
  return leagueReliabilityTable[(league || "").toLowerCase()] ?? 0.85;
}

export interface PublishGateInput {
  dataQuality: number;
  leagueRelFactor: number;
  hasAnyTeamId: boolean;
  confidence: number;
}

export interface PublishGateResult {
  publishStatus: "published" | "low_quality";
  generationStatus: "success" | "partial" | "failed";
  isPartial: boolean;
  isSoftBand: boolean;
  isBroken: boolean;
  cappedConfidence: number;
}

// Mirrors generate-statistical-prediction P6. Use everywhere predictions are written.
// - low_quality only if league reliability is collapsed OR both team IDs missing.
// - partial: dataQuality < 0.30 → cap confidence at 0.40.
// - soft band: 0.30 <= dataQuality < 0.45 → cap confidence at 0.45.
export function computePublishGate(input: PublishGateInput): PublishGateResult {
  const { dataQuality, leagueRelFactor, hasAnyTeamId } = input;
  let confidence = input.confidence;

  const isPartial = dataQuality < 0.30;
  const isSoftBand = dataQuality >= 0.30 && dataQuality < 0.45;
  const isBroken = leagueRelFactor < 0.50 || !hasAnyTeamId;

  const publishStatus: "published" | "low_quality" = isBroken ? "low_quality" : "published";

  if (publishStatus === "published") {
    if (isPartial) confidence = Math.min(confidence, 0.40);
    else if (isSoftBand) confidence = Math.min(confidence, 0.45);
  }

  const generationStatus: "success" | "partial" | "failed" = isBroken
    ? "failed"
    : isPartial
      ? "partial"
      : "success";

  return {
    publishStatus,
    generationStatus,
    isPartial,
    isSoftBand,
    isBroken,
    cappedConfidence: confidence,
  };
}
