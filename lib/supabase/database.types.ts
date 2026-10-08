
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "achievements": {
                  Row: {
                    "active": boolean,"code": string,"rarity": Database["public"]['Enums']["rarity"],"season_id": number | null,"sort_order": number
                  }
                  Insert: {
                    "active"?: boolean,"code": string,"rarity": Database["public"]['Enums']["rarity"],"season_id"?: number | null,"sort_order"?: number
                  }
                  Update: {
                    "active"?: boolean,"code"?: string,"rarity"?: Database["public"]['Enums']["rarity"],"season_id"?: number | null,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "achievements_season_id_fkey"
      columns: ["season_id"]
isOneToOne: false
      referencedRelation: "seasons"
      referencedColumns: ["id"]
    }
                  ]
                },"admin_actions": {
                  Row: {
                    "action": string,"admin_profile_id": string,"created_at": string,"details": NonNullable<Json>,"id": number,"target": string | null
                  }
                  Insert: {
                    "action": string,"admin_profile_id": string,"created_at"?: string,"details"?: NonNullable<Json>,"id"?: never,"target"?: string | null
                  }
                  Update: {
                    "action"?: string,"admin_profile_id"?: string,"created_at"?: string,"details"?: NonNullable<Json>,"id"?: never,"target"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "admin_actions_admin_profile_id_fkey"
      columns: ["admin_profile_id"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["profile_id"]
    },{
      foreignKeyName: "admin_actions_admin_profile_id_fkey"
      columns: ["admin_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"app_config": {
                  Row: {
                    "admin_reauth_seconds": number,"admin_session_seconds": number,"decay_bps_per_hour": number,"delete_reauth_seconds": number,"floor_cents": number,"id": boolean,"late_payment_grace_seconds": number,"legal_city": string | null,"legal_contact_email": string | null,"legal_effective_date": string | null,"legal_payment_provider": string | null,"lock_seconds": number,"max_avatar_uploads_per_hour": number,"max_email_attempts": number,"max_locks_per_ip_per_hour": number,"max_magic_links_per_hour": number,"max_message_length": number,"max_moderations_per_ip_per_hour": number,"max_name_checks_per_ip_per_hour": number,"max_profile_saves_per_hour": number,"max_reports_per_ip_per_hour": number,"min_first_season_days": number,"name_change_days": number,"paused": boolean,"prelaunch": boolean,"refund_alert_interval_seconds": number,"refund_retry_base_seconds": number,"refund_retry_max_seconds": number,"season_ready_alert_days": number,"step_bps": number,"updated_at": string
                  }
                  Insert: {
                    "admin_reauth_seconds"?: number,"admin_session_seconds"?: number,"decay_bps_per_hour"?: number,"delete_reauth_seconds"?: number,"floor_cents"?: number,"id"?: boolean,"late_payment_grace_seconds"?: number,"legal_city"?: string | null,"legal_contact_email"?: string | null,"legal_effective_date"?: string | null,"legal_payment_provider"?: string | null,"lock_seconds"?: number,"max_avatar_uploads_per_hour"?: number,"max_email_attempts"?: number,"max_locks_per_ip_per_hour"?: number,"max_magic_links_per_hour"?: number,"max_message_length"?: number,"max_moderations_per_ip_per_hour"?: number,"max_name_checks_per_ip_per_hour"?: number,"max_profile_saves_per_hour"?: number,"max_reports_per_ip_per_hour"?: number,"min_first_season_days"?: number,"name_change_days"?: number,"paused"?: boolean,"prelaunch"?: boolean,"refund_alert_interval_seconds"?: number,"refund_retry_base_seconds"?: number,"refund_retry_max_seconds"?: number,"season_ready_alert_days"?: number,"step_bps"?: number,"updated_at"?: string
                  }
                  Update: {
                    "admin_reauth_seconds"?: number,"admin_session_seconds"?: number,"decay_bps_per_hour"?: number,"delete_reauth_seconds"?: number,"floor_cents"?: number,"id"?: boolean,"late_payment_grace_seconds"?: number,"legal_city"?: string | null,"legal_contact_email"?: string | null,"legal_effective_date"?: string | null,"legal_payment_provider"?: string | null,"lock_seconds"?: number,"max_avatar_uploads_per_hour"?: number,"max_email_attempts"?: number,"max_locks_per_ip_per_hour"?: number,"max_magic_links_per_hour"?: number,"max_message_length"?: number,"max_moderations_per_ip_per_hour"?: number,"max_name_checks_per_ip_per_hour"?: number,"max_profile_saves_per_hour"?: number,"max_reports_per_ip_per_hour"?: number,"min_first_season_days"?: number,"name_change_days"?: number,"paused"?: boolean,"prelaunch"?: boolean,"refund_alert_interval_seconds"?: number,"refund_retry_base_seconds"?: number,"refund_retry_max_seconds"?: number,"season_ready_alert_days"?: number,"step_bps"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"crown_state": {
                  Row: {
                    "active_lock_expires_at": string | null,"active_lock_id": string | null,"base_price_cents": number,"base_set_at": string,"current_reign_id": number | null,"id": boolean,"season_id": number,"updated_at": string
                  }
                  Insert: {
                    "active_lock_expires_at"?: string | null,"active_lock_id"?: string | null,"base_price_cents": number,"base_set_at"?: string,"current_reign_id"?: number | null,"id"?: boolean,"season_id": number,"updated_at"?: string
                  }
                  Update: {
                    "active_lock_expires_at"?: string | null,"active_lock_id"?: string | null,"base_price_cents"?: number,"base_set_at"?: string,"current_reign_id"?: number | null,"id"?: boolean,"season_id"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "crown_state_active_lock_id_fkey"
      columns: ["active_lock_id"]
isOneToOne: false
      referencedRelation: "price_locks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "crown_state_current_reign_id_fkey"
      columns: ["current_reign_id"]
isOneToOne: false
      referencedRelation: "public_chronicle"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "crown_state_current_reign_id_fkey"
      columns: ["current_reign_id"]
isOneToOne: false
      referencedRelation: "public_reigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "crown_state_current_reign_id_fkey"
      columns: ["current_reign_id"]
isOneToOne: false
      referencedRelation: "reigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "crown_state_season_id_fkey"
      columns: ["season_id"]
isOneToOne: false
      referencedRelation: "seasons"
      referencedColumns: ["id"]
    }
                  ]
                },"events": {
                  Row: {
                    "created_at": string,"id": number,"kind": Database["public"]['Enums']["event_kind"],"payload": NonNullable<Json>,"profile_id": string | null,"reign_id": number | null,"season_id": number | null
                  }
                  Insert: {
                    "created_at"?: string,"id"?: never,"kind": Database["public"]['Enums']["event_kind"],"payload"?: NonNullable<Json>,"profile_id"?: string | null,"reign_id"?: number | null,"season_id"?: number | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: never,"kind"?: Database["public"]['Enums']["event_kind"],"payload"?: NonNullable<Json>,"profile_id"?: string | null,"reign_id"?: number | null,"season_id"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["profile_id"]
    },{
      foreignKeyName: "events_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_reign_id_fkey"
      columns: ["reign_id"]
isOneToOne: false
      referencedRelation: "public_chronicle"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_reign_id_fkey"
      columns: ["reign_id"]
isOneToOne: false
      referencedRelation: "public_reigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_reign_id_fkey"
      columns: ["reign_id"]
isOneToOne: false
      referencedRelation: "reigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_season_id_fkey"
      columns: ["season_id"]
isOneToOne: false
      referencedRelation: "seasons"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "attempts": number,"claimed_until": string | null,"created_at": string,"failed_at": string | null,"id": number,"kind": string,"last_error": string | null,"payload": NonNullable<Json>,"profile_id": string,"sent_at": string | null
                  }
                  Insert: {
                    "attempts"?: number,"claimed_until"?: string | null,"created_at"?: string,"failed_at"?: string | null,"id"?: never,"kind": string,"last_error"?: string | null,"payload"?: NonNullable<Json>,"profile_id": string,"sent_at"?: string | null
                  }
                  Update: {
                    "attempts"?: number,"claimed_until"?: string | null,"created_at"?: string,"failed_at"?: string | null,"id"?: never,"kind"?: string,"last_error"?: string | null,"payload"?: NonNullable<Json>,"profile_id"?: string,"sent_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["profile_id"]
    },{
      foreignKeyName: "notifications_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount_cents": number,"created_at": string,"currency": string,"dispute_status": string | null,"email": string,"id": string,"live": boolean,"lock_id": string,"provider": string,"provider_payment_id": string,"refund_attempts": number,"refund_last_error": string | null,"refund_next_attempt_at": string | null,"refund_requested_at": string | null,"status": Database["public"]['Enums']["payment_status"],"updated_at": string
                  }
                  Insert: {
                    "amount_cents": number,"created_at"?: string,"currency": string,"dispute_status"?: string | null,"email": string,"id"?: string,"live"?: boolean,"lock_id": string,"provider": string,"provider_payment_id": string,"refund_attempts"?: number,"refund_last_error"?: string | null,"refund_next_attempt_at"?: string | null,"refund_requested_at"?: string | null,"status"?: Database["public"]['Enums']["payment_status"],"updated_at"?: string
                  }
                  Update: {
                    "amount_cents"?: number,"created_at"?: string,"currency"?: string,"dispute_status"?: string | null,"email"?: string,"id"?: string,"live"?: boolean,"lock_id"?: string,"provider"?: string,"provider_payment_id"?: string,"refund_attempts"?: number,"refund_last_error"?: string | null,"refund_next_attempt_at"?: string | null,"refund_requested_at"?: string | null,"status"?: Database["public"]['Enums']["payment_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_lock_id_fkey"
      columns: ["lock_id"]
isOneToOne: false
      referencedRelation: "price_locks"
      referencedColumns: ["id"]
    }
                  ]
                },"price_locks": {
                  Row: {
                    "avatar_seed": string | null,"checkout_id": string | null,"country_code": string | null,"created_at": string,"email": string,"expected_reign_id": number | null,"expires_at": string,"id": string,"ip_hash": string | null,"link": string | null,"local_hour": number | null,"locale": string,"message": string | null,"moderation_status": Database["public"]['Enums']["moderation_status"],"name": string,"price_cents": number,"profile_id": string | null,"season_id": number,"status": Database["public"]['Enums']["lock_status"],"withdrawal_ack_at": string | null,"resolve_buyer_profile": string | null
                  }
                  Insert: {
                    "avatar_seed"?: string | null,"checkout_id"?: string | null,"country_code"?: string | null,"created_at"?: string,"email": string,"expected_reign_id"?: number | null,"expires_at": string,"id"?: string,"ip_hash"?: string | null,"link"?: string | null,"local_hour"?: number | null,"locale"?: string,"message"?: string | null,"moderation_status"?: Database["public"]['Enums']["moderation_status"],"name": string,"price_cents": number,"profile_id"?: string | null,"season_id": number,"status"?: Database["public"]['Enums']["lock_status"],"withdrawal_ack_at"?: string | null
                  }
                  Update: {
                    "avatar_seed"?: string | null,"checkout_id"?: string | null,"country_code"?: string | null,"created_at"?: string,"email"?: string,"expected_reign_id"?: number | null,"expires_at"?: string,"id"?: string,"ip_hash"?: string | null,"link"?: string | null,"local_hour"?: number | null,"locale"?: string,"message"?: string | null,"moderation_status"?: Database["public"]['Enums']["moderation_status"],"name"?: string,"price_cents"?: number,"profile_id"?: string | null,"season_id"?: number,"status"?: Database["public"]['Enums']["lock_status"],"withdrawal_ack_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "price_locks_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["profile_id"]
    },{
      foreignKeyName: "price_locks_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "price_locks_season_id_fkey"
      columns: ["season_id"]
isOneToOne: false
      referencedRelation: "seasons"
      referencedColumns: ["id"]
    }
                  ]
                },"profile_achievements": {
                  Row: {
                    "achievement_code": string,"earned_at": string,"profile_id": string,"reign_id": number | null,"season_id": number
                  }
                  Insert: {
                    "achievement_code": string,"earned_at"?: string,"profile_id": string,"reign_id"?: number | null,"season_id": number
                  }
                  Update: {
                    "achievement_code"?: string,"earned_at"?: string,"profile_id"?: string,"reign_id"?: number | null,"season_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "profile_achievements_achievement_code_fkey"
      columns: ["achievement_code"]
isOneToOne: false
      referencedRelation: "achievement_stats"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "profile_achievements_achievement_code_fkey"
      columns: ["achievement_code"]
isOneToOne: false
      referencedRelation: "achievements"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "profile_achievements_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["profile_id"]
    },{
      foreignKeyName: "profile_achievements_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profile_achievements_reign_id_fkey"
      columns: ["reign_id"]
isOneToOne: false
      referencedRelation: "public_chronicle"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profile_achievements_reign_id_fkey"
      columns: ["reign_id"]
isOneToOne: false
      referencedRelation: "public_reigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profile_achievements_reign_id_fkey"
      columns: ["reign_id"]
isOneToOne: false
      referencedRelation: "reigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profile_achievements_season_id_fkey"
      columns: ["season_id"]
isOneToOne: false
      referencedRelation: "seasons"
      referencedColumns: ["id"]
    }
                  ]
                },"profile_name_history": {
                  Row: {
                    "name": string,"profile_id": string,"replaced_at": string
                  }
                  Insert: {
                    "name": string,"profile_id": string,"replaced_at"?: string
                  }
                  Update: {
                    "name"?: string,"profile_id"?: string,"replaced_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profile_name_history_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["profile_id"]
    },{
      foreignKeyName: "profile_name_history_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profile_private": {
                  Row: {
                    "alerts_dethroned": boolean,"alerts_price_below_cents": number | null,"alerts_price_notified_for": string | null,"alerts_season_start": boolean,"email": string,"is_admin": boolean,"locale": string,"profile_id": string
                  }
                  Insert: {
                    "alerts_dethroned"?: boolean,"alerts_price_below_cents"?: number | null,"alerts_price_notified_for"?: string | null,"alerts_season_start"?: boolean,"email": string,"is_admin"?: boolean,"locale"?: string,"profile_id": string
                  }
                  Update: {
                    "alerts_dethroned"?: boolean,"alerts_price_below_cents"?: number | null,"alerts_price_notified_for"?: string | null,"alerts_season_start"?: boolean,"email"?: string,"is_admin"?: boolean,"locale"?: string,"profile_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profile_private_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "profile_stats"
      referencedColumns: ["profile_id"]
    },{
      foreignKeyName: "profile_private_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_mode": string,"avatar_path": string | null,"avatar_pixelated": boolean,"avatar_seed": string,"avatar_traits": Json | null,"country_code": string | null,"created_at": string,"deleted_at": string | null,"id": string,"is_banned": boolean,"link_github": string | null,"link_instagram": string | null,"link_linkedin": string | null,"link_tiktok": string | null,"link_website": string | null,"link_x": string | null,"link_youtube": string | null,"main_link": string | null,"name": string,"name_changed_at": string | null,"show_chronicle": boolean,"show_rival": boolean,"show_total_spent": boolean,"showcase": (string)[],"updated_at": string,"user_id": string | null
                  }
                  Insert: {
                    "avatar_mode"?: string,"avatar_path"?: string | null,"avatar_pixelated"?: boolean,"avatar_seed"?: string,"avatar_traits"?: Json | null,"country_code"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"is_banned"?: boolean,"link_github"?: string | null,"link_instagram"?: string | null,"link_linkedin"?: string | null,"link_tiktok"?: string | null,"link_website"?: string | null,"link_x"?: string | null,"link_youtube"?: string | null,"main_link"?: string | null,"name": string,"name_changed_at"?: string | null,"show_chronicle"?: boolean,"show_rival"?: boolean,"show_total_spent"?: boolean,"showcase"?: (string)[],"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "avatar_mode"?: string,"avatar_path"?: string | null,"avatar_pixelated"?: boolean,"avatar_seed"?: string,"avatar_traits"?: Json | null,"country_code"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"is_banned"?: boolean,"link_github"?: string | null,"link_instagram"?: string | null,"link_linkedin"?: string | null,"link_tiktok"?: string | null,"link_website"?: string | null,"link_x"?: string | null,"link_youtube"?: string | null,"main_link"?: string | null,"name"?: string,"name_changed_at"?: string | null,"show_chronicle"?: boolean,"show_rival"?: boolean,"show_total_spent"?: boolean,"showcase"?: (string)[],"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"rank_ups": {
                  Row: {
                    "profile_id": string,"rank": string,"reached_at": string
                  }
                  Insert: {
                    "profile_id": string,"rank": string,"reached_at"?: string
                  }
                  Update: {
                    "profile_id"?: string,"rank"?: string,"reached_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rank_ups_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["profile_id"]
    },{
      foreignKeyName: "rank_ups_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"rate_limit_hits": {
                  Row: {
                    "hit_at": string,"key": string
                  }
                  Insert: {
                    "hit_at"?: string,"key": string
                  }
                  Update: {
                    "hit_at"?: string,"key"?: string
                  }
                  Relationships: [
                    
                  ]
                },"reigns": {
                  Row: {
                    "country_code": string | null,"dethroned_by": string | null,"duration_seconds": number | null,"end_reason": Database["public"]['Enums']["reign_end_reason"] | null,"ended_at": string | null,"id": number,"link": string | null,"local_hour": number | null,"message": string | null,"message_hidden": boolean,"moderation_attempts": number,"moderation_reason": string | null,"moderation_status": Database["public"]['Enums']["moderation_status"],"name": string,"payment_id": string | null,"price_paid_cents": number,"profile_id": string,"reversal_kind": string | null,"reversed_at": string | null,"season_id": number,"started_at": string
                  }
                  Insert: {
                    "country_code"?: string | null,"dethroned_by"?: string | null,"duration_seconds"?: never,"end_reason"?: Database["public"]['Enums']["reign_end_reason"] | null,"ended_at"?: string | null,"id"?: never,"link"?: string | null,"local_hour"?: number | null,"message"?: string | null,"message_hidden"?: boolean,"moderation_attempts"?: number,"moderation_reason"?: string | null,"moderation_status"?: Database["public"]['Enums']["moderation_status"],"name": string,"payment_id"?: string | null,"price_paid_cents": number,"profile_id": string,"reversal_kind"?: string | null,"reversed_at"?: string | null,"season_id": number,"started_at"?: string
                  }
                  Update: {
                    "country_code"?: string | null,"dethroned_by"?: string | null,"duration_seconds"?: never,"end_reason"?: Database["public"]['Enums']["reign_end_reason"] | null,"ended_at"?: string | null,"id"?: never,"link"?: string | null,"local_hour"?: number | null,"message"?: string | null,"message_hidden"?: boolean,"moderation_attempts"?: number,"moderation_reason"?: string | null,"moderation_status"?: Database["public"]['Enums']["moderation_status"],"name"?: string,"payment_id"?: string | null,"price_paid_cents"?: number,"profile_id"?: string,"reversal_kind"?: string | null,"reversed_at"?: string | null,"season_id"?: number,"started_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reigns_dethroned_by_fkey"
      columns: ["dethroned_by"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["profile_id"]
    },{
      foreignKeyName: "reigns_dethroned_by_fkey"
      columns: ["dethroned_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reigns_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: true
      referencedRelation: "payments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reigns_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["profile_id"]
    },{
      foreignKeyName: "reigns_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reigns_season_id_fkey"
      columns: ["season_id"]
isOneToOne: false
      referencedRelation: "seasons"
      referencedColumns: ["id"]
    }
                  ]
                },"reports": {
                  Row: {
                    "created_at": string,"id": number,"reason": string | null,"reign_id": number,"reporter_ip_hash": string | null,"resolved": boolean
                  }
                  Insert: {
                    "created_at"?: string,"id"?: never,"reason"?: string | null,"reign_id": number,"reporter_ip_hash"?: string | null,"resolved"?: boolean
                  }
                  Update: {
                    "created_at"?: string,"id"?: never,"reason"?: string | null,"reign_id"?: number,"reporter_ip_hash"?: string | null,"resolved"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "reports_reign_id_fkey"
      columns: ["reign_id"]
isOneToOne: false
      referencedRelation: "public_chronicle"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_reign_id_fkey"
      columns: ["reign_id"]
isOneToOne: false
      referencedRelation: "public_reigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_reign_id_fkey"
      columns: ["reign_id"]
isOneToOne: false
      referencedRelation: "reigns"
      referencedColumns: ["id"]
    }
                  ]
                },"seasons": {
                  Row: {
                    "art_final": boolean,"closed_at": string | null,"ends_at": string,"exclusive_achievement": string | null,"exclusive_frame": string | null,"id": number,"king_profile_id": string | null,"name_en": string,"name_es": string,"name_final": boolean,"ready_alert_at": string | null,"skin": string,"slug": string,"starts_at": string
                  }
                  Insert: {
                    "art_final"?: boolean,"closed_at"?: string | null,"ends_at": string,"exclusive_achievement"?: string | null,"exclusive_frame"?: string | null,"id": number,"king_profile_id"?: string | null,"name_en": string,"name_es": string,"name_final"?: boolean,"ready_alert_at"?: string | null,"skin": string,"slug": string,"starts_at": string
                  }
                  Update: {
                    "art_final"?: boolean,"closed_at"?: string | null,"ends_at"?: string,"exclusive_achievement"?: string | null,"exclusive_frame"?: string | null,"id"?: number,"king_profile_id"?: string | null,"name_en"?: string,"name_es"?: string,"name_final"?: boolean,"ready_alert_at"?: string | null,"skin"?: string,"slug"?: string,"starts_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"webhook_events": {
                  Row: {
                    "event_id": string,"provider": string,"received_at": string
                  }
                  Insert: {
                    "event_id": string,"provider": string,"received_at"?: string
                  }
                  Update: {
                    "event_id"?: string,"provider"?: string,"received_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "achievement_stats": {
                  Row: {
                    "code": string | null,"holder_pct": number | null,"holders": number | null,"rarity": Database["public"]['Enums']["rarity"] | null
                  }
                  Relationships: [
                    
                  ]
                },"country_leaderboard": {
                  Row: {
                    "country_code": string | null,"crowns": number | null,"kings": number | null,"reign_seconds": number | null,"season_id": number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "reigns_season_id_fkey"
      columns: ["season_id"]
isOneToOne: false
      referencedRelation: "seasons"
      referencedColumns: ["id"]
    }
                  ]
                },"profile_stats": {
                  Row: {
                    "crowns_taken": number | null,"longest_reign_seconds": number | null,"profile_id": string | null,"rank": string | null,"times_dethroned": number | null,"total_reign_seconds": number | null,"total_spent_cents": number | null
                  }
                  Relationships: [
                    
                  ]
                },"public_chronicle": {
                  Row: {
                    "country_code": string | null,"duration_seconds": number | null,"end_reason": Database["public"]['Enums']["reign_end_reason"] | null,"ended_at": string | null,"from_country_code": string | null,"from_name": string | null,"from_profile_id": string | null,"id": number | null,"name": string | null,"profile_id": string | null,"season_id": number | null,"started_at": string | null,"to_country_code": string | null,"to_name": string | null,"to_profile_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "reigns_profile_id_fkey"
      columns: ["from_profile_id"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["profile_id"]
    },{
      foreignKeyName: "reigns_profile_id_fkey"
      columns: ["to_profile_id"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["profile_id"]
    },{
      foreignKeyName: "reigns_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["profile_id"]
    },{
      foreignKeyName: "reigns_profile_id_fkey"
      columns: ["from_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reigns_profile_id_fkey"
      columns: ["to_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reigns_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reigns_season_id_fkey"
      columns: ["season_id"]
isOneToOne: false
      referencedRelation: "seasons"
      referencedColumns: ["id"]
    }
                  ]
                },"public_crown_state": {
                  Row: {
                    "base_price_cents": number | null,"base_set_at": string | null,"current_reign_id": number | null,"decay_bps_per_hour": number | null,"floor_cents": number | null,"is_locked": boolean | null,"lock_expires_at": string | null,"price_cents": number | null,"season_id": number | null,"step_bps": number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "crown_state_current_reign_id_fkey"
      columns: ["current_reign_id"]
isOneToOne: false
      referencedRelation: "public_chronicle"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "crown_state_current_reign_id_fkey"
      columns: ["current_reign_id"]
isOneToOne: false
      referencedRelation: "public_reigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "crown_state_current_reign_id_fkey"
      columns: ["current_reign_id"]
isOneToOne: false
      referencedRelation: "reigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "crown_state_season_id_fkey"
      columns: ["season_id"]
isOneToOne: false
      referencedRelation: "seasons"
      referencedColumns: ["id"]
    }
                  ]
                },"public_reigns": {
                  Row: {
                    "country_code": string | null,"dethroned_by": string | null,"duration_seconds": number | null,"end_reason": Database["public"]['Enums']["reign_end_reason"] | null,"ended_at": string | null,"id": number | null,"link": string | null,"message": string | null,"name": string | null,"price_paid_cents": number | null,"profile_id": string | null,"reversed": boolean | null,"season_id": number | null,"started_at": string | null
                  }
                  Insert: {
                           "country_code"?: string | null,"dethroned_by"?: string | null,"duration_seconds"?: number | null,"end_reason"?: Database["public"]['Enums']["reign_end_reason"] | null,"ended_at"?: string | null,"id"?: number | null,"link"?: never,"message"?: never,"name"?: string | null,"price_paid_cents"?: number | null,"profile_id"?: string | null,"reversed"?: never,"season_id"?: number | null,"started_at"?: string | null
                         }
                        Update: {
                           "country_code"?: string | null,"dethroned_by"?: string | null,"duration_seconds"?: number | null,"end_reason"?: Database["public"]['Enums']["reign_end_reason"] | null,"ended_at"?: string | null,"id"?: number | null,"link"?: never,"message"?: never,"name"?: string | null,"price_paid_cents"?: number | null,"profile_id"?: string | null,"reversed"?: never,"season_id"?: number | null,"started_at"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "reigns_dethroned_by_fkey"
      columns: ["dethroned_by"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["profile_id"]
    },{
      foreignKeyName: "reigns_dethroned_by_fkey"
      columns: ["dethroned_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reigns_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["profile_id"]
    },{
      foreignKeyName: "reigns_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reigns_season_id_fkey"
      columns: ["season_id"]
isOneToOne: false
      referencedRelation: "seasons"
      referencedColumns: ["id"]
    }
                  ]
                },"public_rivalries": {
                  Row: {
                    "last_at": string | null,"losses": number | null,"profile_id": string | null,"rival_id": string | null,"wins": number | null
                  }
                  Relationships: [
                    
                  ]
                },"season_leaderboard": {
                  Row: {
                    "crowns": number | null,"longest_seconds": number | null,"profile_id": string | null,"reign_seconds": number | null,"season_id": number | null,"shortest_seconds": number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "reigns_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["profile_id"]
    },{
      foreignKeyName: "reigns_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reigns_season_id_fkey"
      columns: ["season_id"]
isOneToOne: false
      referencedRelation: "seasons"
      referencedColumns: ["id"]
    }
                  ]
                },"season_stats": {
                  Row: {
                    "countries": number | null,"kings": number | null,"longest_seconds": number | null,"peak_price_cents": number | null,"reigns": number | null,"season_id": number | null,"shortest_seconds": number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "reigns_season_id_fkey"
      columns: ["season_id"]
isOneToOne: false
      referencedRelation: "seasons"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "admin_session":
{ Args: { "p_session_id": string,"p_user_id": string }; Returns: {
              "aal": string,"signed_in_at": string,"totp_factor_id": string
            }[]
                           },
"apply_payment":
{ Args: { "p_payment_id": string }; Returns: string
                           },
"award":
{ Args: { "p_code": string,"p_profile_id": string,"p_reign_id": number }; Returns: undefined
                           },
"award_guardian":
{ Args: { "p_profile_id": string,"p_reign_id": number,"p_seconds": number }; Returns: undefined
                           },
"award_takeover_achievements":
{ Args: { "p_lock": Database["public"]['Tables']["price_locks"]['Row'],"p_prev": Database["public"]['Tables']["reigns"]['Row'],"p_reign": Database["public"]['Tables']["reigns"]['Row'] }; Returns: undefined
                           },
"change_profile_name":
{ Args: { "p_name": string,"p_profile_id": string }; Returns: {
              "avatar_mode": string,
"avatar_path": string | null,
"avatar_pixelated": boolean,
"avatar_seed": string,
"avatar_traits": Json | null,
"country_code": string | null,
"created_at": string,
"deleted_at": string | null,
"id": string,
"is_banned": boolean,
"link_github": string | null,
"link_instagram": string | null,
"link_linkedin": string | null,
"link_tiktok": string | null,
"link_website": string | null,
"link_x": string | null,
"link_youtube": string | null,
"main_link": string | null,
"name": string,
"name_changed_at": string | null,
"show_chronicle": boolean,
"show_rival": boolean,
"show_total_spent": boolean,
"showcase": (string)[],
"updated_at": string,
"user_id": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "profiles"
        isOneToOne: true
        isSetofReturn: false
      } },
"check_live_achievements":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"claim_notifications":
{ Args: { "p_limit": number }; Returns: {
              "attempts": number,
"claimed_until": string | null,
"created_at": string,
"failed_at": string | null,
"id": number,
"kind": string,
"last_error": string | null,
"payload": NonNullable<Json>,
"profile_id": string,
"sent_at": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "notifications"
        isOneToOne: false
        isSetofReturn: true
      } },
"claim_refunds":
{ Args: { "p_limit"?: number,"p_payment_id"?: string }; Returns: {
              "amount_cents": number,
"created_at": string,
"currency": string,
"dispute_status": string | null,
"email": string,
"id": string,
"live": boolean,
"lock_id": string,
"provider": string,
"provider_payment_id": string,
"refund_attempts": number,
"refund_last_error": string | null,
"refund_next_attempt_at": string | null,
"refund_requested_at": string | null,
"status": Database["public"]['Enums']["payment_status"],
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "payments"
        isOneToOne: false
        isSetofReturn: true
      } },
"create_price_lock":
{ Args: { "p_avatar_seed"?: string,"p_country_code": string,"p_email": string,"p_ip_hash": string,"p_link": string,"p_local_hour": number,"p_locale": string,"p_message": string,"p_name": string,"p_profile_id": string }; Returns: {
              "avatar_seed": string | null,
"checkout_id": string | null,
"country_code": string | null,
"created_at": string,
"email": string,
"expected_reign_id": number | null,
"expires_at": string,
"id": string,
"ip_hash": string | null,
"link": string | null,
"local_hour": number | null,
"locale": string,
"message": string | null,
"moderation_status": Database["public"]['Enums']["moderation_status"],
"name": string,
"price_cents": number,
"profile_id": string | null,
"season_id": number,
"status": Database["public"]['Enums']["lock_status"],
"withdrawal_ack_at": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "price_locks"
        isOneToOne: true
        isSetofReturn: false
      } },
"current_price_cents":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"delete_profile":
{ Args: { "p_profile_id": string }; Returns: string
                           },
"dismiss_report":
{ Args: { "p_admin_profile_id": string,"p_report_id": number }; Returns: undefined
                           },
"ensure_profile_for_user":
{ Args: { "p_email": string,"p_name_hint": string,"p_user_id": string }; Returns: string
                           },
"forget_password_access":
{ Args: { "p_user_id": string }; Returns: number
                           },
"generate_profile_name":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"hide_reign_message":
{ Args: { "p_admin_profile_id": string,"p_reign_id": number }; Returns: undefined
                           },
"is_profile_name_available":
{ Args: { "p_name": string,"p_profile_id"?: string }; Returns: boolean
                           },
"is_valid_avatar_traits":
{ Args: { "p_traits": Json }; Returns: boolean
                           },
"is_valid_profile_name":
{ Args: { "p_name": string }; Returns: boolean
                           },
"launch_game":
{ Args: { "p_starts_at": string }; Returns: undefined
                           },
"launch_plan":
{ Args: { "p_starts_at": string }; Returns: {
              "ends_at": string,"season_id": number,"starts_at": string
            }[]
                           },
"mark_notification_failed":
{ Args: { "p_error": string,"p_final": boolean,"p_id": number }; Returns: undefined
                           },
"mark_notification_sent":
{ Args: { "p_id": number }; Returns: undefined
                           },
"mark_payment_refunded":
{ Args: { "p_provider": string,"p_provider_payment_id": string }; Returns: undefined
                           },
"note_moderation_attempt":
{ Args: { "p_reign_id": number }; Returns: undefined
                           },
"price_at":
{ Args: { "p_at"?: string,"p_base": number,"p_set_at": string }; Returns: number
                           },
"profile_id_for_name":
{ Args: { "p_name": string }; Returns: string
                           },
"purge_expired_records":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"queue_price_alerts":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"queue_season_readiness_alerts":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"queue_stuck_refund_alert":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"rank_for_seconds":
{ Args: { "p_seconds": number }; Returns: string
                           },
"record_paid_payment":
{ Args: { "p_amount_cents": number,"p_currency": string,"p_email": string,"p_event_id": string,"p_live"?: boolean,"p_lock_id": string,"p_provider": string,"p_provider_payment_id": string }; Returns: string
                           },
"record_payment_dispute":
{ Args: { "p_provider": string,"p_provider_payment_id": string,"p_status": string }; Returns: string
                           },
"record_rank_ups":
{ Args: { "p_profile_id": string }; Returns: number
                           },
"record_refund_failed":
{ Args: { "p_error": string,"p_payment_id": string,"p_retry": boolean }; Returns: undefined
                           },
"record_refund_requested":
{ Args: { "p_payment_id": string }; Returns: undefined
                           },
"release_price_lock":
{ Args: { "p_lock_id": string }; Returns: undefined
                           },
"release_profile_name":
{ Args: { "p_name": string }; Returns: boolean
                           },
"report_reign":
{ Args: { "p_ip_hash": string,"p_reason": string,"p_reign_id": number }; Returns: string
                           },
"request_manual_refund":
{ Args: { "p_admin_profile_id": string,"p_payment_id": string }; Returns: {
              "amount_cents": number,
"created_at": string,
"currency": string,
"dispute_status": string | null,
"email": string,
"id": string,
"live": boolean,
"lock_id": string,
"provider": string,
"provider_payment_id": string,
"refund_attempts": number,
"refund_last_error": string | null,
"refund_next_attempt_at": string | null,
"refund_requested_at": string | null,
"status": Database["public"]['Enums']["payment_status"],
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "payments"
        isOneToOne: true
        isSetofReturn: false
      } },
"resolve_buyer_profile":
{ Args: { "p_lock": Database["public"]['Tables']["price_locks"]['Row'] }; Returns: string
                           },
"reverse_payment":
{ Args: { "p_kind": string,"p_payment_id": string }; Returns: number
                           },
"review_reign_moderation":
{ Args: { "p_admin_profile_id": string,"p_approved": boolean,"p_reason": string,"p_reign_id": number }; Returns: undefined
                           },
"rollover_season":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"set_lock_checkout":
{ Args: { "p_checkout_id": string,"p_lock_id": string }; Returns: undefined
                           },
"set_profile_banned":
{ Args: { "p_admin_profile_id": string,"p_banned": boolean,"p_profile_id": string }; Returns: undefined
                           },
"settle_reign_moderation":
{ Args: { "p_approved": boolean,"p_reason": string,"p_reign_id": number }; Returns: boolean
                           },
"take_rate_limit":
{ Args: { "p_key": string,"p_limit": number,"p_window_seconds": number }; Returns: boolean
                           },
"turn_off_alert":
{ Args: { "p_kind": string,"p_profile_id": string }; Returns: undefined
                           },
"update_profile":
{ Args: { "p_alerts_dethroned": boolean,"p_alerts_price_below_cents": number,"p_alerts_season_start": boolean,"p_avatar_mode": string,"p_avatar_path": string,"p_avatar_pixelated": boolean,"p_avatar_traits": Json,"p_country_code": string,"p_link_github": string,"p_link_instagram": string,"p_link_linkedin": string,"p_link_tiktok": string,"p_link_website": string,"p_link_x": string,"p_link_youtube": string,"p_locale": string,"p_main_link": string,"p_name": string,"p_profile_id": string,"p_show_chronicle": boolean,"p_show_rival": boolean,"p_showcase": (string)[] }; Returns: {
              "avatar_mode": string,
"avatar_path": string | null,
"avatar_pixelated": boolean,
"avatar_seed": string,
"avatar_traits": Json | null,
"country_code": string | null,
"created_at": string,
"deleted_at": string | null,
"id": string,
"is_banned": boolean,
"link_github": string | null,
"link_instagram": string | null,
"link_linkedin": string | null,
"link_tiktok": string | null,
"link_website": string | null,
"link_x": string | null,
"link_youtube": string | null,
"main_link": string | null,
"name": string,
"name_changed_at": string | null,
"show_chronicle": boolean,
"show_rival": boolean,
"show_total_spent": boolean,
"showcase": (string)[],
"updated_at": string,
"user_id": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "profiles"
        isOneToOne: true
        isSetofReturn: false
      } }
          }
          Enums: {
            "event_kind": "crown_taken"|"achievement_unlocked"|"season_started"|"season_ended"|"rank_up","lock_status": "active"|"consumed"|"expired","moderation_status": "approved"|"pending"|"rejected","payment_status": "paid"|"applied"|"refund_pending"|"refunded"|"failed","rarity": "common"|"rare"|"epic"|"legendary"|"seasonal","reign_end_reason": "dethroned"|"season_end"|"admin"|"reversed"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "event_kind": ["crown_taken", "achievement_unlocked", "season_started", "season_ended", "rank_up"],"lock_status": ["active", "consumed", "expired"],"moderation_status": ["approved", "pending", "rejected"],"payment_status": ["paid", "applied", "refund_pending", "refunded", "failed"],"rarity": ["common", "rare", "epic", "legendary", "seasonal"],"reign_end_reason": ["dethroned", "season_end", "admin", "reversed"]
          }
        }
} as const

