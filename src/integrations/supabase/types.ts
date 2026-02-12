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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      menu_items: {
        Row: {
          available: boolean
          category: string
          created_at: string
          description: string | null
          featured: boolean
          food_cost: number | null
          id: string
          image_url: string | null
          name: string
          price: number
          sort_order: number
        }
        Insert: {
          available?: boolean
          category?: string
          created_at?: string
          description?: string | null
          featured?: boolean
          food_cost?: number | null
          id?: string
          image_url?: string | null
          name: string
          price?: number
          sort_order?: number
        }
        Update: {
          available?: boolean
          category?: string
          created_at?: string
          description?: string | null
          featured?: boolean
          food_cost?: number | null
          id?: string
          image_url?: string | null
          name?: string
          price?: number
          sort_order?: number
        }
        Relationships: []
      }
      orders: {
        Row: {
          closed_at: string | null
          created_at: string
          id: string
          items: Json
          location_detail: string | null
          order_type: string
          payment_type: string | null
          service_charge: number
          status: string
          tab_id: string | null
          total: number
          updated_at: string | null
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          id?: string
          items?: Json
          location_detail?: string | null
          order_type?: string
          payment_type?: string | null
          service_charge?: number
          status?: string
          tab_id?: string | null
          total?: number
          updated_at?: string | null
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          id?: string
          items?: Json
          location_detail?: string | null
          order_type?: string
          payment_type?: string | null
          service_charge?: number
          status?: string
          tab_id?: string | null
          total?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_tab_id_fkey"
            columns: ["tab_id"]
            isOneToOne: false
            referencedRelation: "tabs"
            referencedColumns: ["id"]
          },
        ]
      }
      resort_profile: {
        Row: {
          address: string | null
          contact_name: string | null
          contact_number: string | null
          created_at: string
          email: string | null
          facebook_url: string | null
          google_map_embed: string | null
          google_map_url: string | null
          id: string
          instagram_url: string | null
          logo_size: number | null
          logo_url: string | null
          phone: string | null
          resort_name: string
          tagline: string | null
          tiktok_url: string | null
          website_url: string | null
        }
        Insert: {
          address?: string | null
          contact_name?: string | null
          contact_number?: string | null
          created_at?: string
          email?: string | null
          facebook_url?: string | null
          google_map_embed?: string | null
          google_map_url?: string | null
          id?: string
          instagram_url?: string | null
          logo_size?: number | null
          logo_url?: string | null
          phone?: string | null
          resort_name?: string
          tagline?: string | null
          tiktok_url?: string | null
          website_url?: string | null
        }
        Update: {
          address?: string | null
          contact_name?: string | null
          contact_number?: string | null
          created_at?: string
          email?: string | null
          facebook_url?: string | null
          google_map_embed?: string | null
          google_map_url?: string | null
          id?: string
          instagram_url?: string | null
          logo_size?: number | null
          logo_url?: string | null
          phone?: string | null
          resort_name?: string
          tagline?: string | null
          tiktok_url?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      resort_tables: {
        Row: {
          active: boolean
          created_at: string
          id: string
          table_name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          table_name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          table_name?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          breakfast_end_time: string | null
          breakfast_start_time: string | null
          created_at: string
          id: string
          kitchen_whatsapp_number: string
          updated_at: string
        }
        Insert: {
          breakfast_end_time?: string | null
          breakfast_start_time?: string | null
          created_at?: string
          id?: string
          kitchen_whatsapp_number?: string
          updated_at?: string
        }
        Update: {
          breakfast_end_time?: string | null
          breakfast_start_time?: string | null
          created_at?: string
          id?: string
          kitchen_whatsapp_number?: string
          updated_at?: string
        }
        Relationships: []
      }
      tabs: {
        Row: {
          closed_at: string | null
          created_at: string
          guest_name: string | null
          id: string
          location_detail: string
          location_type: string
          payment_method: string | null
          status: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          guest_name?: string | null
          id?: string
          location_detail?: string
          location_type?: string
          payment_method?: string | null
          status?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          guest_name?: string | null
          id?: string
          location_detail?: string
          location_type?: string
          payment_method?: string | null
          status?: string
        }
        Relationships: []
      }
      units: {
        Row: {
          active: boolean
          created_at: string
          id: string
          unit_name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          unit_name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          unit_name?: string
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
