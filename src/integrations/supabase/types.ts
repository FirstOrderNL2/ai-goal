export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      leagues: {
        Row: {
          api_football_id: number
          country: string
          created_at: string
          id: string
          logo_url: string | null
          name: string
          season: number
          standings_data: Json | null
          type: string | null
          updated_at: string
        }
        Insert: {
          api_football_id: number
          country: string
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          season: number
          standings_data?: Json | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          api_football_id?: number
          country?: string
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          season?: number
          standings_data?: Json | null
          type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      match_context: {
        Row: {
          h2h_summary: string | null
          id: string
          injuries_away: Json | null
          injuries_home: Json | null
          lineup_away: Json | null
          lineup_home: Json | null
          match_id: string
          news_items: Json | null
          scraped_at: string
          suspensions: Json | null
          weather: string | null
        }
        Insert: {
          h2h_summary?: string | null
          id?: string
          injuries_away?: Json | null
          injuries_home?: Json | null
          lineup_away?: Json | null
          lineup_home?: Json | null
          match_id: string
          news_items?: Json | null
          scraped_at?: string
          suspensions?: Json | null
          weather?: string | null
        }
        Update: {
          h2h_summary?: string | null
          id?: string
          injuries_away?: Json | null
          injuries_home?: Json | null
          lineup_away?: Json | null
          lineup_home?: Json | null
          match_id?: string
          news_items?: Json | null
          scraped_at?: string
          suspensions?: Json | null
          weather?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_context_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_features: {
        Row: {
          away_avg_conceded: number | null
          away_avg_scored: number | null
          away_btts_pct: number | null
          away_clean_sheet_pct: number | null
          away_form_last5: string | null
          computed_at: string
          created_at: string
          h2h_results: Json | null
          home_avg_conceded: number | null
          home_avg_scored: number | null
          home_btts_pct: number | null
          home_clean_sheet_pct: number | null
          home_form_last5: string | null
          id: string
          league_position_away: number | null
          league_position_home: number | null
          match_id: string
          poisson_xg_away: number | null
          poisson_xg_home: number | null
          position_diff: number | null
          volatility_score: number | null
        }
        Insert: {
          away_avg_conceded?: number | null
          away_avg_scored?: number | null
          away_btts_pct?: number | null
          away_clean_sheet_pct?: number | null
          away_form_last5?: string | null
          computed_at?: string
          created_at?: string
          h2h_results?: Json | null
          home_avg_conceded?: number | null
          home_avg_scored?: number | null
          home_btts_pct?: number | null
          home_clean_sheet_pct?: number | null
          home_form_last5?: string | null
          id?: string
          league_position_away?: number | null
          league_position_home?: number | null
          match_id: string
          poisson_xg_away?: number | null
          poisson_xg_home?: number | null
          position_diff?: number | null
          volatility_score?: number | null
        }
        Update: {
          away_avg_conceded?: number | null
          away_avg_scored?: number | null
          away_btts_pct?: number | null
          away_clean_sheet_pct?: number | null
          away_form_last5?: string | null
          computed_at?: string
          created_at?: string
          h2h_results?: Json | null
          home_avg_conceded?: number | null
          home_avg_scored?: number | null
          home_btts_pct?: number | null
          home_clean_sheet_pct?: number | null
          home_form_last5?: string | null
          id?: string
          league_position_away?: number | null
          league_position_home?: number | null
          match_id?: string
          poisson_xg_away?: number | null
          poisson_xg_home?: number | null
          position_diff?: number | null
          volatility_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "match_features_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          ai_accuracy_score: number | null
          ai_insights: string | null
          ai_post_match_review: string | null
          api_football_id: number | null
          created_at: string
          fun_facts: string[] | null
          goals_away: number | null
          goals_home: number | null
          id: string
          league: string
          match_date: string
          referee: string | null
          round: string | null
          sportradar_id: string | null
          status: string
          team_away_id: string
          team_home_id: string
          xg_away: number | null
          xg_home: number | null
        }
        Insert: {
          ai_accuracy_score?: number | null
          ai_insights?: string | null
          ai_post_match_review?: string | null
          api_football_id?: number | null
          created_at?: string
          fun_facts?: string[] | null
          goals_away?: number | null
          goals_home?: number | null
          id?: string
          league: string
          match_date: string
          referee?: string | null
          round?: string | null
          sportradar_id?: string | null
          status?: string
          team_away_id: string
          team_home_id: string
          xg_away?: number | null
          xg_home?: number | null
        }
        Update: {
          ai_accuracy_score?: number | null
          ai_insights?: string | null
          ai_post_match_review?: string | null
          api_football_id?: number | null
          created_at?: string
          fun_facts?: string[] | null
          goals_away?: number | null
          goals_home?: number | null
          id?: string
          league?: string
          match_date?: string
          referee?: string | null
          round?: string | null
          sportradar_id?: string | null
          status?: string
          team_away_id?: string
          team_home_id?: string
          xg_away?: number | null
          xg_home?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_team_away_id_fkey"
            columns: ["team_away_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team_home_id_fkey"
            columns: ["team_home_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      model_performance: {
        Row: {
          avg_brier_1x2: number | null
          avg_brier_btts: number | null
          avg_brier_ou: number | null
          btts_accuracy: number | null
          calibration_data: Json | null
          created_at: string | null
          exact_score_hits: number | null
          feature_weights: Json | null
          goal_line_accuracy: Json | null
          id: string
          mae_goals: number | null
          numeric_weights: Json | null
          ou_25_accuracy: number | null
          outcome_accuracy: number | null
          period_end: string
          period_start: string
          total_matches: number | null
          weak_areas: Json | null
        }
        Insert: {
          avg_brier_1x2?: number | null
          avg_brier_btts?: number | null
          avg_brier_ou?: number | null
          btts_accuracy?: number | null
          calibration_data?: Json | null
          created_at?: string | null
          exact_score_hits?: number | null
          feature_weights?: Json | null
          goal_line_accuracy?: Json | null
          id?: string
          mae_goals?: number | null
          numeric_weights?: Json | null
          ou_25_accuracy?: number | null
          outcome_accuracy?: number | null
          period_end: string
          period_start: string
          total_matches?: number | null
          weak_areas?: Json | null
        }
        Update: {
          avg_brier_1x2?: number | null
          avg_brier_btts?: number | null
          avg_brier_ou?: number | null
          btts_accuracy?: number | null
          calibration_data?: Json | null
          created_at?: string | null
          exact_score_hits?: number | null
          feature_weights?: Json | null
          goal_line_accuracy?: Json | null
          id?: string
          mae_goals?: number | null
          numeric_weights?: Json | null
          ou_25_accuracy?: number | null
          outcome_accuracy?: number | null
          period_end?: string
          period_start?: string
          total_matches?: number | null
          weak_areas?: Json | null
        }
        Relationships: []
      }
      odds: {
        Row: {
          away_win_odds: number
          created_at: string
          draw_odds: number
          home_win_odds: number
          id: string
          match_id: string
        }
        Insert: {
          away_win_odds: number
          created_at?: string
          draw_odds: number
          home_win_odds: number
          id?: string
          match_id: string
        }
        Update: {
          away_win_odds?: number
          created_at?: string
          draw_odds?: number
          home_win_odds?: number
          id?: string
          match_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "odds_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          age: number | null
          api_football_id: number
          created_at: string
          id: string
          name: string
          nationality: string | null
          photo_url: string | null
          position: string | null
          team_id: string | null
          updated_at: string
        }
        Insert: {
          age?: number | null
          api_football_id: number
          created_at?: string
          id?: string
          name: string
          nationality?: string | null
          photo_url?: string | null
          position?: string | null
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          age?: number | null
          api_football_id?: number
          created_at?: string
          id?: string
          name?: string
          nationality?: string | null
          photo_url?: string | null
          position?: string | null
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      prediction_reviews: {
        Row: {
          actual_outcome: string | null
          btts_correct: boolean | null
          confidence_at_prediction: number | null
          created_at: string | null
          error_type: string | null
          goals_error: number | null
          id: string
          league: string | null
          match_id: string
          ou_correct: boolean | null
          outcome_correct: boolean | null
          predicted_outcome: string | null
          score_correct: boolean | null
        }
        Insert: {
          actual_outcome?: string | null
          btts_correct?: boolean | null
          confidence_at_prediction?: number | null
          created_at?: string | null
          error_type?: string | null
          goals_error?: number | null
          id?: string
          league?: string | null
          match_id: string
          ou_correct?: boolean | null
          outcome_correct?: boolean | null
          predicted_outcome?: string | null
          score_correct?: boolean | null
        }
        Update: {
          actual_outcome?: string | null
          btts_correct?: boolean | null
          confidence_at_prediction?: number | null
          created_at?: string | null
          error_type?: string | null
          goals_error?: number | null
          id?: string
          league?: string | null
          match_id?: string
          ou_correct?: boolean | null
          outcome_correct?: boolean | null
          predicted_outcome?: string | null
          score_correct?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "prediction_reviews_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      predictions: {
        Row: {
          ai_reasoning: string | null
          away_win: number
          best_pick: string | null
          best_pick_confidence: number | null
          btts: string | null
          created_at: string
          draw: number
          expected_goals_away: number
          expected_goals_home: number
          goal_distribution: Json | null
          goal_lines: Json | null
          home_win: number
          id: string
          last_prediction_at: string | null
          match_id: string
          model_confidence: number
          over_under_25: string
          pre_match_snapshot: Json | null
          predicted_score_away: number | null
          predicted_score_home: number | null
          prediction_intervals: Json | null
        }
        Insert: {
          ai_reasoning?: string | null
          away_win: number
          best_pick?: string | null
          best_pick_confidence?: number | null
          btts?: string | null
          created_at?: string
          draw: number
          expected_goals_away: number
          expected_goals_home: number
          goal_distribution?: Json | null
          goal_lines?: Json | null
          home_win: number
          id?: string
          last_prediction_at?: string | null
          match_id: string
          model_confidence?: number
          over_under_25?: string
          pre_match_snapshot?: Json | null
          predicted_score_away?: number | null
          predicted_score_home?: number | null
          prediction_intervals?: Json | null
        }
        Update: {
          ai_reasoning?: string | null
          away_win?: number
          best_pick?: string | null
          best_pick_confidence?: number | null
          btts?: string | null
          created_at?: string
          draw?: number
          expected_goals_away?: number
          expected_goals_home?: number
          goal_distribution?: Json | null
          goal_lines?: Json | null
          home_win?: number
          id?: string
          last_prediction_at?: string | null
          match_id?: string
          model_confidence?: number
          over_under_25?: string
          pre_match_snapshot?: Json | null
          predicted_score_away?: number | null
          predicted_score_home?: number | null
          prediction_intervals?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "predictions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      referees: {
        Row: {
          foul_avg: number | null
          id: string
          matches_officiated: number | null
          name: string
          penalty_avg: number | null
          red_avg: number | null
          updated_at: string | null
          yellow_avg: number | null
        }
        Insert: {
          foul_avg?: number | null
          id?: string
          matches_officiated?: number | null
          name: string
          penalty_avg?: number | null
          red_avg?: number | null
          updated_at?: string | null
          yellow_avg?: number | null
        }
        Update: {
          foul_avg?: number | null
          id?: string
          matches_officiated?: number | null
          name?: string
          penalty_avg?: number | null
          red_avg?: number | null
          updated_at?: string | null
          yellow_avg?: number | null
        }
        Relationships: []
      }
      team_discipline: {
        Row: {
          foul_avg: number | null
          id: string
          matches_counted: number | null
          red_avg: number | null
          season: number
          team_id: string
          updated_at: string | null
          yellow_avg: number | null
        }
        Insert: {
          foul_avg?: number | null
          id?: string
          matches_counted?: number | null
          red_avg?: number | null
          season: number
          team_id: string
          updated_at?: string | null
          yellow_avg?: number | null
        }
        Update: {
          foul_avg?: number | null
          id?: string
          matches_counted?: number | null
          red_avg?: number | null
          season?: number
          team_id?: string
          updated_at?: string | null
          yellow_avg?: number | null
        }
        Relationships: []
      }
      team_statistics: {
        Row: {
          avg_goals_conceded: number
          avg_goals_scored: number
          away_record: Json | null
          clean_sheets: number
          created_at: string
          draws: number
          failed_to_score: number
          form: string | null
          goal_diff: number
          goals_against: number
          goals_for: number
          home_record: Json | null
          id: string
          league_id: string
          losses: number
          matches_played: number
          season: number
          team_id: string
          updated_at: string
          wins: number
        }
        Insert: {
          avg_goals_conceded?: number
          avg_goals_scored?: number
          away_record?: Json | null
          clean_sheets?: number
          created_at?: string
          draws?: number
          failed_to_score?: number
          form?: string | null
          goal_diff?: number
          goals_against?: number
          goals_for?: number
          home_record?: Json | null
          id?: string
          league_id: string
          losses?: number
          matches_played?: number
          season: number
          team_id: string
          updated_at?: string
          wins?: number
        }
        Update: {
          avg_goals_conceded?: number
          avg_goals_scored?: number
          away_record?: Json | null
          clean_sheets?: number
          created_at?: string
          draws?: number
          failed_to_score?: number
          form?: string | null
          goal_diff?: number
          goals_against?: number
          goals_for?: number
          home_record?: Json | null
          id?: string
          league_id?: string
          losses?: number
          matches_played?: number
          season?: number
          team_id?: string
          updated_at?: string
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "team_statistics_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_statistics_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          api_football_id: number | null
          country: string
          created_at: string
          id: string
          league: string
          logo_url: string | null
          name: string
          sportmonks_id: number | null
          sportradar_id: string | null
        }
        Insert: {
          api_football_id?: number | null
          country: string
          created_at?: string
          id?: string
          league: string
          logo_url?: string | null
          name: string
          sportmonks_id?: number | null
          sportradar_id?: string | null
        }
        Update: {
          api_football_id?: number | null
          country?: string
          created_at?: string
          id?: string
          league?: string
          logo_url?: string | null
          name?: string
          sportmonks_id?: number | null
          sportradar_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
