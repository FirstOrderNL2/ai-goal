
Let me look at the current Accuracy page to plan enhancements.
<lov-tool-use id="toolu_vrtx_01TuFEPXo5Q36AQ95cwpYC4T" name="code--view" integration-id="code" data="{\"file_path\": \"src/pages/Accuracy.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_012gRJECMma81PiUEVCYprhF" name="code--view" integration-id="code" data="{\"file_path\": \"src/pages/Accuracy.tsx\"}">
</lov-tool-use>
<lov-plan>

## Plan: Enhance Accuracy Dashboard with Model Versioning & Active Weights

Add v2 learning system observability to `/accuracy`.

### New Section 1: Model Version Header Card (top of page)
- Large badge showing **Model v{N}** (e.g., "Model v4")
- Validation status pill: `bootstrap` (blue), `passed` (green), `failed` (red), `pending` (gray)
- Cycle progress: "1000/1050 matches" with progress bar toward next learning cycle (50-match gate)
- Last computed timestamp + "matches since last learning cycle" counter

### New Section 2: Active Learned Weights Card
Grid display of weights from `numeric_weights`, `error_weights`, `calibration_corrections`:

**Numeric Weights** (4 mini-stat tiles):
- `home_bias_adjustment`
- `draw_calibration` (highlighted — primary lever)
- `confidence_deflator`
- `ou_lambda_adjustment`

**Error Weights** (3 tiles, colored by direction):
- `draw_overpredict_penalty` (red tint)
- `draw_underpredict_boost` (green tint)
- `overconfidence_penalty` (red tint)

**League Penalties** (compact list):
- Show all `league_penalty_*` keys with values

### New Section 3: Per-Bucket Calibration Corrections Chart
- Bar chart showing each confidence band (30-40, 40-50, ..., 80-90) with its applied correction
- Color: red if negative correction (penalty), green if positive (boost)
- Tooltip explains "predicted X% → actual Y%, correction Z"

### New Section 4: Model Version History Table
- Table of last 10 versions: `version | created | total_matches | 1X2 acc | validation | active`
- Highlight currently active version
- Show validation result with colored badge

### Enhancements to Existing Sections
- **Header subtitle**: append "Model v{N} active"
- **Learning Trend chart**: overlay vertical reference lines at version boundaries
- **Error Patterns section**: add tooltip explaining which errors map to which `error_weights`
- **Summary stat cards**: add a 7th card "Model Version" alongside the 6 existing tiles
- Refactor page max-width from `max-w-4xl` to `max-w-6xl` to fit the new content comfortably

### Files Modified
- `src/pages/Accuracy.tsx` — add new sections, update header, widen container
- `src/hooks/useModelPerformance.ts` — already has all required fields (verified); no changes needed

### Technical Notes
- All data already exists in the `model_performance` table; no migration or edge function changes required
- `useModelPerformance()` already returns the last 10 versions for the history table
- `useLatestPerformance()` provides the active model record

