import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ModelPerformance {
  id: string;
  period_start: string;
  period_end: string;
  total_matches: number;
  outcome_accuracy: number;
  ou_25_accuracy: number;
  btts_accuracy: number;
  exact_score_hits: number;
  avg_brier_1x2: number;
  avg_brier_ou: number;
  avg_brier_btts: number;
  mae_goals: number;
  calibration_data: Record<string, { avg_predicted: number; actual_rate: number; count: number }>;
  goal_line_accuracy: Record<string, number>;
  feature_weights: Record<string, number>;
  weak_areas: string[];
  created_at: string;
  model_version: number;
  validation_result: string;
  last_learning_match_count: number;
  calibration_corrections: Record<string, number>;
  error_weights: Record<string, number>;
}

export function useModelPerformance() {
  return useQuery({
    queryKey: ["model-performance"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("model_performance")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as unknown as ModelPerformance[];
    },
  });
}

export function useLatestPerformance() {
  return useQuery({
    queryKey: ["model-performance", "latest"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("model_performance")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (error && error.code !== "PGRST116") throw error;
      return data as unknown as ModelPerformance | null;
    },
  });
}
