

# Add Prediction History Timeline to Match Detail Page

## Overview
Create a new `PredictionHistoryCard` component that renders a vertical timeline of all `prediction_intervals` entries, showing when each prediction was generated and its type (initial, refresh, or HT).

## Changes

### 1. New file: `src/components/PredictionHistoryCard.tsx`
- Accepts `prediction: Prediction` prop
- Reads `prediction_intervals` array (each entry has `{ time: string, type?: string }`)
- Renders a vertical timeline with:
  - Dot indicator (green for HT, primary for others)
  - Formatted timestamp (e.g., "Apr 4, 14:32")
  - Label: "HT Prediction" for HT type, "Initial" for the first entry, "Refresh" for subsequent ones
  - Relative time (e.g., "12m ago") using simple date math
- Uses `Clock` icon from lucide-react in the card header
- Shows "No prediction history yet" if the array is empty or missing
- Timeline ordered newest-first for readability

### 2. Update: `src/pages/MatchDetail.tsx`
- Import `PredictionHistoryCard`
- Render it after the PredictionComparisonCard section (around line 155), conditionally when `prediction` exists:
  ```tsx
  {prediction && <PredictionHistoryCard prediction={prediction} />}
  ```

No database or migration changes needed — all data already exists in `prediction_intervals`.

