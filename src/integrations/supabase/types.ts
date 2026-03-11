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
      achievements: {
        Row: {
          category: string
          created_at: string | null
          description: string
          icon: string
          id: string
          key: string
          name: string
          xp_reward: number
        }
        Insert: {
          category?: string
          created_at?: string | null
          description: string
          icon?: string
          id?: string
          key: string
          name: string
          xp_reward?: number
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string
          icon?: string
          id?: string
          key?: string
          name?: string
          xp_reward?: number
        }
        Relationships: []
      }
      cards: {
        Row: {
          brand: string | null
          color: string | null
          created_at: string | null
          credit_limit: number | null
          due_day: number | null
          id: string
          last_4_digits: string | null
          name: string
          user_id: string
        }
        Insert: {
          brand?: string | null
          color?: string | null
          created_at?: string | null
          credit_limit?: number | null
          due_day?: number | null
          id?: string
          last_4_digits?: string | null
          name: string
          user_id: string
        }
        Update: {
          brand?: string | null
          color?: string | null
          created_at?: string | null
          credit_limit?: number | null
          due_day?: number | null
          id?: string
          last_4_digits?: string | null
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          budget_limit: number | null
          color: string | null
          created_at: string | null
          icon: string | null
          id: string
          name: string
          user_id: string
        }
        Insert: {
          budget_limit?: number | null
          color?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string
          name: string
          user_id: string
        }
        Update: {
          budget_limit?: number | null
          color?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      challenges: {
        Row: {
          created_at: string | null
          description: string
          ends_at: string | null
          icon: string
          id: string
          is_active: boolean
          starts_at: string | null
          target_value: number
          title: string
          type: string
          xp_reward: number
        }
        Insert: {
          created_at?: string | null
          description: string
          ends_at?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          starts_at?: string | null
          target_value?: number
          title: string
          type?: string
          xp_reward?: number
        }
        Update: {
          created_at?: string | null
          description?: string
          ends_at?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          starts_at?: string | null
          target_value?: number
          title?: string
          type?: string
          xp_reward?: number
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      checkout_rate_limits: {
        Row: {
          attempt_count: number
          user_id: string
          window_start: string
        }
        Insert: {
          attempt_count?: number
          user_id: string
          window_start?: string
        }
        Update: {
          attempt_count?: number
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      family_groups: {
        Row: {
          created_at: string | null
          id: string
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name?: string
          owner_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          owner_id?: string
        }
        Relationships: []
      }
      family_memberships: {
        Row: {
          created_at: string | null
          family_group_id: string
          id: string
          status: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          family_group_id: string
          id?: string
          status?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          family_group_id?: string
          id?: string
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_memberships_family_group_id_fkey"
            columns: ["family_group_id"]
            isOneToOne: false
            referencedRelation: "family_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_goals: {
        Row: {
          color: string | null
          created_at: string | null
          current_amount: number | null
          deadline: string | null
          id: string
          name: string
          target_amount: number | null
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          current_amount?: number | null
          deadline?: string | null
          id?: string
          name: string
          target_amount?: number | null
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          current_amount?: number | null
          deadline?: string | null
          id?: string
          name?: string
          target_amount?: number | null
          user_id?: string
        }
        Relationships: []
      }
      investments: {
        Row: {
          created_at: string | null
          current_amount: number
          id: string
          invested_amount: number
          name: string
          notes: string | null
          purchase_date: string
          type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          current_amount?: number
          id?: string
          invested_amount?: number
          name: string
          notes?: string | null
          purchase_date?: string
          type?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          current_amount?: number
          id?: string
          invested_amount?: number
          name?: string
          notes?: string | null
          purchase_date?: string
          type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          cpf_cnpj: string | null
          created_at: string | null
          display_name: string | null
          has_completed_onboarding: boolean | null
          id: string
          monthly_income: number | null
          notify_email_updates: boolean | null
          notify_monthly_report: boolean | null
          notify_morning: boolean | null
          notify_night: boolean | null
          subscription_expires_at: string | null
          subscription_plan: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          cpf_cnpj?: string | null
          created_at?: string | null
          display_name?: string | null
          has_completed_onboarding?: boolean | null
          id: string
          monthly_income?: number | null
          notify_email_updates?: boolean | null
          notify_monthly_report?: boolean | null
          notify_morning?: boolean | null
          notify_night?: boolean | null
          subscription_expires_at?: string | null
          subscription_plan?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          cpf_cnpj?: string | null
          created_at?: string | null
          display_name?: string | null
          has_completed_onboarding?: boolean | null
          id?: string
          monthly_income?: number | null
          notify_email_updates?: boolean | null
          notify_monthly_report?: boolean | null
          notify_morning?: boolean | null
          notify_night?: boolean | null
          subscription_expires_at?: string | null
          subscription_plan?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      recurring_transactions: {
        Row: {
          amount: number | null
          category_id: string | null
          created_at: string | null
          day_of_month: number | null
          description: string | null
          expense_type: string | null
          id: string
          is_active: boolean | null
          type: string | null
          user_id: string
          wallet_id: string | null
        }
        Insert: {
          amount?: number | null
          category_id?: string | null
          created_at?: string | null
          day_of_month?: number | null
          description?: string | null
          expense_type?: string | null
          id?: string
          is_active?: boolean | null
          type?: string | null
          user_id: string
          wallet_id?: string | null
        }
        Update: {
          amount?: number | null
          category_id?: string | null
          created_at?: string | null
          day_of_month?: number | null
          description?: string | null
          expense_type?: string | null
          id?: string
          is_active?: boolean | null
          type?: string | null
          user_id?: string
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      reminders: {
        Row: {
          created_at: string | null
          description: string | null
          event_at: string
          id: string
          is_active: boolean | null
          is_sent: boolean | null
          notify_minutes_before: number | null
          recurrence: string | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          event_at: string
          id?: string
          is_active?: boolean | null
          is_sent?: boolean | null
          notify_minutes_before?: number | null
          recurrence?: string | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          event_at?: string
          id?: string
          is_active?: boolean | null
          is_sent?: boolean | null
          notify_minutes_before?: number | null
          recurrence?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      support_conversations: {
        Row: {
          created_at: string | null
          id: string
          status: string | null
          subject: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          status?: string | null
          subject?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          status?: string | null
          subject?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string | null
          id: string
          image_url: string | null
          sender_id: string
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          sender_id: string
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "support_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number | null
          card_id: string | null
          category_id: string | null
          created_at: string | null
          date: string | null
          description: string | null
          due_date: string | null
          id: string
          is_paid: boolean | null
          recurring_id: string | null
          type: string | null
          user_id: string
          wallet_id: string | null
        }
        Insert: {
          amount?: number | null
          card_id?: string | null
          category_id?: string | null
          created_at?: string | null
          date?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_paid?: boolean | null
          recurring_id?: string | null
          type?: string | null
          user_id: string
          wallet_id?: string | null
        }
        Update: {
          amount?: number | null
          card_id?: string | null
          category_id?: string | null
          created_at?: string | null
          date?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_paid?: boolean | null
          recurring_id?: string | null
          type?: string | null
          user_id?: string
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_recurring_id_fkey"
            columns: ["recurring_id"]
            isOneToOne: false
            referencedRelation: "recurring_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      user_achievements: {
        Row: {
          achievement_id: string
          id: string
          unlocked_at: string
          user_id: string
        }
        Insert: {
          achievement_id: string
          id?: string
          unlocked_at?: string
          user_id: string
        }
        Update: {
          achievement_id?: string
          id?: string
          unlocked_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
        ]
      }
      user_challenges: {
        Row: {
          challenge_id: string
          completed_at: string | null
          current_value: number
          id: string
          is_completed: boolean
          joined_at: string
          user_id: string
        }
        Insert: {
          challenge_id: string
          completed_at?: string | null
          current_value?: number
          id?: string
          is_completed?: boolean
          joined_at?: string
          user_id: string
        }
        Update: {
          challenge_id?: string
          completed_at?: string | null
          current_value?: number
          id?: string
          is_completed?: boolean
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_challenges_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      user_gamification: {
        Row: {
          last_activity_date: string | null
          level: number
          streak_best: number
          streak_current: number
          updated_at: string | null
          user_id: string
          xp: number
        }
        Insert: {
          last_activity_date?: string | null
          level?: number
          streak_best?: number
          streak_current?: number
          updated_at?: string | null
          user_id: string
          xp?: number
        }
        Update: {
          last_activity_date?: string | null
          level?: number
          streak_best?: number
          streak_current?: number
          updated_at?: string | null
          user_id?: string
          xp?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          balance: number | null
          color: string | null
          created_at: string | null
          icon: string | null
          id: string
          name: string
          type: string | null
          user_id: string
        }
        Insert: {
          balance?: number | null
          color?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string
          name: string
          type?: string | null
          user_id: string
        }
        Update: {
          balance?: number | null
          color?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string
          name?: string
          type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_links: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          phone_number: string | null
          user_id: string
          verification_code: string | null
          verified: boolean | null
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          phone_number?: string | null
          user_id: string
          verification_code?: string | null
          verified?: boolean | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          phone_number?: string | null
          user_id?: string
          verification_code?: string | null
          verified?: boolean | null
        }
        Relationships: []
      }
      whatsapp_pending_transactions: {
        Row: {
          amount: number
          category_id: string | null
          category_name: string | null
          created_at: string
          description: string
          expires_at: string
          id: string
          payment_method: string | null
          phone_number: string
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          category_name?: string | null
          created_at?: string
          description: string
          expires_at?: string
          id?: string
          payment_method?: string | null
          phone_number: string
          type?: string
          user_id: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          category_name?: string | null
          created_at?: string
          description?: string
          expires_at?: string
          id?: string
          payment_method?: string | null
          phone_number?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_rate_limits: {
        Row: {
          message_count: number
          phone_number: string
          window_start: string
        }
        Insert: {
          message_count?: number
          phone_number: string
          window_start?: string
        }
        Update: {
          message_count?: number
          phone_number?: string
          window_start?: string
        }
        Relationships: []
      }
      whatsapp_sessions: {
        Row: {
          context: Json
          created_at: string
          expires_at: string
          id: string
          phone_number: string
          step: string
        }
        Insert: {
          context?: Json
          created_at?: string
          expires_at?: string
          id?: string
          phone_number: string
          step: string
        }
        Update: {
          context?: Json
          created_at?: string
          expires_at?: string
          id?: string
          phone_number?: string
          step?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_family_resource: {
        Args: { _requesting_user_id: string; _resource_user_id: string }
        Returns: boolean
      }
      check_checkout_rate_limit: {
        Args: {
          _max_attempts?: number
          _user_id: string
          _window_minutes?: number
        }
        Returns: boolean
      }
      check_whatsapp_rate_limit: {
        Args: {
          _max_messages?: number
          _phone: string
          _window_minutes?: number
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_family_member: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_family_owner: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      subscription_plan: "free" | "mensal" | "trimestral" | "anual" | "teste"
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
      app_role: ["admin", "user"],
      subscription_plan: ["free", "mensal", "trimestral", "anual", "teste"],
    },
  },
} as const
