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
      matches: {
        Row: {
          ai_insights: string | null
          api_football_id: number | null
          created_at: string
          fun_facts: string[] | null
          goals_away: number | null
          goals_home: number | null
          id: string
          league: string
          match_date: string
          round: string | null
          sportradar_id: string | null
          status: string
          team_away_id: string
          team_home_id: string
          xg_away: number | null
          xg_home: number | null
        }
        Insert: {
          ai_insights?: string | null
          api_football_id?: number | null
          created_at?: string
          fun_facts?: string[] | null
          goals_away?: number | null
          goals_home?: number | null
          id?: string
          league: string
          match_date: string
          round?: string | null
          sportradar_id?: string | null
          status?: string
          team_away_id: string
          team_home_id: string
          xg_away?: number | null
          xg_home?: number | null
        }
        Update: {
          ai_insights?: string | null
          api_football_id?: number | null
          created_at?: string
          fun_facts?: string[] | null
          goals_away?: number | null
          goals_home?: number | null
          id?: string
          league?: string
          match_date?: string
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
      predictions: {
        Row: {
          away_win: number
          created_at: string
          draw: number
          expected_goals_away: number
          expected_goals_home: number
          home_win: number
          id: string
          match_id: string
          model_confidence: number
          over_under_25: string
        }
        Insert: {
          away_win: number
          created_at?: string
          draw: number
          expected_goals_away: number
          expected_goals_home: number
          home_win: number
          id?: string
          match_id: string
          model_confidence?: number
          over_under_25?: string
        }
        Update: {
          away_win?: number
          created_at?: string
          draw?: number
          expected_goals_away?: number
          expected_goals_home?: number
          home_win?: number
          id?: string
          match_id?: string
          model_confidence?: number
          over_under_25?: string
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
