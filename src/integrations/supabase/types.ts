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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_codes: {
        Row: {
          code: string
          updated_at: string
          user_id: string
        }
        Insert: {
          code: string
          updated_at?: string
          user_id: string
        }
        Update: {
          code?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      comp_memberships: {
        Row: {
          granted_at: string
          granted_by: string
          id: string
          note: string | null
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by: string
          id?: string
          note?: string | null
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string
          id?: string
          note?: string | null
          user_id?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          active: boolean
          created_at: string
          daily_drink_limit: number
          id: string
          name: string
          owner_user_id: string | null
          paused_message: string | null
          redemptions_paused: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          daily_drink_limit?: number
          id?: string
          name: string
          owner_user_id?: string | null
          paused_message?: string | null
          redemptions_paused?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          daily_drink_limit?: number
          id?: string
          name?: string
          owner_user_id?: string | null
          paused_message?: string | null
          redemptions_paused?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      drink_cards: {
        Row: {
          category: string
          company_id: string
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          name: string
          price_label: string | null
          sort_order: number
          status: Database["public"]["Enums"]["drink_card_status"]
          updated_at: string
        }
        Insert: {
          category?: string
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          price_label?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["drink_card_status"]
          updated_at?: string
        }
        Update: {
          category?: string
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          price_label?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["drink_card_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drink_cards_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          active: boolean
          company_id: string | null
          created_at: string
          employee_code: string
          full_name: string
          id: string
          user_id: string | null
          venue_id: string | null
        }
        Insert: {
          active?: boolean
          company_id?: string | null
          created_at?: string
          employee_code: string
          full_name: string
          id?: string
          user_id?: string | null
          venue_id?: string | null
        }
        Update: {
          active?: boolean
          company_id?: string | null
          created_at?: string
          employee_code?: string
          full_name?: string
          id?: string
          user_id?: string | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      home_content: {
        Row: {
          data: Json
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          data?: Json
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          data?: Json
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      manager_venues: {
        Row: {
          created_at: string
          id: string
          user_id: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
          venue_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
          venue_id?: string
        }
        Relationships: []
      }
      override_uses: {
        Row: {
          admin_user_id: string
          id: string
          member_id: string | null
          used_at: string
        }
        Insert: {
          admin_user_id: string
          id?: string
          member_id?: string | null
          used_at?: string
        }
        Update: {
          admin_user_id?: string
          id?: string
          member_id?: string | null
          used_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company_id: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          phone: string | null
          signup_number: number | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_price_cents: number | null
          subscription_started_at: string | null
          subscription_status: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          email: string
          full_name?: string
          id: string
          phone?: string | null
          signup_number?: number | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_price_cents?: number | null
          subscription_started_at?: string | null
          subscription_status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          signup_number?: number | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_price_cents?: number | null
          subscription_started_at?: string | null
          subscription_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      redemptions: {
        Row: {
          drink_name: string | null
          drinks_redeemed: number
          employee_id: string | null
          id: string
          redeemed_at: string
          redeemed_date: string
          user_role_id: string | null
          user_id: string
          venue_id: string | null
        }
        Insert: {
          drink_name?: string | null
          drinks_redeemed: number
          employee_id?: string | null
          id?: string
          redeemed_at?: string
          redeemed_date?: string
          user_role_id?: string | null
          user_id: string
          venue_id?: string | null
        }
        Update: {
          drink_name?: string | null
          drinks_redeemed?: number
          employee_id?: string | null
          id?: string
          redeemed_at?: string
          redeemed_date?: string
          user_role_id?: string | null
          user_id?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "redemptions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemptions_user_role_id_fkey"
            columns: ["user_role_id"]
            isOneToOne: false
            referencedRelation: "user_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemptions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_code_uses: {
        Row: {
          id: string
          referral_code_id: string
          used_at: string
          user_id: string
        }
        Insert: {
          id?: string
          referral_code_id: string
          used_at?: string
          user_id: string
        }
        Update: {
          id?: string
          referral_code_id?: string
          used_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_code_uses_referral_code_id_fkey"
            columns: ["referral_code_id"]
            isOneToOne: false
            referencedRelation: "referral_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_codes: {
        Row: {
          active: boolean
          assigned_to_name: string | null
          assigned_to_user_id: string | null
          code: string
          company_id: string | null
          created_at: string
          created_by: string | null
          discount_type: string | null
          discount_value: number | null
          expires_at: string | null
          id: string
          max_uses: number | null
          notes: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          assigned_to_name?: string | null
          assigned_to_user_id?: string | null
          code: string
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          discount_type?: string | null
          discount_value?: number | null
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          notes?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          assigned_to_name?: string | null
          assigned_to_user_id?: string | null
          code?: string
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          discount_type?: string | null
          discount_value?: number | null
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          price_id: string
          product_id: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          price_id: string
          product_id: string
          status?: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          price_id?: string
          product_id?: string
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          active: boolean
          company_id: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          server_code: string | null
          updated_at: string
          user_id: string
          venue_id: string | null
        }
        Insert: {
          active?: boolean
          company_id?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          server_code?: string | null
          updated_at?: string
          user_id: string
          venue_id?: string | null
        }
        Update: {
          active?: boolean
          company_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          server_code?: string | null
          updated_at?: string
          user_id?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          active: boolean
          address: string | null
          company_id: string
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          updated_at: string
          venue_pin: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          company_id: string
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
          venue_pin?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          company_id?: string
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
          venue_pin?: string
        }
        Relationships: [
          {
            foreignKeyName: "venues_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_tier_info: {
        Args: never
        Returns: {
          next_signup_number: number
          price_cents: number
          spots_left_in_tier: number
          total_members: number
        }[]
      }
      drinks_remaining_today: { Args: { _user_id: string }; Returns: number }
      is_effective_company_admin: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      find_user_id_by_email: { Args: { _email: string }; Returns: string }
      has_active_subscription: {
        Args: { check_env?: string; user_uuid: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role_in_company: {
        Args: {
          _company_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      is_venue_manager: {
        Args: { _user_id: string; _venue_id: string }
        Returns: boolean
      }
      manager_venue_ids: { Args: { _user_id: string }; Returns: string[] }
      redeem_referral_code: { Args: { _code: string }; Returns: string }
      tier_price_for_signup: { Args: { _n: number }; Returns: number }
      user_company_id: { Args: { _user_id: string }; Returns: string }
      validate_referral_code: {
        Args: { _code: string }
        Returns: {
          assigned_to_name: string
          code: string
          discount_type: string
          discount_value: number
          id: string
        }[]
      }
      verify_admin_code: {
        Args: { _code: string; _member_id: string }
        Returns: string
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "employee"
        | "member"
        | "super_admin"
        | "manager"
        | "server"
      drink_card_status: "included" | "not_included" | "inactive"
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
      app_role: ["admin", "employee", "member", "super_admin", "manager", "server"],
      drink_card_status: ["included", "not_included", "inactive"],
    },
  },
} as const
