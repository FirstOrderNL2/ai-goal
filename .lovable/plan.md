

# Phase 1 Execution — Data Foundation Stabilization

All required code already exists from prior phases (temporal guards, snapshot writer, backfill functions, run-loop driver, populate-referees). This plan **executes** them and verifies against the KPI gates. No new logic is built.

## Current state (live)
- snapshots: **23 / 528** predictions
- training_only rows: **0**
- odds matches: **149**
- referees: **0**
- enrichment / intelligence: 208 / 211

## Execution steps

### 1. Snapshot backfill → ≥ 2,000
Invoke `run-backfill-loop` repeatedly:
```json
POST /run-backfill-loop
{ "target": "predictions", "batch": 25, "max_iterations": 80, "stop_at": 2000 }
```
Re-invoke (each call ≈ 80 iterations × 25 = ~2,000 candidates) until response shows `stopped_early: true` with `snapshot_count >= 2000` or `exhausted: true`.
Temporal guard inside `generate-statistical-prediction` already nullifies post-match `enrichment` / `intelligence` — no extra leakage work needed.

### 2. Odds backfill → ≥ 80% of published predictions
Two passes:
```json
POST /run-backfill-loop { "target": "odds", "scope": "upcoming",  "batch": 30, "max_iterations": 30 }
POST /run-backfill-loop { "target": "odds", "scope": "completed", "batch": 30, "max_iterations": 60 }
```
API-Football frequently lacks odds for older fixtures; loop terminates when `candidates: 0`. Acceptable floor: ≥ 80% on **published** predictions (per KPI), not on all completed matches.

### 3. Referees populate
```json
POST /populate-referees
```
One call seeds the table from `team_discipline` aggregates over officiated matches. Removes the dead-feature condition for `ref_strictness`.

### 4. Verification query
After runs, fetch `dataset-validation-report` and confirm:
- `with_feature_snapshot_pct` → snapshot count ≥ 2,000
- `odds_coverage_pct` (on published predictions) ≥ 80
- `orphan_rows` all zero
- `referees` count > 0

## KPI gate (Phase 1 PASS criteria)
| Check | Target | Verification |
|---|---|---|
| Snapshots | ≥ 2,000 | `SELECT count(*) FROM predictions WHERE feature_snapshot IS NOT NULL` |
| Odds coverage (published) | ≥ 80% | join `predictions` (publish_status='published') ↔ `odds` |
| Leakage guard | active | code already in `generate-statistical-prediction` lines 157–168 |
| Referees populated | > 0 | `SELECT count(*) FROM referees` |
| FK integrity | 0 orphans | already verified in audit |

## Failure handling
- If snapshot loop stalls below 2,000 due to repeated errors, fetch `supabase--edge_function_logs` for `generate-statistical-prediction` and report sample errors; a likely cause is missing `team_statistics` for older seasons — those matches are skipped, not retried.
- If odds API quota is hit, second pass on `completed` is reduced or postponed.
- Final report compares actual vs target and flags any KPI miss explicitly. **Do not declare Phase 1 complete unless all four KPIs pass.**

## Out of scope (deferred to Phase 2)
- LightGBM training, hybrid simulation, ML evaluation harness.

