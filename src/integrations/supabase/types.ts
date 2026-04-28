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
      calibration_events: {
        Row: {
          actual_outcome: boolean
          bucket: string
          created_at: string
          id: string
          league: string | null
          market: string
          match_id: string
          model_version: string
          predicted_probability: number
          prediction_run_id: string
        }
        Insert: {
          actual_outcome: boolean
          bucket: string
          created_at?: string
          id?: string
          league?: string | null
          market: string
          match_id: string
          model_version?: string
          predicted_probability: number
          prediction_run_id: string
        }
        Update: {
          actual_outcome?: boolean
          bucket?: string
          created_at?: string
          id?: string
          league?: string | null
          market?: string
          match_id?: string
          model_version?: string
          predicted_probability?: number
          prediction_run_id?: string
        }
        Relationships: []
      }
      comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "prediction_comments"
            referencedColumns: ["id"]
          },
        ]
      }
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
      match_enrichment: {
        Row: {
          enriched_at: string
          formation_away: string | null
          formation_home: string | null
          frozen_at: string | null
          frozen_for_match_date: string | null
          id: string
          key_player_missing_away: number | null
          key_player_missing_home: number | null
          lineup_confirmed: boolean | null
          match_id: string
          news_sentiment_away: number | null
          news_sentiment_home: number | null
          odds_movement_away: number | null
          odds_movement_home: number | null
          referee_cards_avg: number | null
          social_sentiment: number | null
          sources: Json | null
          weather_impact: number | null
        }
        Insert: {
          enriched_at?: string
          formation_away?: string | null
          formation_home?: string | null
          frozen_at?: string | null
          frozen_for_match_date?: string | null
          id?: string
          key_player_missing_away?: number | null
          key_player_missing_home?: number | null
          lineup_confirmed?: boolean | null
          match_id: string
          news_sentiment_away?: number | null
          news_sentiment_home?: number | null
          odds_movement_away?: number | null
          odds_movement_home?: number | null
          referee_cards_avg?: number | null
          social_sentiment?: number | null
          sources?: Json | null
          weather_impact?: number | null
        }
        Update: {
          enriched_at?: string
          formation_away?: string | null
          formation_home?: string | null
          frozen_at?: string | null
          frozen_for_match_date?: string | null
          id?: string
          key_player_missing_away?: number | null
          key_player_missing_home?: number | null
          lineup_confirmed?: boolean | null
          match_id?: string
          news_sentiment_away?: number | null
          news_sentiment_home?: number | null
          odds_movement_away?: number | null
          odds_movement_home?: number | null
          referee_cards_avg?: number | null
          social_sentiment?: number | null
          sources?: Json | null
          weather_impact?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "match_enrichment_match_id_fkey"
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
      match_intelligence: {
        Row: {
          confidence_adjustment: number | null
          context_summary: string | null
          frozen_at: string | null
          frozen_for_match_date: string | null
          generated_at: string
          id: string
          market_signal: Json | null
          match_id: string
          match_narrative: string | null
          momentum_away: number | null
          momentum_home: number | null
          player_impacts: Json | null
          tactical_analysis: Json | null
        }
        Insert: {
          confidence_adjustment?: number | null
          context_summary?: string | null
          frozen_at?: string | null
          frozen_for_match_date?: string | null
          generated_at?: string
          id?: string
          market_signal?: Json | null
          match_id: string
          match_narrative?: string | null
          momentum_away?: number | null
          momentum_home?: number | null
          player_impacts?: Json | null
          tactical_analysis?: Json | null
        }
        Update: {
          confidence_adjustment?: number | null
          context_summary?: string | null
          frozen_at?: string | null
          frozen_for_match_date?: string | null
          generated_at?: string
          id?: string
          market_signal?: Json | null
          match_id?: string
          match_narrative?: string | null
          momentum_away?: number | null
          momentum_home?: number | null
          player_impacts?: Json | null
          tactical_analysis?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "match_intelligence_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_labels: {
        Row: {
          btts: boolean
          finalized_at: string
          goals_away: number
          goals_home: number
          match_id: string
          outcome: string
          over_05: boolean
          over_15: boolean
          over_25: boolean
          over_35: boolean
          source: string
          total_goals: number
        }
        Insert: {
          btts: boolean
          finalized_at?: string
          goals_away: number
          goals_home: number
          match_id: string
          outcome: string
          over_05: boolean
          over_15: boolean
          over_25: boolean
          over_35: boolean
          source?: string
          total_goals: number
        }
        Update: {
          btts?: boolean
          finalized_at?: string
          goals_away?: number
          goals_home?: number
          match_id?: string
          outcome?: string
          over_05?: boolean
          over_15?: boolean
          over_25?: boolean
          over_35?: boolean
          source?: string
          total_goals?: number
        }
        Relationships: []
      }
      matches: {
        Row: {
          ai_accuracy_score: number | null
          ai_insights: string | null
          ai_post_match_review: string | null
          api_football_id: number | null
          competition_type: string | null
          created_at: string
          fun_facts: string[] | null
          goals_away: number | null
          goals_home: number | null
          id: string
          league: string
          match_date: string
          match_importance: number | null
          match_stage: string | null
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
          competition_type?: string | null
          created_at?: string
          fun_facts?: string[] | null
          goals_away?: number | null
          goals_home?: number | null
          id?: string
          league: string
          match_date: string
          match_importance?: number | null
          match_stage?: string | null
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
          competition_type?: string | null
          created_at?: string
          fun_facts?: string[] | null
          goals_away?: number | null
          goals_home?: number | null
          id?: string
          league?: string
          match_date?: string
          match_importance?: number | null
          match_stage?: string | null
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
          calibration_corrections: Json | null
          calibration_data: Json | null
          created_at: string | null
          error_weights: Json | null
          exact_score_hits: number | null
          feature_weights: Json | null
          goal_line_accuracy: Json | null
          id: string
          last_learning_match_count: number | null
          mae_goals: number | null
          model_version: number | null
          numeric_weights: Json | null
          ou_25_accuracy: number | null
          outcome_accuracy: number | null
          period_end: string
          period_start: string
          total_matches: number | null
          validation_metrics: Json | null
          validation_result: string | null
          validation_weights_tested: Json | null
          weak_areas: Json | null
        }
        Insert: {
          avg_brier_1x2?: number | null
          avg_brier_btts?: number | null
          avg_brier_ou?: number | null
          btts_accuracy?: number | null
          calibration_corrections?: Json | null
          calibration_data?: Json | null
          created_at?: string | null
          error_weights?: Json | null
          exact_score_hits?: number | null
          feature_weights?: Json | null
          goal_line_accuracy?: Json | null
          id?: string
          last_learning_match_count?: number | null
          mae_goals?: number | null
          model_version?: number | null
          numeric_weights?: Json | null
          ou_25_accuracy?: number | null
          outcome_accuracy?: number | null
          period_end: string
          period_start: string
          total_matches?: number | null
          validation_metrics?: Json | null
          validation_result?: string | null
          validation_weights_tested?: Json | null
          weak_areas?: Json | null
        }
        Update: {
          avg_brier_1x2?: number | null
          avg_brier_btts?: number | null
          avg_brier_ou?: number | null
          btts_accuracy?: number | null
          calibration_corrections?: Json | null
          calibration_data?: Json | null
          created_at?: string | null
          error_weights?: Json | null
          exact_score_hits?: number | null
          feature_weights?: Json | null
          goal_line_accuracy?: Json | null
          id?: string
          last_learning_match_count?: number | null
          mae_goals?: number | null
          model_version?: number | null
          numeric_weights?: Json | null
          ou_25_accuracy?: number | null
          outcome_accuracy?: number | null
          period_end?: string
          period_start?: string
          total_matches?: number | null
          validation_metrics?: Json | null
          validation_result?: string | null
          validation_weights_tested?: Json | null
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
      prediction_comments: {
        Row: {
          comment: string
          created_at: string
          id: string
          parent_id: string | null
          prediction_id: string
          user_id: string
        }
        Insert: {
          comment: string
          created_at?: string
          id?: string
          parent_id?: string | null
          prediction_id: string
          user_id: string
        }
        Update: {
          comment?: string
          created_at?: string
          id?: string
          parent_id?: string | null
          prediction_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prediction_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "prediction_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prediction_comments_prediction_id_fkey"
            columns: ["prediction_id"]
            isOneToOne: false
            referencedRelation: "ml_ready_predictions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prediction_comments_prediction_id_fkey"
            columns: ["prediction_id"]
            isOneToOne: false
            referencedRelation: "predictions"
            referencedColumns: ["id"]
          },
        ]
      }
      prediction_logs: {
        Row: {
          action: string
          created_at: string
          error: string | null
          id: string
          latency_ms: number | null
          match_id: string | null
          status: string
          update_reason: string | null
        }
        Insert: {
          action: string
          created_at?: string
          error?: string | null
          id?: string
          latency_ms?: number | null
          match_id?: string | null
          status: string
          update_reason?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          error?: string | null
          id?: string
          latency_ms?: number | null
          match_id?: string | null
          status?: string
          update_reason?: string | null
        }
        Relationships: []
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
          prediction_id: string | null
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
          prediction_id?: string | null
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
          prediction_id?: string | null
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
          {
            foreignKeyName: "prediction_reviews_prediction_id_fkey"
            columns: ["prediction_id"]
            isOneToOne: false
            referencedRelation: "ml_ready_predictions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prediction_reviews_prediction_id_fkey"
            columns: ["prediction_id"]
            isOneToOne: false
            referencedRelation: "predictions"
            referencedColumns: ["id"]
          },
        ]
      }
      prediction_runs: {
        Row: {
          artifact_version: string | null
          created_at: string
          expected_goals: Json
          feature_snapshot: Json | null
          feature_version: string
          id: string
          match_id: string
          model_version: string
          notes: string | null
          prediction_cutoff_ts: string
          probabilities: Json
          publish_status: string
          run_type: string
          score_distribution: Json | null
          source_function: string | null
          training_only: boolean
        }
        Insert: {
          artifact_version?: string | null
          created_at?: string
          expected_goals?: Json
          feature_snapshot?: Json | null
          feature_version?: string
          id?: string
          match_id: string
          model_version?: string
          notes?: string | null
          prediction_cutoff_ts: string
          probabilities?: Json
          publish_status?: string
          run_type: string
          score_distribution?: Json | null
          source_function?: string | null
          training_only?: boolean
        }
        Update: {
          artifact_version?: string | null
          created_at?: string
          expected_goals?: Json
          feature_snapshot?: Json | null
          feature_version?: string
          id?: string
          match_id?: string
          model_version?: string
          notes?: string | null
          prediction_cutoff_ts?: string
          probabilities?: Json
          publish_status?: string
          run_type?: string
          score_distribution?: Json | null
          source_function?: string | null
          training_only?: boolean
        }
        Relationships: []
      }
      prediction_votes: {
        Row: {
          created_at: string
          id: string
          prediction_id: string
          user_id: string
          vote_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          prediction_id: string
          user_id: string
          vote_type: string
        }
        Update: {
          created_at?: string
          id?: string
          prediction_id?: string
          user_id?: string
          vote_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "prediction_votes_prediction_id_fkey"
            columns: ["prediction_id"]
            isOneToOne: false
            referencedRelation: "ml_ready_predictions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prediction_votes_prediction_id_fkey"
            columns: ["prediction_id"]
            isOneToOne: false
            referencedRelation: "predictions"
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
          current_run_id: string | null
          draw: number
          expected_goals_away: number
          expected_goals_home: number
          feature_snapshot: Json | null
          generation_status: string
          goal_distribution: Json | null
          goal_lines: Json | null
          home_win: number
          id: string
          last_error: string | null
          last_prediction_at: string | null
          match_id: string
          model_confidence: number
          model_version: string | null
          over_under_25: string
          pre_match_snapshot: Json | null
          predicted_score_away: number | null
          predicted_score_home: number | null
          prediction_intervals: Json | null
          publish_status: string
          quality_score: number | null
          retry_count: number
          snapshot_version: string
          training_only: boolean
          update_reason: string | null
        }
        Insert: {
          ai_reasoning?: string | null
          away_win: number
          best_pick?: string | null
          best_pick_confidence?: number | null
          btts?: string | null
          created_at?: string
          current_run_id?: string | null
          draw: number
          expected_goals_away: number
          expected_goals_home: number
          feature_snapshot?: Json | null
          generation_status?: string
          goal_distribution?: Json | null
          goal_lines?: Json | null
          home_win: number
          id?: string
          last_error?: string | null
          last_prediction_at?: string | null
          match_id: string
          model_confidence?: number
          model_version?: string | null
          over_under_25?: string
          pre_match_snapshot?: Json | null
          predicted_score_away?: number | null
          predicted_score_home?: number | null
          prediction_intervals?: Json | null
          publish_status?: string
          quality_score?: number | null
          retry_count?: number
          snapshot_version?: string
          training_only?: boolean
          update_reason?: string | null
        }
        Update: {
          ai_reasoning?: string | null
          away_win?: number
          best_pick?: string | null
          best_pick_confidence?: number | null
          btts?: string | null
          created_at?: string
          current_run_id?: string | null
          draw?: number
          expected_goals_away?: number
          expected_goals_home?: number
          feature_snapshot?: Json | null
          generation_status?: string
          goal_distribution?: Json | null
          goal_lines?: Json | null
          home_win?: number
          id?: string
          last_error?: string | null
          last_prediction_at?: string | null
          match_id?: string
          model_confidence?: number
          model_version?: string | null
          over_under_25?: string
          pre_match_snapshot?: Json | null
          predicted_score_away?: number | null
          predicted_score_home?: number | null
          prediction_intervals?: Json | null
          publish_status?: string
          quality_score?: number | null
          retry_count?: number
          snapshot_version?: string
          training_only?: boolean
          update_reason?: string | null
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
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          id: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tier: Database["public"]["Enums"]["subscription_tier"]
          trial_ends_at: string
          trial_started_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: Database["public"]["Enums"]["subscription_tier"]
          trial_ends_at?: string
          trial_started_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: Database["public"]["Enums"]["subscription_tier"]
          trial_ends_at?: string
          trial_started_at?: string
          updated_at?: string
          user_id?: string
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
      team_rating_history: {
        Row: {
          attack_after: number
          attack_before: number
          defense_after: number
          defense_before: number
          goals_against: number
          goals_for: number
          home_adv_context: number | null
          id: string
          is_home: boolean
          k_factor: number
          league: string | null
          match_id: string
          rating_winloss_after: number
          rating_winloss_before: number
          team_id: string
          updated_at: string
        }
        Insert: {
          attack_after?: number
          attack_before?: number
          defense_after?: number
          defense_before?: number
          goals_against: number
          goals_for: number
          home_adv_context?: number | null
          id?: string
          is_home: boolean
          k_factor?: number
          league?: string | null
          match_id: string
          rating_winloss_after?: number
          rating_winloss_before?: number
          team_id: string
          updated_at?: string
        }
        Update: {
          attack_after?: number
          attack_before?: number
          defense_after?: number
          defense_before?: number
          goals_against?: number
          goals_for?: number
          home_adv_context?: number | null
          id?: string
          is_home?: boolean
          k_factor?: number
          league?: string | null
          match_id?: string
          rating_winloss_after?: number
          rating_winloss_before?: number
          team_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      team_rating_state: {
        Row: {
          attack: number
          defense: number
          last_match_at: string | null
          last_match_id: string | null
          league: string | null
          matches_counted: number
          rating_winloss: number
          team_id: string
          updated_at: string
        }
        Insert: {
          attack?: number
          defense?: number
          last_match_at?: string | null
          last_match_id?: string | null
          league?: string | null
          matches_counted?: number
          rating_winloss?: number
          team_id: string
          updated_at?: string
        }
        Update: {
          attack?: number
          defense?: number
          last_match_at?: string | null
          last_match_id?: string | null
          league?: string | null
          matches_counted?: number
          rating_winloss?: number
          team_id?: string
          updated_at?: string
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
      training_examples: {
        Row: {
          created_at: string
          dataset_version: string
          feature_snapshot: Json
          id: string
          label_snapshot: Json
          league: string | null
          match_id: string
          model_family: string
          prediction_cutoff_ts: string
          prediction_run_id: string
        }
        Insert: {
          created_at?: string
          dataset_version?: string
          feature_snapshot: Json
          id?: string
          label_snapshot: Json
          league?: string | null
          match_id: string
          model_family?: string
          prediction_cutoff_ts: string
          prediction_run_id: string
        }
        Update: {
          created_at?: string
          dataset_version?: string
          feature_snapshot?: Json
          id?: string
          label_snapshot?: Json
          league?: string | null
          match_id?: string
          model_family?: string
          prediction_cutoff_ts?: string
          prediction_run_id?: string
        }
        Relationships: []
      }
      training_jobs: {
        Row: {
          champion_metrics_json: Json | null
          created_at: string
          dataset_version: string
          decision: string | null
          error: string | null
          finished_at: string | null
          holdout_window_end: string | null
          holdout_window_start: string | null
          id: string
          metrics_json: Json | null
          model_family: string
          n_holdout: number | null
          n_train: number | null
          notes: string | null
          started_at: string | null
          status: string
          train_window_end: string | null
          train_window_start: string | null
        }
        Insert: {
          champion_metrics_json?: Json | null
          created_at?: string
          dataset_version: string
          decision?: string | null
          error?: string | null
          finished_at?: string | null
          holdout_window_end?: string | null
          holdout_window_start?: string | null
          id?: string
          metrics_json?: Json | null
          model_family: string
          n_holdout?: number | null
          n_train?: number | null
          notes?: string | null
          started_at?: string | null
          status?: string
          train_window_end?: string | null
          train_window_start?: string | null
        }
        Update: {
          champion_metrics_json?: Json | null
          created_at?: string
          dataset_version?: string
          decision?: string | null
          error?: string | null
          finished_at?: string | null
          holdout_window_end?: string | null
          holdout_window_start?: string | null
          id?: string
          metrics_json?: Json | null
          model_family?: string
          n_holdout?: number | null
          n_train?: number | null
          notes?: string | null
          started_at?: string | null
          status?: string
          train_window_end?: string | null
          train_window_start?: string | null
        }
        Relationships: []
      }
      user_performance: {
        Row: {
          accuracy_score: number
          correct_votes: number
          id: string
          last_updated: string
          tier: string
          total_votes: number
          trust_score: number
          user_id: string
        }
        Insert: {
          accuracy_score?: number
          correct_votes?: number
          id?: string
          last_updated?: string
          tier?: string
          total_votes?: number
          trust_score?: number
          user_id: string
        }
        Update: {
          accuracy_score?: number
          correct_votes?: number
          id?: string
          last_updated?: string
          tier?: string
          total_votes?: number
          trust_score?: number
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      data_integrity_v: {
        Row: {
          late_enrichment_count: number | null
          late_intelligence_count: number | null
          late_predictions_count: number | null
          prediction_coverage_24h_pct: number | null
          recheck_distribution_24h: Json | null
          upcoming_24h_total: number | null
        }
        Relationships: []
      }
      ml_readiness_v: {
        Row: {
          feature_snapshots: number | null
          label_coverage: number | null
          labeled_samples: number | null
          ml_status: string | null
          samples_to_target: number | null
        }
        Relationships: []
      }
      ml_ready_predictions: {
        Row: {
          away_win: number | null
          btts: string | null
          created_at: string | null
          draw: number | null
          expected_goals_away: number | null
          expected_goals_home: number | null
          feature_snapshot: Json | null
          goals_away: number | null
          goals_home: number | null
          home_win: number | null
          id: string | null
          league: string | null
          match_date: string | null
          match_id: string | null
          match_status: string | null
          model_confidence: number | null
          over_under_25: string | null
          predicted_score_away: number | null
          predicted_score_home: number | null
          snapshot_version: string | null
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
    }
    Functions: {
      has_access: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      subscription_tier:
        | "trial"
        | "active"
        | "past_due"
        | "canceled"
        | "expired"
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
    Enums: {
      subscription_tier: ["trial", "active", "past_due", "canceled", "expired"],
    },
  },
} as const
