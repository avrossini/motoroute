export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      admin_notes: {
        Row: {
          author_admin_id: string | null
          body: string
          created_at: string | null
          entity_id: string
          entity_type: string
          id: string
        }
        Insert: {
          author_admin_id?: string | null
          body: string
          created_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
        }
        Update: {
          author_admin_id?: string | null
          body?: string
          created_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_notes_author_admin_id_fkey"
            columns: ["author_admin_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_users: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean
          role: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean
          role?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean
          role?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      api_usage_logs: {
        Row: {
          api_type: string
          created_at: string | null
          duration_ms: number | null
          error_code: string | null
          estimated_cost_cents: number | null
          http_status: number | null
          id: string
          internal_endpoint: string | null
          metadata_json: Json | null
          provider: string
          request_status: string
          trip_id: string | null
          user_id: string | null
        }
        Insert: {
          api_type: string
          created_at?: string | null
          duration_ms?: number | null
          error_code?: string | null
          estimated_cost_cents?: number | null
          http_status?: number | null
          id?: string
          internal_endpoint?: string | null
          metadata_json?: Json | null
          provider: string
          request_status?: string
          trip_id?: string | null
          user_id?: string | null
        }
        Update: {
          api_type?: string
          created_at?: string | null
          duration_ms?: number | null
          error_code?: string | null
          estimated_cost_cents?: number | null
          http_status?: number | null
          id?: string
          internal_endpoint?: string | null
          metadata_json?: Json | null
          provider?: string
          request_status?: string
          trip_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_usage_logs_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_usage_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      checkins: {
        Row: {
          actual_duration: number | null
          checked_in_at: string | null
          fueled_up: boolean | null
          id: string
          km_at_checkin: number | null
          notes: string | null
          segment_id: string | null
          skipped: boolean | null
          trip_id: string | null
          user_id: string | null
        }
        Insert: {
          actual_duration?: number | null
          checked_in_at?: string | null
          fueled_up?: boolean | null
          id?: string
          km_at_checkin?: number | null
          notes?: string | null
          segment_id?: string | null
          skipped?: boolean | null
          trip_id?: string | null
          user_id?: string | null
        }
        Update: {
          actual_duration?: number | null
          checked_in_at?: string | null
          fueled_up?: boolean | null
          id?: string
          km_at_checkin?: number | null
          notes?: string | null
          segment_id?: string | null
          skipped?: boolean | null
          trip_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checkins_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkins_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      error_logs: {
        Row: {
          context_json: Json | null
          created_at: string | null
          endpoint: string
          error_code: string | null
          id: string
          stack_summary: string | null
          user_id: string | null
        }
        Insert: {
          context_json?: Json | null
          created_at?: string | null
          endpoint: string
          error_code?: string | null
          id?: string
          stack_summary?: string | null
          user_id?: string | null
        }
        Update: {
          context_json?: Json | null
          created_at?: string | null
          endpoint?: string
          error_code?: string | null
          id?: string
          stack_summary?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "error_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          address: string | null
          created_at: string | null
          custom_tags: string[] | null
          id: string
          latitude: number
          longitude: number
          name: string
          place_id: string
          place_type: string
          rating: number | null
          user_id: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          custom_tags?: string[] | null
          id?: string
          latitude: number
          longitude: number
          name: string
          place_id: string
          place_type: string
          rating?: number | null
          user_id?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          custom_tags?: string[] | null
          id?: string
          latitude?: number
          longitude?: number
          name?: string
          place_id?: string
          place_type?: string
          rating?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_codes: {
        Row: {
          code: string
          cohort: string
          created_at: string | null
          created_by_admin_id: string | null
          email: string | null
          expires_at: string | null
          id: string
          status: string
          updated_at: string | null
          used_at: string | null
          used_by_user_id: string | null
        }
        Insert: {
          code: string
          cohort?: string
          created_at?: string | null
          created_by_admin_id?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string
          status?: string
          updated_at?: string | null
          used_at?: string | null
          used_by_user_id?: string | null
        }
        Update: {
          code?: string
          cohort?: string
          created_at?: string | null
          created_by_admin_id?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string
          status?: string
          updated_at?: string | null
          used_at?: string | null
          used_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invite_codes_created_by_admin_id_fkey"
            columns: ["created_by_admin_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invite_codes_used_by_user_id_fkey"
            columns: ["used_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      lodging_suggestions: {
        Row: {
          address: string | null
          booking_url: string | null
          breakfast_requirement: string
          breakfast_status: string
          checkin_date: string
          checkout_date: string
          city: string
          day_index: number
          distance_m: number | null
          guest_count: number
          id: string
          is_reserved: boolean | null
          is_selected: boolean | null
          latitude: number | null
          lodging_type: string | null
          longitude: number | null
          name: string
          notes: string | null
          parking_requirement: string
          parking_status: string
          place_id: string | null
          price_level: number | null
          rating: number | null
          reference_label: string | null
          reference_lat: number | null
          reference_lng: number | null
          source: string
          total_ratings: number | null
          trip_id: string | null
        }
        Insert: {
          address?: string | null
          booking_url?: string | null
          breakfast_requirement?: string
          breakfast_status?: string
          checkin_date: string
          checkout_date: string
          city: string
          day_index: number
          distance_m?: number | null
          guest_count?: number
          id?: string
          is_reserved?: boolean | null
          is_selected?: boolean | null
          latitude?: number | null
          lodging_type?: string | null
          longitude?: number | null
          name: string
          notes?: string | null
          parking_requirement?: string
          parking_status?: string
          place_id?: string | null
          price_level?: number | null
          rating?: number | null
          reference_label?: string | null
          reference_lat?: number | null
          reference_lng?: number | null
          source?: string
          total_ratings?: number | null
          trip_id?: string | null
        }
        Update: {
          address?: string | null
          booking_url?: string | null
          breakfast_requirement?: string
          breakfast_status?: string
          checkin_date?: string
          checkout_date?: string
          city?: string
          day_index?: number
          distance_m?: number | null
          guest_count?: number
          id?: string
          is_reserved?: boolean | null
          is_selected?: boolean | null
          latitude?: number | null
          lodging_type?: string | null
          longitude?: number | null
          name?: string
          notes?: string | null
          parking_requirement?: string
          parking_status?: string
          place_id?: string | null
          price_level?: number | null
          rating?: number | null
          reference_label?: string | null
          reference_lat?: number | null
          reference_lng?: number | null
          source?: string
          total_ratings?: number | null
          trip_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lodging_suggestions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      motorcycles: {
        Row: {
          color: string | null
          created_at: string | null
          displacement_cc: number | null
          equipment: string[] | null
          fuel_economy_km_l: number
          has_abs: boolean | null
          id: string
          is_active: boolean | null
          make: string
          model: string
          next_revision_km: number | null
          odometer_km: number | null
          power_hp: number | null
          tank_liters: number
          updated_at: string | null
          user_id: string | null
          weight_kg: number | null
          year: number
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          displacement_cc?: number | null
          equipment?: string[] | null
          fuel_economy_km_l: number
          has_abs?: boolean | null
          id?: string
          is_active?: boolean | null
          make: string
          model: string
          next_revision_km?: number | null
          odometer_km?: number | null
          power_hp?: number | null
          tank_liters: number
          updated_at?: string | null
          user_id?: string | null
          weight_kg?: number | null
          year: number
        }
        Update: {
          color?: string | null
          created_at?: string | null
          displacement_cc?: number | null
          equipment?: string[] | null
          fuel_economy_km_l?: number
          has_abs?: boolean | null
          id?: string
          is_active?: boolean | null
          make?: string
          model?: string
          next_revision_km?: number | null
          odometer_km?: number | null
          power_hp?: number | null
          tank_liters?: number
          updated_at?: string | null
          user_id?: string | null
          weight_kg?: number | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "motorcycles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      segments: {
        Row: {
          alert_types: string[] | null
          day_index: number | null
          dest_lat: number
          dest_lng: number
          destination_name: string
          distance_km: number
          duration_minutes: number
          estimated_arrival: string | null
          has_alert: boolean | null
          id: string
          is_last_of_day: boolean | null
          order_index: number
          origin_lat: number
          origin_lng: number
          origin_name: string
          route_summary: string | null
          trip_id: string | null
          weather_condition: string | null
          weather_rain_pct: number | null
          weather_temp_max: number | null
          weather_updated_at: string | null
          weather_wind_kmh: number | null
        }
        Insert: {
          alert_types?: string[] | null
          day_index?: number | null
          dest_lat: number
          dest_lng: number
          destination_name: string
          distance_km: number
          duration_minutes: number
          estimated_arrival?: string | null
          has_alert?: boolean | null
          id?: string
          is_last_of_day?: boolean | null
          order_index: number
          origin_lat: number
          origin_lng: number
          origin_name: string
          route_summary?: string | null
          trip_id?: string | null
          weather_condition?: string | null
          weather_rain_pct?: number | null
          weather_temp_max?: number | null
          weather_updated_at?: string | null
          weather_wind_kmh?: number | null
        }
        Update: {
          alert_types?: string[] | null
          day_index?: number | null
          dest_lat?: number
          dest_lng?: number
          destination_name?: string
          distance_km?: number
          duration_minutes?: number
          estimated_arrival?: string | null
          has_alert?: boolean | null
          id?: string
          is_last_of_day?: boolean | null
          order_index?: number
          origin_lat?: number
          origin_lng?: number
          origin_name?: string
          route_summary?: string | null
          trip_id?: string | null
          weather_condition?: string | null
          weather_rain_pct?: number | null
          weather_temp_max?: number | null
          weather_updated_at?: string | null
          weather_wind_kmh?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "segments_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      stop_comments: {
        Row: {
          body: string
          created_at: string | null
          id: string
          place_id: string
          place_name: string
          trip_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          body: string
          created_at?: string | null
          id?: string
          place_id: string
          place_name: string
          trip_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string | null
          id?: string
          place_id?: string
          place_name?: string
          trip_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stop_comments_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stop_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      stop_ratings: {
        Row: {
          created_at: string | null
          id: string
          place_id: string
          place_name: string
          stars: number
          stop_type: string
          trip_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          place_id: string
          place_name: string
          stars: number
          stop_type: string
          trip_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          place_id?: string
          place_name?: string
          stars?: number
          stop_type?: string
          trip_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stop_ratings_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stop_ratings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      stop_suggestions: {
        Row: {
          id: string
          is_24h: boolean | null
          is_selected: boolean | null
          latitude: number
          longitude: number
          name: string
          place_id: string
          rating: number | null
          segment_id: string | null
          total_ratings: number | null
        }
        Insert: {
          id?: string
          is_24h?: boolean | null
          is_selected?: boolean | null
          latitude: number
          longitude: number
          name: string
          place_id: string
          rating?: number | null
          segment_id?: string | null
          total_ratings?: number | null
        }
        Update: {
          id?: string
          is_24h?: boolean | null
          is_selected?: boolean | null
          latitude?: number
          longitude?: number
          name?: string
          place_id?: string
          rating?: number | null
          segment_id?: string | null
          total_ratings?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stop_suggestions_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          completed_at: string | null
          created_at: string | null
          departure_date: string
          departure_time: string
          dest_lat: number | null
          dest_lng: number | null
          destination: string
          has_weather_alert: boolean | null
          id: string
          max_stop_km: number | null
          min_stop_km: number | null
          num_days: number | null
          origin: string
          origin_lat: number | null
          origin_lng: number | null
          rating: number | null
          rating_note: string | null
          source_trip_id: string | null
          started_at: string | null
          status: string | null
          stop_count: number | null
          title: string
          total_distance_km: number | null
          total_duration_min: number | null
          trip_type: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          departure_date: string
          departure_time: string
          dest_lat?: number | null
          dest_lng?: number | null
          destination: string
          has_weather_alert?: boolean | null
          id?: string
          max_stop_km?: number | null
          min_stop_km?: number | null
          num_days?: number | null
          origin: string
          origin_lat?: number | null
          origin_lng?: number | null
          rating?: number | null
          rating_note?: string | null
          source_trip_id?: string | null
          started_at?: string | null
          status?: string | null
          stop_count?: number | null
          title: string
          total_distance_km?: number | null
          total_duration_min?: number | null
          trip_type?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          departure_date?: string
          departure_time?: string
          dest_lat?: number | null
          dest_lng?: number | null
          destination?: string
          has_weather_alert?: boolean | null
          id?: string
          max_stop_km?: number | null
          min_stop_km?: number | null
          num_days?: number | null
          origin?: string
          origin_lat?: number | null
          origin_lng?: number | null
          rating?: number | null
          rating_note?: string | null
          source_trip_id?: string | null
          started_at?: string | null
          status?: string | null
          stop_count?: number | null
          title?: string
          total_distance_km?: number | null
          total_duration_min?: number | null
          trip_type?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trips_source_trip_id_fkey"
            columns: ["source_trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_feedback: {
        Row: {
          body: string
          created_at: string | null
          feedback_type: string
          id: string
          internal_notes: string | null
          severity: string | null
          status: string
          tags: string[] | null
          title: string | null
          trip_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          body: string
          created_at?: string | null
          feedback_type?: string
          id?: string
          internal_notes?: string | null
          severity?: string | null
          status?: string
          tags?: string[] | null
          title?: string | null
          trip_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string | null
          feedback_type?: string
          id?: string
          internal_notes?: string | null
          severity?: string | null
          status?: string
          tags?: string[] | null
          title?: string | null
          trip_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_feedback_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          avoid_tolls: boolean | null
          created_at: string | null
          dark_mode: boolean | null
          default_autonomy_km: number | null
          default_departure_time: string | null
          default_max_stop_km: number | null
          default_min_stop_km: number | null
          default_navigation_app: string | null
          fuel_alert_km: number | null
          id: string
          language: string | null
          notifications_enabled: boolean | null
          prefer_dirt_roads: boolean | null
          prefer_scenic_routes: boolean | null
          rain_alert_threshold: number | null
          stop_type_defaults: string[] | null
          updated_at: string | null
          user_id: string | null
          wind_alert_kmh: number | null
        }
        Insert: {
          avoid_tolls?: boolean | null
          created_at?: string | null
          dark_mode?: boolean | null
          default_autonomy_km?: number | null
          default_departure_time?: string | null
          default_max_stop_km?: number | null
          default_min_stop_km?: number | null
          default_navigation_app?: string | null
          fuel_alert_km?: number | null
          id?: string
          language?: string | null
          notifications_enabled?: boolean | null
          prefer_dirt_roads?: boolean | null
          prefer_scenic_routes?: boolean | null
          rain_alert_threshold?: number | null
          stop_type_defaults?: string[] | null
          updated_at?: string | null
          user_id?: string | null
          wind_alert_kmh?: number | null
        }
        Update: {
          avoid_tolls?: boolean | null
          created_at?: string | null
          dark_mode?: boolean | null
          default_autonomy_km?: number | null
          default_departure_time?: string | null
          default_max_stop_km?: number | null
          default_min_stop_km?: number | null
          default_navigation_app?: string | null
          fuel_alert_km?: number | null
          id?: string
          language?: string | null
          notifications_enabled?: boolean | null
          prefer_dirt_roads?: boolean | null
          prefer_scenic_routes?: boolean | null
          rain_alert_threshold?: number | null
          stop_type_defaults?: string[] | null
          updated_at?: string | null
          user_id?: string | null
          wind_alert_kmh?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist: {
        Row: {
          city: string | null
          created_at: string
          email: string
          id: string
          internal_notes: string | null
          linked_user_id: string | null
          name: string
          source: string | null
          status: string
          whatsapp: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          email: string
          id?: string
          internal_notes?: string | null
          linked_user_id?: string | null
          name: string
          source?: string | null
          status?: string
          whatsapp?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          email?: string
          id?: string
          internal_notes?: string | null
          linked_user_id?: string | null
          name?: string
          source?: string | null
          status?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_linked_user_id_fkey"
            columns: ["linked_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      waypoints: {
        Row: {
          id: string
          is_mandatory: boolean | null
          latitude: number
          longitude: number
          name: string
          order_index: number
          trip_id: string | null
        }
        Insert: {
          id?: string
          is_mandatory?: boolean | null
          latitude: number
          longitude: number
          name: string
          order_index: number
          trip_id?: string | null
        }
        Update: {
          id?: string
          is_mandatory?: boolean | null
          latitude?: number
          longitude?: number
          name?: string
          order_index?: number
          trip_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waypoints_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      algorithm_sign: {
        Args: {
          signables: string
          secret: string
          algorithm: string
        }
        Returns: string
      }
      armor: {
        Args: {
          "": string
        }
        Returns: string
      }
      dearmor: {
        Args: {
          "": string
        }
        Returns: string
      }
      gen_random_bytes: {
        Args: {
          "": number
        }
        Returns: string
      }
      gen_random_uuid: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      gen_salt: {
        Args: {
          "": string
        }
        Returns: string
      }
      pgp_armor_headers: {
        Args: {
          "": string
        }
        Returns: Record<string, unknown>[]
      }
      pgp_key_id: {
        Args: {
          "": string
        }
        Returns: string
      }
      sign: {
        Args: {
          payload: Json
          secret: string
          algorithm?: string
        }
        Returns: string
      }
      try_cast_double: {
        Args: {
          inp: string
        }
        Returns: number
      }
      url_decode: {
        Args: {
          data: string
        }
        Returns: string
      }
      url_encode: {
        Args: {
          data: string
        }
        Returns: string
      }
      verify: {
        Args: {
          token: string
          secret: string
          algorithm?: string
        }
        Returns: {
          header: Json
          payload: Json
          valid: boolean
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never
