export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  brrrdle_private: {
    Tables: {
      amordle_combat_action_ledger: {
        Row: {
          action_id: string;
          action_type: string;
          clock_debit_ms: number | null;
          created_at: string;
          game_id: string;
          guess: string | null;
          player_id: string | null;
          player_user_id: string | null;
          points_awarded: number | null;
          puzzle_index: number | null;
          requested_command: string | null;
          requested_guess: string | null;
          resulting_move_count: number;
          resulting_version: number;
          sequence_no: number;
          tiles: Json | null;
        };
        Insert: {
          action_id: string;
          action_type: string;
          clock_debit_ms?: number | null;
          created_at?: string;
          game_id: string;
          guess?: string | null;
          player_id?: string | null;
          player_user_id?: string | null;
          points_awarded?: number | null;
          puzzle_index?: number | null;
          requested_command?: string | null;
          requested_guess?: string | null;
          resulting_move_count: number;
          resulting_version: number;
          sequence_no: number;
          tiles?: Json | null;
        };
        Update: {
          action_id?: string;
          action_type?: string;
          clock_debit_ms?: number | null;
          created_at?: string;
          game_id?: string;
          guess?: string | null;
          player_id?: string | null;
          player_user_id?: string | null;
          points_awarded?: number | null;
          puzzle_index?: number | null;
          requested_command?: string | null;
          requested_guess?: string | null;
          resulting_move_count?: number;
          resulting_version?: number;
          sequence_no?: number;
          tiles?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: 'amordle_combat_action_ledger_game_id_fkey';
            columns: ['game_id'];
            isOneToOne: false;
            referencedRelation: 'amordle_combat_authority';
            referencedColumns: ['game_id'];
          },
        ];
      };
      amordle_combat_authority: {
        Row: {
          answers: string[];
          catalog_revision: string;
          created_at: string;
          creation_key: string;
          current_puzzle_index: number;
          current_turn: string;
          difficulty: string;
          ended_at: string | null;
          forfeited_player_id: string | null;
          game_id: string;
          go_puzzle_count: number | null;
          hard_mode: boolean;
          hold_until: string | null;
          mode: string;
          move_count: number;
          player_one_time_remaining_ms: number | null;
          player_one_user_id: string;
          player_two_time_remaining_ms: number | null;
          player_two_user_id: string | null;
          ranked: boolean;
          rating_bucket: string | null;
          scope: string;
          source_kind: string;
          started_at: string | null;
          status: string;
          terminal_reason: string | null;
          time_limit_ms: number | null;
          timed_out_player_id: string | null;
          turn_started_at: string | null;
          updated_at: string;
          version: number;
          visibility_kind: string;
          winner_player_id: string | null;
          word_length: number;
        };
        Insert: {
          answers: string[];
          catalog_revision: string;
          created_at?: string;
          creation_key: string;
          current_puzzle_index?: number;
          current_turn: string;
          difficulty: string;
          ended_at?: string | null;
          forfeited_player_id?: string | null;
          game_id: string;
          go_puzzle_count?: number | null;
          hard_mode: boolean;
          hold_until?: string | null;
          mode: string;
          move_count?: number;
          player_one_time_remaining_ms?: number | null;
          player_one_user_id: string;
          player_two_time_remaining_ms?: number | null;
          player_two_user_id?: string | null;
          ranked: boolean;
          rating_bucket?: string | null;
          scope: string;
          source_kind: string;
          started_at?: string | null;
          status: string;
          terminal_reason?: string | null;
          time_limit_ms?: number | null;
          timed_out_player_id?: string | null;
          turn_started_at?: string | null;
          updated_at?: string;
          version?: number;
          visibility_kind: string;
          winner_player_id?: string | null;
          word_length: number;
        };
        Update: {
          answers?: string[];
          catalog_revision?: string;
          created_at?: string;
          creation_key?: string;
          current_puzzle_index?: number;
          current_turn?: string;
          difficulty?: string;
          ended_at?: string | null;
          forfeited_player_id?: string | null;
          game_id?: string;
          go_puzzle_count?: number | null;
          hard_mode?: boolean;
          hold_until?: string | null;
          mode?: string;
          move_count?: number;
          player_one_time_remaining_ms?: number | null;
          player_one_user_id?: string;
          player_two_time_remaining_ms?: number | null;
          player_two_user_id?: string | null;
          ranked?: boolean;
          rating_bucket?: string | null;
          scope?: string;
          source_kind?: string;
          started_at?: string | null;
          status?: string;
          terminal_reason?: string | null;
          time_limit_ms?: number | null;
          timed_out_player_id?: string | null;
          turn_started_at?: string | null;
          updated_at?: string;
          version?: number;
          visibility_kind?: string;
          winner_player_id?: string | null;
          word_length?: number;
        };
        Relationships: [];
      };
      amordle_ranked_practice_reservations: {
        Row: {
          difficulty: string;
          finalized_at: string | null;
          game_id: string;
          go_puzzle_count: number | null;
          hard_mode: boolean;
          matched_at: string;
          mode: string;
          player_one_user_id: string;
          player_two_user_id: string;
          rating_bucket: string;
          request_one_id: string;
          request_two_id: string;
          time_limit_ms: number | null;
          word_length: number;
        };
        Insert: {
          difficulty: string;
          finalized_at?: string | null;
          game_id: string;
          go_puzzle_count?: number | null;
          hard_mode: boolean;
          matched_at?: string;
          mode: string;
          player_one_user_id: string;
          player_two_user_id: string;
          rating_bucket: string;
          request_one_id: string;
          request_two_id: string;
          time_limit_ms?: number | null;
          word_length: number;
        };
        Update: {
          difficulty?: string;
          finalized_at?: string | null;
          game_id?: string;
          go_puzzle_count?: number | null;
          hard_mode?: boolean;
          matched_at?: string;
          mode?: string;
          player_one_user_id?: string;
          player_two_user_id?: string;
          rating_bucket?: string;
          request_one_id?: string;
          request_two_id?: string;
          time_limit_ms?: number | null;
          word_length?: number;
        };
        Relationships: [];
      };
      amordle_word_catalogs: {
        Row: {
          casual_answers: string[];
          created_at: string;
          derived_sha256: string;
          expert_answers: string[];
          revision: string;
          source_sha256: string;
          standard_answers: string[];
          valid_guesses: string[];
          word_length: number;
        };
        Insert: {
          casual_answers: string[];
          created_at?: string;
          derived_sha256: string;
          expert_answers: string[];
          revision: string;
          source_sha256: string;
          standard_answers: string[];
          valid_guesses: string[];
          word_length: number;
        };
        Update: {
          casual_answers?: string[];
          created_at?: string;
          derived_sha256?: string;
          expert_answers?: string[];
          revision?: string;
          source_sha256?: string;
          standard_answers?: string[];
          valid_guesses?: string[];
          word_length?: number;
        };
        Relationships: [];
      };
      ranked_daily_action_ledger: {
        Row: {
          action_id: string;
          action_type: string;
          created_at: string;
          game_id: string;
          guess: string | null;
          player_id: string;
          player_user_id: string;
          puzzle_index: number | null;
          sequence_no: number;
          tiles: Json | null;
        };
        Insert: {
          action_id: string;
          action_type: string;
          created_at?: string;
          game_id: string;
          guess?: string | null;
          player_id: string;
          player_user_id: string;
          puzzle_index?: number | null;
          sequence_no: number;
          tiles?: Json | null;
        };
        Update: {
          action_id?: string;
          action_type?: string;
          created_at?: string;
          game_id?: string;
          guess?: string | null;
          player_id?: string;
          player_user_id?: string;
          puzzle_index?: number | null;
          sequence_no?: number;
          tiles?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: 'ranked_daily_action_ledger_game_id_fkey';
            columns: ['game_id'];
            isOneToOne: false;
            referencedRelation: 'ranked_daily_game_authority';
            referencedColumns: ['game_id'];
          },
        ];
      };
      ranked_daily_game_authority: {
        Row: {
          answer_generation_version: string;
          answers: string[];
          created_at: string;
          current_puzzle_index: number;
          current_turn: string;
          daily_date_key: string;
          ended_at: string | null;
          forfeited_player_id: string | null;
          game_id: string;
          go_puzzle_count: number | null;
          hard_mode: boolean;
          mode: string;
          move_count: number;
          player_one_user_id: string;
          player_two_user_id: string;
          terminal_status: string;
          updated_at: string;
          version: number;
          winner_player_id: string | null;
        };
        Insert: {
          answer_generation_version?: string;
          answers: string[];
          created_at?: string;
          current_puzzle_index?: number;
          current_turn: string;
          daily_date_key: string;
          ended_at?: string | null;
          forfeited_player_id?: string | null;
          game_id: string;
          go_puzzle_count?: number | null;
          hard_mode: boolean;
          mode: string;
          move_count?: number;
          player_one_user_id: string;
          player_two_user_id: string;
          terminal_status?: string;
          updated_at?: string;
          version?: number;
          winner_player_id?: string | null;
        };
        Update: {
          answer_generation_version?: string;
          answers?: string[];
          created_at?: string;
          current_puzzle_index?: number;
          current_turn?: string;
          daily_date_key?: string;
          ended_at?: string | null;
          forfeited_player_id?: string | null;
          game_id?: string;
          go_puzzle_count?: number | null;
          hard_mode?: boolean;
          mode?: string;
          move_count?: number;
          player_one_user_id?: string;
          player_two_user_id?: string;
          terminal_status?: string;
          updated_at?: string;
          version?: number;
          winner_player_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'ranked_daily_game_authority_game_id_fkey';
            columns: ['game_id'];
            isOneToOne: true;
            referencedRelation: 'ranked_daily_pair_reservations';
            referencedColumns: ['game_id'];
          },
        ];
      };
      ranked_daily_pair_reservations: {
        Row: {
          daily_date_key: string;
          finalized_at: string | null;
          game_id: string;
          hard_mode: boolean;
          matched_at: string;
          mode: string;
          player_one_user_id: string;
          player_two_user_id: string;
          rating_bucket: string;
          request_one_id: string;
          request_two_id: string;
        };
        Insert: {
          daily_date_key: string;
          finalized_at?: string | null;
          game_id: string;
          hard_mode: boolean;
          matched_at?: string;
          mode: string;
          player_one_user_id: string;
          player_two_user_id: string;
          rating_bucket: string;
          request_one_id: string;
          request_two_id: string;
        };
        Update: {
          daily_date_key?: string;
          finalized_at?: string | null;
          game_id?: string;
          hard_mode?: boolean;
          matched_at?: string;
          mode?: string;
          player_one_user_id?: string;
          player_two_user_id?: string;
          rating_bucket?: string;
          request_one_id?: string;
          request_two_id?: string;
        };
        Relationships: [];
      };
      ranked_daily_word_catalog: {
        Row: {
          kind: string;
          ordinal: number;
          word: string;
        };
        Insert: {
          kind: string;
          ordinal: number;
          word: string;
        };
        Update: {
          kind?: string;
          ordinal?: number;
          word?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      amordle_action_points: {
        Args: {
          p_hard_mode: boolean;
          p_solved: boolean;
          p_tiles: Json;
          p_unused_attempts: number;
        };
        Returns: number;
      };
      amordle_app_bucket: {
        Args: { p_storage_bucket: string };
        Returns: string;
      };
      amordle_attempt_budget: {
        Args: { p_puzzle_index: number };
        Returns: number;
      };
      amordle_catalog_hash: {
        Args: {
          p_casual: string[];
          p_expert: string[];
          p_revision: string;
          p_standard: string[];
          p_valid: string[];
          p_word_length: number;
        };
        Returns: string;
      };
      amordle_create_combat_v3: {
        Args: {
          p_created_at?: string;
          p_creation_key: string;
          p_daily_date_key?: string;
          p_difficulty: string;
          p_game_id: string;
          p_go_puzzle_count: number;
          p_hard_mode: boolean;
          p_matchmaking_request_id?: string;
          p_mode: string;
          p_player_one_user_id: string;
          p_player_two_user_id: string;
          p_ranked: boolean;
          p_rating_bucket: string;
          p_scope: string;
          p_source_kind: string;
          p_status: string;
          p_time_limit_ms: number;
          p_visibility_kind: string;
          p_word_length: number;
        };
        Returns: string;
      };
      amordle_difficulty_answers: {
        Args: {
          p_difficulty: string;
          p_revision: string;
          p_word_length: number;
        };
        Returns: string[];
      };
      amordle_hard_mode_guess_is_valid: {
        Args: { p_game_id: string; p_guess: string; p_puzzle_index: number };
        Returns: boolean;
      };
      amordle_ledger_moves: { Args: { p_game_id: string }; Returns: Json };
      amordle_participant_projection: {
        Args: { p_game_id: string; p_viewer_id: string };
        Returns: Json;
      };
      amordle_player_attempts: {
        Args: { p_game_id: string; p_player_id: string; p_puzzle_index: number };
        Returns: number;
      };
      amordle_player_points: {
        Args: { p_game_id: string; p_player_id: string };
        Returns: number;
      };
      amordle_player_solved: {
        Args: { p_game_id: string; p_player_id: string; p_puzzle_index: number };
        Returns: boolean;
      };
      amordle_seeded_rows: {
        Args: { p_game_id: string; p_puzzle_index: number };
        Returns: Json;
      };
      amordle_select_answers: {
        Args: {
          p_count: number;
          p_difficulty: string;
          p_revision: string;
          p_word_length: number;
        };
        Returns: string[];
      };
      amordle_storage_bucket: {
        Args: { p_mode: string; p_time_limit_ms: number };
        Returns: string;
      };
      amordle_tiles: {
        Args: { p_answer: string; p_guess: string };
        Returns: Json;
      };
      phase55_daily_go_seed_index: {
        Args: { p_answer_count: number; p_day: number };
        Returns: number;
      };
      phase55_fnv1a: { Args: { p_value: string }; Returns: number };
      phase55_initial_create_ranked_async_matchmaking_request_v2: {
        Args: {
          p_daily_date_key?: string;
          p_expires_at?: string;
          p_hard_mode?: boolean;
          p_idempotency_key?: string;
          p_mode: string;
          p_scope?: string;
          p_time_limit_ms?: number;
          p_word_length: number;
        };
        Returns: {
          daily_date_key: string;
          expires_at: string;
          hard_mode: boolean;
          mode: string;
          queued_at: string;
          rating_bucket: string;
          rating_snapshot: number;
          request_id: string;
          request_status: string;
          scope: string;
          word_length: number;
        }[];
      };
      phase55_initial_finalize_ranked_async_matchmaking_game_v2: {
        Args: {
          p_game_projection: Json;
          p_idempotency_key?: string;
          p_matched_game_id: string;
          p_request_id: string;
        };
        Returns: {
          created: boolean;
          game_id: string;
          idempotent: boolean;
          opponent_request_id: string;
          request_id: string;
          request_status: string;
        }[];
      };
      phase55_ranked_daily_answers: {
        Args: { p_daily_date_key: string; p_mode: string };
        Returns: string[];
      };
      phase55_ranked_daily_hard_mode_evidence: {
        Args: { p_answers: string[]; p_game_id: string; p_puzzle_index: number };
        Returns: Json;
      };
      phase55_ranked_daily_hard_mode_guess_is_valid: {
        Args: { p_guess: string; p_moves: Json; p_puzzle_index: number };
        Returns: boolean;
      };
      phase55_ranked_daily_ledger_moves: {
        Args: { p_game_id: string };
        Returns: Json;
      };
      phase55_ranked_daily_tiles: {
        Args: { p_answer: string; p_guess: string };
        Returns: Json;
      };
      phase55_u32: { Args: { p_value: number }; Returns: number };
      phase58_go_answer_generation_version: {
        Args: { p_daily_date_key: string; p_mode: string };
        Returns: string;
      };
      phase58_mix_u32: { Args: { p_value: number }; Returns: number };
      phase58_ranked_daily_answers_v1: {
        Args: { p_daily_date_key: string; p_mode: string };
        Returns: string[];
      };
      phase58_ranked_daily_go_answers_v2: {
        Args: { p_daily_date_key: string; p_ranked: boolean };
        Returns: string[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      async_multiplayer_games: {
        Row: {
          authority_version: number;
          created_at: string;
          current_turn: string;
          custom_game_code: string | null;
          daily_date_key: string | null;
          deadline_at: string | null;
          difficulty: string;
          ended_at: string | null;
          go_puzzle_count: number | null;
          host_user_id: string;
          id: string;
          matchmaking_request_id: string | null;
          mode: string;
          move_count: number;
          player_one_user_id: string | null;
          player_two_user_id: string | null;
          projection: Json;
          ranked: boolean;
          rating_bucket: string | null;
          scope: string;
          source_kind: string;
          state_version: number;
          status: string;
          updated_at: string;
          visibility_kind: string;
          winner_player_id: string | null;
          word_length: number;
        };
        Insert: {
          authority_version?: number;
          created_at?: string;
          current_turn?: string;
          custom_game_code?: string | null;
          daily_date_key?: string | null;
          deadline_at?: string | null;
          difficulty?: string;
          ended_at?: string | null;
          go_puzzle_count?: number | null;
          host_user_id: string;
          id?: string;
          matchmaking_request_id?: string | null;
          mode: string;
          move_count?: number;
          player_one_user_id?: string | null;
          player_two_user_id?: string | null;
          projection?: Json;
          ranked?: boolean;
          rating_bucket?: string | null;
          scope: string;
          source_kind?: string;
          state_version?: number;
          status?: string;
          updated_at?: string;
          visibility_kind?: string;
          winner_player_id?: string | null;
          word_length?: number;
        };
        Update: {
          authority_version?: number;
          created_at?: string;
          current_turn?: string;
          custom_game_code?: string | null;
          daily_date_key?: string | null;
          deadline_at?: string | null;
          difficulty?: string;
          ended_at?: string | null;
          go_puzzle_count?: number | null;
          host_user_id?: string;
          id?: string;
          matchmaking_request_id?: string | null;
          mode?: string;
          move_count?: number;
          player_one_user_id?: string | null;
          player_two_user_id?: string | null;
          projection?: Json;
          ranked?: boolean;
          rating_bucket?: string | null;
          scope?: string;
          source_kind?: string;
          state_version?: number;
          status?: string;
          updated_at?: string;
          visibility_kind?: string;
          winner_player_id?: string | null;
          word_length?: number;
        };
        Relationships: [];
      };
      custom_game_lobbies: {
        Row: {
          code: string;
          created_at: string;
          creator_user_id: string | null;
          daily_date_key: string | null;
          expires_at: string;
          id: string;
          match_id: string | null;
          mode: string;
          ranked: boolean;
          scope: string;
          status: string;
          transport: string;
          word_length: number | null;
        };
        Insert: {
          code: string;
          created_at?: string;
          creator_user_id?: string | null;
          daily_date_key?: string | null;
          expires_at?: string;
          id?: string;
          match_id?: string | null;
          mode: string;
          ranked?: boolean;
          scope: string;
          status?: string;
          transport: string;
          word_length?: number | null;
        };
        Update: {
          code?: string;
          created_at?: string;
          creator_user_id?: string | null;
          daily_date_key?: string | null;
          expires_at?: string;
          id?: string;
          match_id?: string | null;
          mode?: string;
          ranked?: boolean;
          scope?: string;
          status?: string;
          transport?: string;
          word_length?: number | null;
        };
        Relationships: [];
      };
      game_history: {
        Row: {
          completed_at: string;
          entry: Json;
          id: string;
          user_id: string;
        };
        Insert: {
          completed_at: string;
          entry: Json;
          id: string;
          user_id: string;
        };
        Update: {
          completed_at?: string;
          entry?: Json;
          id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      live_lobbies: {
        Row: {
          created_at: string;
          custom_game_code: string | null;
          daily_date_key: string | null;
          difficulty: string;
          go_puzzle_count: number | null;
          host_profile: Json | null;
          host_user_id: string;
          id: string;
          match_id: string | null;
          matchmaking_request_id: string | null;
          mode: string;
          ranked: boolean;
          rating_bucket: string | null;
          scope: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          custom_game_code?: string | null;
          daily_date_key?: string | null;
          difficulty?: string;
          go_puzzle_count?: number | null;
          host_profile?: Json | null;
          host_user_id: string;
          id?: string;
          match_id?: string | null;
          matchmaking_request_id?: string | null;
          mode: string;
          ranked?: boolean;
          rating_bucket?: string | null;
          scope: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          custom_game_code?: string | null;
          daily_date_key?: string | null;
          difficulty?: string;
          go_puzzle_count?: number | null;
          host_profile?: Json | null;
          host_user_id?: string;
          id?: string;
          match_id?: string | null;
          matchmaking_request_id?: string | null;
          mode?: string;
          ranked?: boolean;
          rating_bucket?: string | null;
          scope?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      live_match_events: {
        Row: {
          actor_user_id: string | null;
          created_at: string;
          event_type: string;
          id: string;
          match_id: string;
          payload: Json;
        };
        Insert: {
          actor_user_id?: string | null;
          created_at?: string;
          event_type: string;
          id?: string;
          match_id: string;
          payload?: Json;
        };
        Update: {
          actor_user_id?: string | null;
          created_at?: string;
          event_type?: string;
          id?: string;
          match_id?: string;
          payload?: Json;
        };
        Relationships: [
          {
            foreignKeyName: 'live_match_events_match_id_fkey';
            columns: ['match_id'];
            isOneToOne: false;
            referencedRelation: 'live_matches';
            referencedColumns: ['id'];
          },
        ];
      };
      live_match_participants: {
        Row: {
          connected: boolean;
          display_label: string;
          joined_at: string;
          last_seen_at: string;
          match_id: string;
          player_id: string;
          user_id: string;
        };
        Insert: {
          connected?: boolean;
          display_label?: string;
          joined_at?: string;
          last_seen_at?: string;
          match_id: string;
          player_id: string;
          user_id: string;
        };
        Update: {
          connected?: boolean;
          display_label?: string;
          joined_at?: string;
          last_seen_at?: string;
          match_id?: string;
          player_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'live_match_participants_match_id_fkey';
            columns: ['match_id'];
            isOneToOne: false;
            referencedRelation: 'live_matches';
            referencedColumns: ['id'];
          },
        ];
      };
      live_match_spectators: {
        Row: {
          joined_at: string;
          last_seen_at: string;
          match_id: string;
          profile: Json | null;
          user_id: string;
        };
        Insert: {
          joined_at?: string;
          last_seen_at?: string;
          match_id: string;
          profile?: Json | null;
          user_id: string;
        };
        Update: {
          joined_at?: string;
          last_seen_at?: string;
          match_id?: string;
          profile?: Json | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'live_match_spectators_match_id_fkey';
            columns: ['match_id'];
            isOneToOne: false;
            referencedRelation: 'live_matches';
            referencedColumns: ['id'];
          },
        ];
      };
      live_matches: {
        Row: {
          countdown_ends_at: string | null;
          created_at: string;
          custom_game_code: string | null;
          daily_date_key: string | null;
          deadline_at: string | null;
          difficulty: string;
          ended_at: string | null;
          first_player_id: string | null;
          go_puzzle_count: number | null;
          id: string;
          lobby_id: string | null;
          matchmaking_request_id: string | null;
          mode: string;
          phase: string;
          projection: Json;
          ranked: boolean;
          rating_bucket: string | null;
          scope: string;
          selected_word_length: number | null;
          updated_at: string;
          winner_player_id: string | null;
        };
        Insert: {
          countdown_ends_at?: string | null;
          created_at?: string;
          custom_game_code?: string | null;
          daily_date_key?: string | null;
          deadline_at?: string | null;
          difficulty?: string;
          ended_at?: string | null;
          first_player_id?: string | null;
          go_puzzle_count?: number | null;
          id?: string;
          lobby_id?: string | null;
          matchmaking_request_id?: string | null;
          mode: string;
          phase: string;
          projection?: Json;
          ranked?: boolean;
          rating_bucket?: string | null;
          scope: string;
          selected_word_length?: number | null;
          updated_at?: string;
          winner_player_id?: string | null;
        };
        Update: {
          countdown_ends_at?: string | null;
          created_at?: string;
          custom_game_code?: string | null;
          daily_date_key?: string | null;
          deadline_at?: string | null;
          difficulty?: string;
          ended_at?: string | null;
          first_player_id?: string | null;
          go_puzzle_count?: number | null;
          id?: string;
          lobby_id?: string | null;
          matchmaking_request_id?: string | null;
          mode?: string;
          phase?: string;
          projection?: Json;
          ranked?: boolean;
          rating_bucket?: string | null;
          scope?: string;
          selected_word_length?: number | null;
          updated_at?: string;
          winner_player_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'live_matches_lobby_id_fkey';
            columns: ['lobby_id'];
            isOneToOne: false;
            referencedRelation: 'live_lobbies';
            referencedColumns: ['id'];
          },
        ];
      };
      multiplayer_daily_claims: {
        Row: {
          created_at: string;
          daily_date_key: string;
          mode: string;
          ranked: boolean;
          source_id: string;
          source_kind: string;
          transport: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          daily_date_key: string;
          mode: string;
          ranked?: boolean;
          source_id: string;
          source_kind: string;
          transport: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          daily_date_key?: string;
          mode?: string;
          ranked?: boolean;
          source_id?: string;
          source_kind?: string;
          transport?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      multiplayer_match_results: {
        Row: {
          created_at: string;
          daily_date_key: string | null;
          id: string;
          idempotency_key: string;
          mode: string;
          ranked: boolean;
          rating_bucket: string | null;
          scope: string;
          settled_at: string;
          settlement_source: string;
          settlement_version: string;
          source_match_id: string;
          source_transport: string;
          summary: string;
          terminal_status: string;
          winner_user_id: string | null;
        };
        Insert: {
          created_at?: string;
          daily_date_key?: string | null;
          id?: string;
          idempotency_key: string;
          mode: string;
          ranked?: boolean;
          rating_bucket?: string | null;
          scope: string;
          settled_at?: string;
          settlement_source?: string;
          settlement_version?: string;
          source_match_id: string;
          source_transport: string;
          summary?: string;
          terminal_status: string;
          winner_user_id?: string | null;
        };
        Update: {
          created_at?: string;
          daily_date_key?: string | null;
          id?: string;
          idempotency_key?: string;
          mode?: string;
          ranked?: boolean;
          rating_bucket?: string | null;
          scope?: string;
          settled_at?: string;
          settlement_source?: string;
          settlement_version?: string;
          source_match_id?: string;
          source_transport?: string;
          summary?: string;
          terminal_status?: string;
          winner_user_id?: string | null;
        };
        Relationships: [];
      };
      multiplayer_matchmaking_queue: {
        Row: {
          authority_version: number;
          daily_date_key: string | null;
          difficulty: string | null;
          expires_at: string | null;
          go_puzzle_count: number | null;
          hard_mode: boolean;
          id: string;
          idempotency_key: string;
          matched_at: string | null;
          matched_game_id: string | null;
          matched_match_id: string | null;
          matchmaking_version: string;
          mode: string;
          queued_at: string;
          ranked: boolean;
          rating_bucket: string;
          rating_snapshot: number;
          scope: string;
          status: string;
          time_limit_ms: number | null;
          transport: string;
          user_id: string;
          word_length: number | null;
        };
        Insert: {
          authority_version?: number;
          daily_date_key?: string | null;
          difficulty?: string | null;
          expires_at?: string | null;
          go_puzzle_count?: number | null;
          hard_mode?: boolean;
          id?: string;
          idempotency_key: string;
          matched_at?: string | null;
          matched_game_id?: string | null;
          matched_match_id?: string | null;
          matchmaking_version?: string;
          mode: string;
          queued_at?: string;
          ranked?: boolean;
          rating_bucket: string;
          rating_snapshot?: number;
          scope: string;
          status?: string;
          time_limit_ms?: number | null;
          transport: string;
          user_id: string;
          word_length?: number | null;
        };
        Update: {
          authority_version?: number;
          daily_date_key?: string | null;
          difficulty?: string | null;
          expires_at?: string | null;
          go_puzzle_count?: number | null;
          hard_mode?: boolean;
          id?: string;
          idempotency_key?: string;
          matched_at?: string | null;
          matched_game_id?: string | null;
          matched_match_id?: string | null;
          matchmaking_version?: string;
          mode?: string;
          queued_at?: string;
          ranked?: boolean;
          rating_bucket?: string;
          rating_snapshot?: number;
          scope?: string;
          status?: string;
          time_limit_ms?: number | null;
          transport?: string;
          user_id?: string;
          word_length?: number | null;
        };
        Relationships: [];
      };
      multiplayer_player_results: {
        Row: {
          attempts_used: number;
          completed_at: string | null;
          match_result_id: string;
          outcome: string;
          player_id: string;
          puzzles_solved: number;
          summary: string;
          user_id: string;
        };
        Insert: {
          attempts_used?: number;
          completed_at?: string | null;
          match_result_id: string;
          outcome: string;
          player_id: string;
          puzzles_solved?: number;
          summary?: string;
          user_id: string;
        };
        Update: {
          attempts_used?: number;
          completed_at?: string | null;
          match_result_id?: string;
          outcome?: string;
          player_id?: string;
          puzzles_solved?: number;
          summary?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'multiplayer_player_results_match_result_id_fkey';
            columns: ['match_result_id'];
            isOneToOne: false;
            referencedRelation: 'multiplayer_match_results';
            referencedColumns: ['id'];
          },
        ];
      };
      multiplayer_practice_rematch_requests: {
        Row: {
          accept_idempotency_key: string | null;
          created_at: string;
          created_game_id: string | null;
          expires_at: string;
          go_puzzle_count: number | null;
          hard_mode: boolean;
          id: string;
          mode: string;
          opponent_seat: string;
          opponent_user_id: string;
          player_one_user_id: string;
          player_two_user_id: string;
          request_idempotency_key: string;
          requester_seat: string;
          requester_user_id: string;
          responded_at: string | null;
          source_game_id: string;
          status: string;
          time_limit_ms: number | null;
          updated_at: string;
          word_length: number;
        };
        Insert: {
          accept_idempotency_key?: string | null;
          created_at?: string;
          created_game_id?: string | null;
          expires_at?: string;
          go_puzzle_count?: number | null;
          hard_mode?: boolean;
          id?: string;
          mode: string;
          opponent_seat: string;
          opponent_user_id: string;
          player_one_user_id: string;
          player_two_user_id: string;
          request_idempotency_key: string;
          requester_seat: string;
          requester_user_id: string;
          responded_at?: string | null;
          source_game_id: string;
          status?: string;
          time_limit_ms?: number | null;
          updated_at?: string;
          word_length: number;
        };
        Update: {
          accept_idempotency_key?: string | null;
          created_at?: string;
          created_game_id?: string | null;
          expires_at?: string;
          go_puzzle_count?: number | null;
          hard_mode?: boolean;
          id?: string;
          mode?: string;
          opponent_seat?: string;
          opponent_user_id?: string;
          player_one_user_id?: string;
          player_two_user_id?: string;
          request_idempotency_key?: string;
          requester_seat?: string;
          requester_user_id?: string;
          responded_at?: string | null;
          source_game_id?: string;
          status?: string;
          time_limit_ms?: number | null;
          updated_at?: string;
          word_length?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'multiplayer_practice_rematch_requests_created_game_id_fkey';
            columns: ['created_game_id'];
            isOneToOne: true;
            referencedRelation: 'async_multiplayer_games';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'multiplayer_practice_rematch_requests_source_game_id_fkey';
            columns: ['source_game_id'];
            isOneToOne: false;
            referencedRelation: 'async_multiplayer_games';
            referencedColumns: ['id'];
          },
        ];
      };
      multiplayer_private_match_requests: {
        Row: {
          accept_idempotency_key: string | null;
          created_at: string;
          created_game_id: string | null;
          expires_at: string;
          go_puzzle_count: number | null;
          hard_mode: boolean;
          id: string;
          mode: string;
          opponent_public_profile_id: string;
          opponent_user_id: string;
          request_idempotency_key: string;
          requester_public_profile_id: string;
          requester_user_id: string;
          responded_at: string | null;
          status: string;
          time_limit_ms: number | null;
          updated_at: string;
          word_length: number;
        };
        Insert: {
          accept_idempotency_key?: string | null;
          created_at?: string;
          created_game_id?: string | null;
          expires_at?: string;
          go_puzzle_count?: number | null;
          hard_mode?: boolean;
          id?: string;
          mode: string;
          opponent_public_profile_id: string;
          opponent_user_id: string;
          request_idempotency_key: string;
          requester_public_profile_id: string;
          requester_user_id: string;
          responded_at?: string | null;
          status?: string;
          time_limit_ms?: number | null;
          updated_at?: string;
          word_length: number;
        };
        Update: {
          accept_idempotency_key?: string | null;
          created_at?: string;
          created_game_id?: string | null;
          expires_at?: string;
          go_puzzle_count?: number | null;
          hard_mode?: boolean;
          id?: string;
          mode?: string;
          opponent_public_profile_id?: string;
          opponent_user_id?: string;
          request_idempotency_key?: string;
          requester_public_profile_id?: string;
          requester_user_id?: string;
          responded_at?: string | null;
          status?: string;
          time_limit_ms?: number | null;
          updated_at?: string;
          word_length?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'multiplayer_private_match_requ_requester_public_profile_id_fkey';
            columns: ['requester_public_profile_id'];
            isOneToOne: false;
            referencedRelation: 'public_player_profiles';
            referencedColumns: ['public_profile_id'];
          },
          {
            foreignKeyName: 'multiplayer_private_match_reque_opponent_public_profile_id_fkey';
            columns: ['opponent_public_profile_id'];
            isOneToOne: false;
            referencedRelation: 'public_player_profiles';
            referencedColumns: ['public_profile_id'];
          },
          {
            foreignKeyName: 'multiplayer_private_match_requests_created_game_id_fkey';
            columns: ['created_game_id'];
            isOneToOne: true;
            referencedRelation: 'async_multiplayer_games';
            referencedColumns: ['id'];
          },
        ];
      };
      multiplayer_private_request_blocks: {
        Row: {
          blocked_public_profile_id: string;
          blocked_user_id: string;
          blocker_user_id: string;
          created_at: string;
        };
        Insert: {
          blocked_public_profile_id: string;
          blocked_user_id: string;
          blocker_user_id: string;
          created_at?: string;
        };
        Update: {
          blocked_public_profile_id?: string;
          blocked_user_id?: string;
          blocker_user_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      multiplayer_private_request_preferences: {
        Row: {
          accept_private_practice_requests: boolean;
          created_at: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          accept_private_practice_requests?: boolean;
          created_at?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          accept_private_practice_requests?: boolean;
          created_at?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      multiplayer_rating_profiles: {
        Row: {
          bucket: string;
          draws: number;
          games_played: number;
          losses: number;
          provisional: boolean;
          rating: number;
          updated_at: string;
          user_id: string;
          wins: number;
        };
        Insert: {
          bucket: string;
          draws?: number;
          games_played?: number;
          losses?: number;
          provisional?: boolean;
          rating?: number;
          updated_at?: string;
          user_id: string;
          wins?: number;
        };
        Update: {
          bucket?: string;
          draws?: number;
          games_played?: number;
          losses?: number;
          provisional?: boolean;
          rating?: number;
          updated_at?: string;
          user_id?: string;
          wins?: number;
        };
        Relationships: [];
      };
      multiplayer_rating_transactions: {
        Row: {
          bucket: string;
          created_at: string;
          expected_score: number;
          id: string;
          idempotency_key: string;
          k_factor: number | null;
          match_result_id: string;
          new_games_played: number | null;
          new_provisional: boolean | null;
          new_rating: number;
          old_games_played: number | null;
          old_provisional: boolean | null;
          old_rating: number;
          opponent_user_id: string;
          outcome: string;
          rating_delta: number;
          settlement_version: string;
          user_id: string;
        };
        Insert: {
          bucket: string;
          created_at?: string;
          expected_score: number;
          id?: string;
          idempotency_key: string;
          k_factor?: number | null;
          match_result_id: string;
          new_games_played?: number | null;
          new_provisional?: boolean | null;
          new_rating: number;
          old_games_played?: number | null;
          old_provisional?: boolean | null;
          old_rating: number;
          opponent_user_id: string;
          outcome: string;
          rating_delta: number;
          settlement_version?: string;
          user_id: string;
        };
        Update: {
          bucket?: string;
          created_at?: string;
          expected_score?: number;
          id?: string;
          idempotency_key?: string;
          k_factor?: number | null;
          match_result_id?: string;
          new_games_played?: number | null;
          new_provisional?: boolean | null;
          new_rating?: number;
          old_games_played?: number | null;
          old_provisional?: boolean | null;
          old_rating?: number;
          opponent_user_id?: string;
          outcome?: string;
          rating_delta?: number;
          settlement_version?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'multiplayer_rating_transactions_match_result_id_fkey';
            columns: ['match_result_id'];
            isOneToOne: false;
            referencedRelation: 'multiplayer_match_results';
            referencedColumns: ['id'];
          },
        ];
      };
      player_economy_operations: {
        Row: {
          amount: number;
          coins: number;
          consumable_type: string | null;
          created_at: string;
          operation_id: string;
          operation_type: string;
          remove_incorrect_letters: number;
          reveal_one_letter: number;
          revision: number;
          user_id: string;
        };
        Insert: {
          amount?: number;
          coins: number;
          consumable_type?: string | null;
          created_at?: string;
          operation_id: string;
          operation_type: string;
          remove_incorrect_letters: number;
          reveal_one_letter: number;
          revision: number;
          user_id: string;
        };
        Update: {
          amount?: number;
          coins?: number;
          consumable_type?: string | null;
          created_at?: string;
          operation_id?: string;
          operation_type?: string;
          remove_incorrect_letters?: number;
          reveal_one_letter?: number;
          revision?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      player_economy_state: {
        Row: {
          coins: number;
          created_at: string;
          remove_incorrect_letters: number;
          reveal_one_letter: number;
          revision: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          coins?: number;
          created_at?: string;
          remove_incorrect_letters?: number;
          reveal_one_letter?: number;
          revision?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          coins?: number;
          created_at?: string;
          remove_incorrect_letters?: number;
          reveal_one_letter?: number;
          revision?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string | null;
          email: string | null;
          id: string;
          role: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          id: string;
          role?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          id?: string;
          role?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      progress_snapshots: {
        Row: {
          progress: Json;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          progress: Json;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          progress?: Json;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      public_player_profiles: {
        Row: {
          accent_color: string;
          accent_hex: string | null;
          active_accent_preset_id: string | null;
          avatar_url: string | null;
          bio: string | null;
          created_at: string;
          display_name: string | null;
          flair_key: string;
          moderation_status: string;
          public_profile_id: string;
          updated_at: string;
          user_id: string;
          visibility: string;
        };
        Insert: {
          accent_color?: string;
          accent_hex?: string | null;
          active_accent_preset_id?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          display_name?: string | null;
          flair_key?: string;
          moderation_status?: string;
          public_profile_id?: string;
          updated_at?: string;
          user_id: string;
          visibility?: string;
        };
        Update: {
          accent_color?: string;
          accent_hex?: string | null;
          active_accent_preset_id?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          display_name?: string | null;
          flair_key?: string;
          moderation_status?: string;
          public_profile_id?: string;
          updated_at?: string;
          user_id?: string;
          visibility?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'public_player_profiles_active_accent_preset_fkey';
            columns: ['active_accent_preset_id'];
            isOneToOne: false;
            referencedRelation: 'public_profile_accent_presets';
            referencedColumns: ['preset_id'];
          },
        ];
      };
      public_profile_accent_presets: {
        Row: {
          accent_hex: string;
          created_at: string;
          name: string;
          preset_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          accent_hex: string;
          created_at?: string;
          name: string;
          preset_id?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          accent_hex?: string;
          created_at?: string;
          name?: string;
          preset_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      settings: {
        Row: {
          haptics_enabled: boolean;
          keyboard_sound_profile: string;
          settings: Json;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          haptics_enabled?: boolean;
          keyboard_sound_profile?: string;
          settings: Json;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          haptics_enabled?: boolean;
          keyboard_sound_profile?: string;
          settings?: Json;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_practice_multiplayer_rematch: {
        Args: {
          p_game_projection: Json;
          p_idempotency_key?: string;
          p_request_id: string;
        };
        Returns: {
          created: boolean;
          created_at: string;
          created_game_id: string;
          expires_at: string;
          go_puzzle_count: number;
          hard_mode: boolean;
          idempotent: boolean;
          mode: string;
          opponent_seat: string;
          request_id: string;
          request_status: string;
          requester_seat: string;
          responded_at: string;
          source_game_id: string;
          time_limit_ms: number;
          updated_at: string;
          viewer_can_accept: boolean;
          viewer_can_cancel: boolean;
          viewer_role: string;
          word_length: number;
        }[];
      };
      accept_practice_multiplayer_rematch_v3: {
        Args: { p_action_id: string; p_request_id: string };
        Returns: {
          created: boolean;
          created_at: string;
          created_game_id: string;
          expires_at: string;
          go_puzzle_count: number;
          hard_mode: boolean;
          idempotent: boolean;
          mode: string;
          opponent_seat: string;
          request_id: string;
          request_status: string;
          requester_seat: string;
          responded_at: string;
          source_game_id: string;
          time_limit_ms: number;
          updated_at: string;
          viewer_can_accept: boolean;
          viewer_can_cancel: boolean;
          viewer_role: string;
          word_length: number;
        }[];
      };
      accept_private_multiplayer_match_request: {
        Args: {
          p_game_projection: Json;
          p_idempotency_key?: string;
          p_request_id: string;
        };
        Returns: {
          created: boolean;
          created_at: string;
          created_game_id: string;
          expires_at: string;
          go_puzzle_count: number;
          hard_mode: boolean;
          idempotent: boolean;
          mode: string;
          opponent_accent_color: string;
          opponent_avatar_url: string;
          opponent_display_name: string;
          opponent_flair_key: string;
          opponent_identity_available: boolean;
          opponent_profile_updated_at: string;
          opponent_public_profile_id: string;
          request_id: string;
          request_status: string;
          requester_accent_color: string;
          requester_avatar_url: string;
          requester_display_name: string;
          requester_flair_key: string;
          requester_identity_available: boolean;
          requester_profile_updated_at: string;
          requester_public_profile_id: string;
          responded_at: string;
          time_limit_ms: number;
          updated_at: string;
          viewer_can_accept: boolean;
          viewer_can_cancel: boolean;
          viewer_can_decline: boolean;
          viewer_role: string;
          word_length: number;
        }[];
      };
      accept_private_multiplayer_match_request_v2: {
        Args: {
          p_game_projection: Json;
          p_idempotency_key?: string;
          p_request_id: string;
        };
        Returns: {
          created: boolean;
          created_at: string;
          created_game_id: string;
          expires_at: string;
          go_puzzle_count: number;
          hard_mode: boolean;
          idempotent: boolean;
          mode: string;
          opponent_accent_color: string;
          opponent_avatar_url: string;
          opponent_display_name: string;
          opponent_flair_key: string;
          opponent_identity_available: boolean;
          opponent_profile_updated_at: string;
          opponent_public_profile_id: string;
          request_id: string;
          request_status: string;
          requester_accent_color: string;
          requester_avatar_url: string;
          requester_display_name: string;
          requester_flair_key: string;
          requester_identity_available: boolean;
          requester_profile_updated_at: string;
          requester_public_profile_id: string;
          responded_at: string;
          time_limit_ms: number;
          updated_at: string;
          viewer_can_accept: boolean;
          viewer_can_cancel: boolean;
          viewer_can_decline: boolean;
          viewer_role: string;
          word_length: number;
        }[];
      };
      accept_private_multiplayer_match_request_v3: {
        Args: { p_action_id: string; p_request_id: string };
        Returns: {
          created: boolean;
          created_at: string;
          created_game_id: string;
          expires_at: string;
          go_puzzle_count: number;
          hard_mode: boolean;
          idempotent: boolean;
          mode: string;
          opponent_accent_color: string;
          opponent_avatar_url: string;
          opponent_display_name: string;
          opponent_flair_key: string;
          opponent_identity_available: boolean;
          opponent_profile_updated_at: string;
          opponent_public_profile_id: string;
          request_id: string;
          request_status: string;
          requester_accent_color: string;
          requester_avatar_url: string;
          requester_display_name: string;
          requester_flair_key: string;
          requester_identity_available: boolean;
          requester_profile_updated_at: string;
          requester_public_profile_id: string;
          responded_at: string;
          time_limit_ms: number;
          updated_at: string;
          viewer_can_accept: boolean;
          viewer_can_cancel: boolean;
          viewer_can_decline: boolean;
          viewer_role: string;
          word_length: number;
        }[];
      };
      amordle_legacy_authenticated_live_v1_spectator_games: {
        Args: { p_limit?: number };
        Returns: {
          created_at: string;
          current_turn_seat: string;
          daily_date_key: string;
          deadline_at: string;
          difficulty: string;
          go_puzzle_count: number;
          hard_mode: boolean;
          id: string;
          mode: string;
          moves: Json;
          players: Json;
          progress: Json;
          ranked: boolean;
          rating_bucket: string;
          scope: string;
          spectator_capabilities: Json;
          status: string;
          time_limit_ms: number;
          updated_at: string;
          word_length: number;
        }[];
      };
      amordle_legacy_authenticated_live_v1_spectator_games_v2: {
        Args: { p_limit?: number; p_terminal_window_seconds?: number };
        Returns: {
          created_at: string;
          current_turn_seat: string;
          daily_date_key: string;
          deadline_at: string;
          difficulty: string;
          ended_at: string;
          go_puzzle_count: number;
          hard_mode: boolean;
          id: string;
          mode: string;
          moves: Json;
          outcome: Json;
          players: Json;
          progress: Json;
          ranked: boolean;
          rating_bucket: string;
          scope: string;
          spectator_capabilities: Json;
          status: string;
          terminal_at: string;
          terminal_hold_until: string;
          time_limit_ms: number;
          updated_at: string;
          word_length: number;
        }[];
      };
      amordle_legacy_public_live_v1_spectator_games_v1: {
        Args: {
          p_game_id?: string;
          p_limit?: number;
          p_terminal_window_seconds?: number;
        };
        Returns: {
          created_at: string;
          current_turn_seat: string;
          go_puzzle_count: number;
          hard_mode: boolean;
          id: string;
          mode: string;
          moves: Json;
          outcome: Json;
          players: Json;
          progress: Json;
          ranked: boolean;
          scope: string;
          spectator_capabilities: Json;
          status: string;
          terminal_at: string;
          updated_at: string;
          word_length: number;
        }[];
      };
      cancel_amordle_ranked_practice_v2: {
        Args: { p_action_id: string; p_request_id: string };
        Returns: Json;
      };
      cancel_amordle_unranked_daily_lobby_v2: {
        Args: {
          p_action_id: string;
          p_expected_version: number;
          p_game_id: string;
        };
        Returns: Json;
      };
      cancel_practice_multiplayer_rematch: {
        Args: { p_request_id: string };
        Returns: {
          created: boolean;
          created_at: string;
          created_game_id: string;
          expires_at: string;
          go_puzzle_count: number;
          hard_mode: boolean;
          idempotent: boolean;
          mode: string;
          opponent_seat: string;
          request_id: string;
          request_status: string;
          requester_seat: string;
          responded_at: string;
          source_game_id: string;
          time_limit_ms: number;
          updated_at: string;
          viewer_can_accept: boolean;
          viewer_can_cancel: boolean;
          viewer_role: string;
          word_length: number;
        }[];
      };
      cancel_private_multiplayer_match_request: {
        Args: { p_request_id: string };
        Returns: {
          created: boolean;
          created_at: string;
          created_game_id: string;
          expires_at: string;
          go_puzzle_count: number;
          hard_mode: boolean;
          idempotent: boolean;
          mode: string;
          opponent_accent_color: string;
          opponent_avatar_url: string;
          opponent_display_name: string;
          opponent_flair_key: string;
          opponent_identity_available: boolean;
          opponent_profile_updated_at: string;
          opponent_public_profile_id: string;
          request_id: string;
          request_status: string;
          requester_accent_color: string;
          requester_avatar_url: string;
          requester_display_name: string;
          requester_flair_key: string;
          requester_identity_available: boolean;
          requester_profile_updated_at: string;
          requester_public_profile_id: string;
          responded_at: string;
          time_limit_ms: number;
          updated_at: string;
          viewer_can_accept: boolean;
          viewer_can_cancel: boolean;
          viewer_can_decline: boolean;
          viewer_role: string;
          word_length: number;
        }[];
      };
      cancel_ranked_async_matchmaking_request: {
        Args: { p_request_id: string };
        Returns: {
          request_id: string;
          request_status: string;
        }[];
      };
      claim_amordle_ranked_practice_v2: {
        Args: { p_action_id: string; p_request_id: string };
        Returns: Json;
      };
      claim_daily_multiplayer_participation:
        | {
            Args: {
              p_daily_date_key: string;
              p_mode: string;
              p_source_id: string;
              p_source_kind: string;
              p_transport: string;
              p_user_id: string;
            };
            Returns: undefined;
          }
        | {
            Args: {
              p_daily_date_key: string;
              p_mode: string;
              p_ranked: boolean;
              p_source_id: string;
              p_source_kind: string;
              p_transport: string;
              p_user_id: string;
            };
            Returns: undefined;
          };
      claim_ranked_async_matchmaking_pair: {
        Args: { p_matched_game_id?: string; p_request_id: string };
        Returns: {
          matched_game_id: string;
          opponent_request_id: string;
          request_id: string;
          request_status: string;
        }[];
      };
      cleanup_amordle_combat_e2e_v2: {
        Args: {
          p_game_ids: string[];
          p_request_ids: string[];
          p_run_id: string;
          p_user_ids: string[];
        };
        Returns: Json;
      };
      cleanup_ranked_daily_multiplayer_for_users: {
        Args: { p_user_ids: string[] };
        Returns: {
          action_rows_deleted: number;
          authority_rows_deleted: number;
          reservation_rows_deleted: number;
        }[];
      };
      consume_solo_practice_consumable: {
        Args: {
          p_consumable_type: string;
          p_operation_id: string;
          p_scope: string;
        };
        Returns: {
          applied: boolean;
          coins: number;
          operation_id: string;
          remove_incorrect_letters: number;
          reveal_one_letter: number;
          revision: number;
        }[];
      };
      create_amordle_public_practice_v3: {
        Args: {
          p_creation_key: string;
          p_difficulty: string;
          p_go_puzzle_count: number;
          p_hard_mode: boolean;
          p_mode: string;
          p_time_limit_ms: number;
          p_word_length: number;
        };
        Returns: Json;
      };
      create_amordle_ranked_practice_request_v2: {
        Args: {
          p_creation_key: string;
          p_difficulty: string;
          p_expires_at?: string;
          p_go_puzzle_count: number;
          p_hard_mode: boolean;
          p_mode: string;
          p_time_limit_ms: number;
          p_word_length: number;
        };
        Returns: Json;
      };
      create_amordle_unranked_daily_lobby_v2: {
        Args: { p_creation_key: string; p_hard_mode: boolean; p_mode: string };
        Returns: Json;
      };
      create_private_multiplayer_match_request: {
        Args: {
          p_expires_at?: string;
          p_go_puzzle_count?: number;
          p_hard_mode?: boolean;
          p_idempotency_key?: string;
          p_mode: string;
          p_target_public_profile_id: string;
          p_time_limit_ms?: number;
          p_word_length: number;
        };
        Returns: {
          created: boolean;
          created_at: string;
          created_game_id: string;
          expires_at: string;
          go_puzzle_count: number;
          hard_mode: boolean;
          idempotent: boolean;
          mode: string;
          opponent_accent_color: string;
          opponent_avatar_url: string;
          opponent_display_name: string;
          opponent_flair_key: string;
          opponent_identity_available: boolean;
          opponent_profile_updated_at: string;
          opponent_public_profile_id: string;
          request_id: string;
          request_status: string;
          requester_accent_color: string;
          requester_avatar_url: string;
          requester_display_name: string;
          requester_flair_key: string;
          requester_identity_available: boolean;
          requester_profile_updated_at: string;
          requester_public_profile_id: string;
          responded_at: string;
          time_limit_ms: number;
          updated_at: string;
          viewer_can_accept: boolean;
          viewer_can_cancel: boolean;
          viewer_can_decline: boolean;
          viewer_role: string;
          word_length: number;
        }[];
      };
      create_private_multiplayer_match_request_v2: {
        Args: {
          p_expires_at?: string;
          p_go_puzzle_count?: number;
          p_hard_mode?: boolean;
          p_idempotency_key?: string;
          p_mode: string;
          p_target_public_profile_id: string;
          p_time_limit_ms?: number;
          p_word_length: number;
        };
        Returns: {
          created: boolean;
          created_at: string;
          created_game_id: string;
          expires_at: string;
          go_puzzle_count: number;
          hard_mode: boolean;
          idempotent: boolean;
          mode: string;
          opponent_accent_color: string;
          opponent_avatar_url: string;
          opponent_display_name: string;
          opponent_flair_key: string;
          opponent_identity_available: boolean;
          opponent_profile_updated_at: string;
          opponent_public_profile_id: string;
          request_id: string;
          request_status: string;
          requester_accent_color: string;
          requester_avatar_url: string;
          requester_display_name: string;
          requester_flair_key: string;
          requester_identity_available: boolean;
          requester_profile_updated_at: string;
          requester_public_profile_id: string;
          responded_at: string;
          time_limit_ms: number;
          updated_at: string;
          viewer_can_accept: boolean;
          viewer_can_cancel: boolean;
          viewer_can_decline: boolean;
          viewer_role: string;
          word_length: number;
        }[];
      };
      create_ranked_async_matchmaking_request: {
        Args: {
          p_expires_at?: string;
          p_hard_mode?: boolean;
          p_idempotency_key?: string;
          p_mode: string;
          p_scope?: string;
          p_time_limit_ms?: number;
          p_word_length: number;
        };
        Returns: {
          expires_at: string;
          hard_mode: boolean;
          queued_at: string;
          rating_bucket: string;
          rating_snapshot: number;
          request_id: string;
          request_status: string;
          word_length: number;
        }[];
      };
      create_ranked_async_matchmaking_request_v2: {
        Args: {
          p_daily_date_key?: string;
          p_expires_at?: string;
          p_hard_mode?: boolean;
          p_idempotency_key?: string;
          p_mode: string;
          p_scope?: string;
          p_time_limit_ms?: number;
          p_word_length: number;
        };
        Returns: {
          daily_date_key: string;
          expires_at: string;
          hard_mode: boolean;
          mode: string;
          queued_at: string;
          rating_bucket: string;
          rating_snapshot: number;
          request_id: string;
          request_status: string;
          scope: string;
          word_length: number;
        }[];
      };
      credit_player_economy_coins: {
        Args: { p_amount: number; p_operation_id: string };
        Returns: {
          applied: boolean;
          coins: number;
          operation_id: string;
          remove_incorrect_letters: number;
          reveal_one_letter: number;
          revision: number;
        }[];
      };
      decline_practice_multiplayer_rematch: {
        Args: { p_request_id: string };
        Returns: {
          created: boolean;
          created_at: string;
          created_game_id: string;
          expires_at: string;
          go_puzzle_count: number;
          hard_mode: boolean;
          idempotent: boolean;
          mode: string;
          opponent_seat: string;
          request_id: string;
          request_status: string;
          requester_seat: string;
          responded_at: string;
          source_game_id: string;
          time_limit_ms: number;
          updated_at: string;
          viewer_can_accept: boolean;
          viewer_can_cancel: boolean;
          viewer_role: string;
          word_length: number;
        }[];
      };
      decline_private_multiplayer_match_request: {
        Args: { p_request_id: string };
        Returns: {
          created: boolean;
          created_at: string;
          created_game_id: string;
          expires_at: string;
          go_puzzle_count: number;
          hard_mode: boolean;
          idempotent: boolean;
          mode: string;
          opponent_accent_color: string;
          opponent_avatar_url: string;
          opponent_display_name: string;
          opponent_flair_key: string;
          opponent_identity_available: boolean;
          opponent_profile_updated_at: string;
          opponent_public_profile_id: string;
          request_id: string;
          request_status: string;
          requester_accent_color: string;
          requester_avatar_url: string;
          requester_display_name: string;
          requester_flair_key: string;
          requester_identity_available: boolean;
          requester_profile_updated_at: string;
          requester_public_profile_id: string;
          responded_at: string;
          time_limit_ms: number;
          updated_at: string;
          viewer_can_accept: boolean;
          viewer_can_cancel: boolean;
          viewer_can_decline: boolean;
          viewer_role: string;
          word_length: number;
        }[];
      };
      delete_my_accent_preset_v2: {
        Args: { p_preset_id: string };
        Returns: {
          active_accent_color: string;
          active_accent_hex: string;
          deleted: boolean;
        }[];
      };
      finalize_amordle_ranked_daily_v3: {
        Args: { p_action_id: string; p_game_id: string; p_request_id: string };
        Returns: Json;
      };
      finalize_amordle_ranked_practice_v2: {
        Args: { p_action_id: string; p_game_id: string; p_request_id: string };
        Returns: Json;
      };
      finalize_ranked_async_matchmaking_game: {
        Args: {
          p_game_projection: Json;
          p_idempotency_key?: string;
          p_matched_game_id: string;
          p_request_id: string;
        };
        Returns: {
          created: boolean;
          game_id: string;
          idempotent: boolean;
          opponent_request_id: string;
          request_id: string;
          request_status: string;
        }[];
      };
      finalize_ranked_async_matchmaking_game_v2: {
        Args: {
          p_game_projection: Json;
          p_idempotency_key?: string;
          p_matched_game_id: string;
          p_request_id: string;
        };
        Returns: {
          created: boolean;
          game_id: string;
          idempotent: boolean;
          opponent_request_id: string;
          request_id: string;
          request_status: string;
        }[];
      };
      get_admin_operational_dashboard_v1: {
        Args: never;
        Returns: {
          accounts_total: number;
          async_games_active: number;
          async_games_terminal: number;
          daily_claims_today: number;
          dashboard_key: string;
          generated_at: string;
          latest_async_game_activity_at: string;
          latest_private_request_activity_at: string;
          latest_ranked_queue_activity_at: string;
          private_match_requests_pending: number;
          private_match_requests_terminal: number;
          public_profiles_active_public: number;
          public_profiles_hidden_or_private: number;
          public_profiles_suspended: number;
          public_profiles_total: number;
          ranked_profiles_established: number;
          ranked_profiles_total: number;
          ranked_queue_pending: number;
          ranked_queue_stale_candidates: number;
        }[];
      };
      get_amordle_combat_game_v2: { Args: { p_game_id: string }; Returns: Json };
      get_amordle_practice_leaderboard_v2: {
        Args: { p_app_bucket: string; p_limit?: number; p_offset?: number };
        Returns: Json[];
      };
      get_amordle_public_practice_spectator_v3: {
        Args: {
          p_game_id?: string;
          p_limit?: number;
          p_terminal_window_seconds?: number;
        };
        Returns: {
          created_at: string;
          current_turn_seat: string;
          go_puzzle_count: number;
          hard_mode: boolean;
          id: string;
          mode: string;
          moves: Json;
          outcome: Json;
          players: Json;
          progress: Json;
          ranked: boolean;
          scope: string;
          spectator_capabilities: Json;
          status: string;
          terminal_at: string;
          updated_at: string;
          word_length: number;
        }[];
      };
      get_amordle_public_practice_spectator_v4: {
        Args: {
          p_game_id?: string;
          p_limit?: number;
          p_terminal_window_seconds?: number;
        };
        Returns: {
          created_at: string;
          current_turn_seat: string;
          go_puzzle_count: number;
          hard_mode: boolean;
          id: string;
          mode: string;
          moves: Json;
          outcome: Json;
          players: Json;
          progress: Json;
          ranked: boolean;
          scope: string;
          spectator_capabilities: Json;
          status: string;
          terminal_at: string;
          updated_at: string;
          word_length: number;
        }[];
      };
      get_amordle_ranked_daily_status_v3: {
        Args: { p_request_id: string };
        Returns: Json;
      };
      get_amordle_ranked_practice_status_v2: {
        Args: { p_request_id: string };
        Returns: Json;
      };
      get_authenticated_live_v1_spectator_games: {
        Args: { p_limit?: number };
        Returns: {
          created_at: string;
          current_turn_seat: string;
          daily_date_key: string;
          deadline_at: string;
          difficulty: string;
          go_puzzle_count: number;
          hard_mode: boolean;
          id: string;
          mode: string;
          moves: Json;
          players: Json;
          progress: Json;
          ranked: boolean;
          rating_bucket: string;
          scope: string;
          spectator_capabilities: Json;
          status: string;
          time_limit_ms: number;
          updated_at: string;
          word_length: number;
        }[];
      };
      get_authenticated_live_v1_spectator_games_v2: {
        Args: { p_limit?: number; p_terminal_window_seconds?: number };
        Returns: {
          created_at: string;
          current_turn_seat: string;
          daily_date_key: string;
          deadline_at: string;
          difficulty: string;
          ended_at: string;
          go_puzzle_count: number;
          hard_mode: boolean;
          id: string;
          mode: string;
          moves: Json;
          outcome: Json;
          players: Json;
          progress: Json;
          ranked: boolean;
          rating_bucket: string;
          scope: string;
          spectator_capabilities: Json;
          status: string;
          terminal_at: string;
          terminal_hold_until: string;
          time_limit_ms: number;
          updated_at: string;
          word_length: number;
        }[];
      };
      get_authenticated_live_v1_spectator_games_v3: {
        Args: {
          p_game_id?: string;
          p_limit?: number;
          p_terminal_window_seconds?: number;
        };
        Returns: {
          created_at: string;
          current_turn_seat: string;
          go_puzzle_count: number;
          hard_mode: boolean;
          id: string;
          mode: string;
          moves: Json;
          outcome: Json;
          players: Json;
          progress: Json;
          ranked: boolean;
          scope: string;
          spectator_capabilities: Json;
          status: string;
          terminal_at: string;
          updated_at: string;
          word_length: number;
        }[];
      };
      get_live_multiplayer_server_time: { Args: never; Returns: string };
      get_multiplayer_participant_identity_summaries: {
        Args: { p_game_id?: string; p_ranked_request_id?: string };
        Returns: {
          accent_color: string;
          avatar_url: string;
          display_name: string;
          flair_key: string;
          identity_available: boolean;
          is_viewer: boolean;
          public_profile_id: string;
          seat: string;
          updated_at: string;
        }[];
      };
      get_my_public_player_profile: {
        Args: never;
        Returns: {
          accent_color: string;
          avatar_url: string;
          bio: string;
          created_at: string;
          display_name: string;
          flair_key: string;
          moderation_status: string;
          public_profile_id: string;
          updated_at: string;
          visibility: string;
        }[];
      };
      get_my_public_player_profile_v2: {
        Args: never;
        Returns: {
          accent_color: string;
          accent_hex: string;
          active_accent_preset_id: string;
          avatar_url: string;
          bio: string;
          created_at: string;
          display_name: string;
          flair_key: string;
          moderation_status: string;
          public_profile_id: string;
          updated_at: string;
          visibility: string;
        }[];
      };
      get_player_economy_state: {
        Args: never;
        Returns: {
          applied: boolean;
          coins: number;
          operation_id: string;
          remove_incorrect_letters: number;
          reveal_one_letter: number;
          revision: number;
        }[];
      };
      get_practice_multiplayer_rematch_requests: {
        Args: { p_limit?: number; p_source_game_id?: string };
        Returns: {
          created: boolean;
          created_at: string;
          created_game_id: string;
          expires_at: string;
          go_puzzle_count: number;
          hard_mode: boolean;
          idempotent: boolean;
          mode: string;
          opponent_seat: string;
          request_id: string;
          request_status: string;
          requester_seat: string;
          responded_at: string;
          source_game_id: string;
          time_limit_ms: number;
          updated_at: string;
          viewer_can_accept: boolean;
          viewer_can_cancel: boolean;
          viewer_role: string;
          word_length: number;
        }[];
      };
      get_private_multiplayer_match_requests: {
        Args: { p_limit?: number; p_status?: string };
        Returns: {
          created: boolean;
          created_at: string;
          created_game_id: string;
          expires_at: string;
          go_puzzle_count: number;
          hard_mode: boolean;
          idempotent: boolean;
          mode: string;
          opponent_accent_color: string;
          opponent_avatar_url: string;
          opponent_display_name: string;
          opponent_flair_key: string;
          opponent_identity_available: boolean;
          opponent_profile_updated_at: string;
          opponent_public_profile_id: string;
          request_id: string;
          request_status: string;
          requester_accent_color: string;
          requester_avatar_url: string;
          requester_display_name: string;
          requester_flair_key: string;
          requester_identity_available: boolean;
          requester_profile_updated_at: string;
          requester_public_profile_id: string;
          responded_at: string;
          time_limit_ms: number;
          updated_at: string;
          viewer_can_accept: boolean;
          viewer_can_cancel: boolean;
          viewer_can_decline: boolean;
          viewer_role: string;
          word_length: number;
        }[];
      };
      get_private_multiplayer_request_blocks: {
        Args: never;
        Returns: {
          accent_color: string;
          avatar_url: string;
          blocked_at: string;
          display_name: string;
          flair_key: string;
          public_profile_id: string;
        }[];
      };
      get_private_multiplayer_request_preference: {
        Args: never;
        Returns: {
          accept_private_practice_requests: boolean;
          updated_at: string;
        }[];
      };
      get_public_live_v1_spectator_games_v1: {
        Args: {
          p_game_id?: string;
          p_limit?: number;
          p_terminal_window_seconds?: number;
        };
        Returns: {
          created_at: string;
          current_turn_seat: string;
          go_puzzle_count: number;
          hard_mode: boolean;
          id: string;
          mode: string;
          moves: Json;
          outcome: Json;
          players: Json;
          progress: Json;
          ranked: boolean;
          scope: string;
          spectator_capabilities: Json;
          status: string;
          terminal_at: string;
          updated_at: string;
          word_length: number;
        }[];
      };
      get_public_live_v1_spectator_games_v2: {
        Args: {
          p_game_id?: string;
          p_limit?: number;
          p_terminal_window_seconds?: number;
        };
        Returns: {
          created_at: string;
          current_turn_seat: string;
          go_puzzle_count: number;
          hard_mode: boolean;
          id: string;
          mode: string;
          moves: Json;
          outcome: Json;
          players: Json;
          progress: Json;
          ranked: boolean;
          scope: string;
          spectator_capabilities: Json;
          status: string;
          terminal_at: string;
          updated_at: string;
          word_length: number;
        }[];
      };
      get_public_player_profile: {
        Args: { p_public_profile_id: string };
        Returns: {
          accent_color: string;
          avatar_url: string;
          bio: string;
          created_at: string;
          display_name: string;
          flair_key: string;
          public_profile_id: string;
          updated_at: string;
        }[];
      };
      get_public_player_profile_stats_v1: {
        Args: { p_public_profile_id: string };
        Returns: Json;
      };
      get_public_player_profile_v2: {
        Args: { p_public_profile_id: string };
        Returns: {
          accent_color: string;
          accent_hex: string;
          avatar_url: string;
          bio: string;
          created_at: string;
          display_name: string;
          flair_key: string;
          public_profile_id: string;
          updated_at: string;
        }[];
      };
      get_public_player_profiles: {
        Args: { p_public_profile_ids: string[] };
        Returns: {
          accent_color: string;
          avatar_url: string;
          bio: string;
          created_at: string;
          display_name: string;
          flair_key: string;
          public_profile_id: string;
          updated_at: string;
        }[];
      };
      get_public_player_profiles_v2: {
        Args: { p_public_profile_ids: string[] };
        Returns: {
          accent_color: string;
          accent_hex: string;
          avatar_url: string;
          bio: string;
          created_at: string;
          display_name: string;
          flair_key: string;
          public_profile_id: string;
          updated_at: string;
        }[];
      };
      get_public_ranked_leaderboard: {
        Args: { p_bucket?: string; p_limit?: number; p_offset?: number };
        Returns: {
          accent_color: string;
          avatar_url: string;
          bucket: string;
          display_name: string;
          draws: number;
          flair_key: string;
          games_played: number;
          latest_rating_delta: number;
          latest_rating_movement_at: string;
          leaderboard_key: string;
          leaderboard_updated_at: string;
          losses: number;
          peak_rating: number;
          profile_updated_at: string;
          provisional: boolean;
          public_profile_id: string;
          rank: number;
          rating: number;
          wins: number;
        }[];
      };
      get_public_ranked_leaderboard_v2: {
        Args: { p_bucket?: string; p_limit?: number; p_offset?: number };
        Returns: {
          accent_color: string;
          accent_hex: string;
          avatar_url: string;
          bucket: string;
          display_name: string;
          draws: number;
          flair_key: string;
          games_played: number;
          latest_rating_delta: number;
          latest_rating_movement_at: string;
          leaderboard_key: string;
          leaderboard_updated_at: string;
          losses: number;
          peak_rating: number;
          profile_updated_at: string;
          provisional: boolean;
          public_profile_id: string;
          rank: number;
          rating: number;
          wins: number;
        }[];
      };
      get_public_site_stats_v1: {
        Args: never;
        Returns: {
          generated_at: string;
          leaderboard_updated_at: string;
          public_profiles_active: number;
          public_profiles_updated_at: string;
          ranked_practice_public_go_players: number;
          ranked_practice_public_og_players: number;
          ranked_practice_public_player_results: number;
          ranked_practice_public_players: number;
          stats_key: string;
        }[];
      };
      get_ranked_async_matchmaking_status: {
        Args: { p_request_id: string };
        Returns: {
          hard_mode: boolean;
          matched_at: string;
          matched_game_id: string;
          mode: string;
          opponent_request_id: string;
          player_one_user_id: string;
          player_two_user_id: string;
          queued_at: string;
          rating_bucket: string;
          request_id: string;
          request_status: string;
          scope: string;
          time_limit_ms: number;
          viewer_seat: string;
          word_length: number;
        }[];
      };
      get_ranked_async_matchmaking_status_v2: {
        Args: { p_request_id: string };
        Returns: {
          daily_date_key: string;
          hard_mode: boolean;
          matched_at: string;
          matched_game_id: string;
          mode: string;
          opponent_request_id: string;
          player_one_user_id: string;
          player_two_user_id: string;
          queued_at: string;
          rating_bucket: string;
          request_id: string;
          request_status: string;
          scope: string;
          time_limit_ms: number;
          viewer_seat: string;
          word_length: number;
        }[];
      };
      inspect_amordle_combat_e2e_v2: {
        Args: { p_game_id: string; p_run_id: string; p_user_ids: string[] };
        Returns: Json;
      };
      join_amordle_public_practice_v3: {
        Args: {
          p_action_id: string;
          p_expected_version: number;
          p_game_id: string;
        };
        Returns: Json;
      };
      join_amordle_unranked_daily_lobby_v2: {
        Args: {
          p_action_id: string;
          p_expected_version: number;
          p_game_id: string;
        };
        Returns: Json;
      };
      list_amordle_combat_active_v2: {
        Args: { p_limit?: number };
        Returns: Json[];
      };
      list_amordle_public_practice_v3: {
        Args: { p_limit?: number };
        Returns: Json[];
      };
      list_amordle_unranked_daily_lobbies_v2: {
        Args: { p_limit?: number; p_mode?: string };
        Returns: Json[];
      };
      list_my_accent_presets_v2: {
        Args: never;
        Returns: {
          accent_hex: string;
          created_at: string;
          is_active: boolean;
          name: string;
          preset_id: string;
          updated_at: string;
        }[];
      };
      list_public_player_directory_v1: {
        Args: {
          p_bucket?: string;
          p_limit?: number;
          p_max_rating?: number;
          p_min_rating?: number;
          p_offset?: number;
          p_search?: string;
          p_sort?: string;
        };
        Returns: {
          accent_color: string;
          bucket: string;
          display_name: string;
          draws: number;
          flair_key: string;
          games_played: number;
          losses: number;
          profile_updated_at: string;
          provisional: boolean;
          public_profile_id: string;
          rating: number;
          rating_updated_at: string;
          total_count: number;
          wins: number;
        }[];
      };
      list_public_player_directory_v2: {
        Args: {
          p_bucket?: string;
          p_limit?: number;
          p_max_rating?: number;
          p_min_rating?: number;
          p_offset?: number;
          p_search?: string;
          p_sort?: string;
        };
        Returns: {
          accent_color: string;
          accent_hex: string;
          bucket: string;
          display_name: string;
          draws: number;
          flair_key: string;
          games_played: number;
          losses: number;
          profile_updated_at: string;
          provisional: boolean;
          public_profile_id: string;
          rating: number;
          rating_updated_at: string;
          total_count: number;
          wins: number;
        }[];
      };
      phase27_expected_score: {
        Args: { p_opponent_rating: number; p_rating: number };
        Returns: number;
      };
      phase27_k_factor: { Args: { p_games_played: number }; Returns: number };
      phase27_ranked_search_band: {
        Args: { p_now?: string; p_queued_at: string; p_rating: number };
        Returns: number;
      };
      phase27_rating_bucket_for_mode: {
        Args: { p_mode: string };
        Returns: string;
      };
      phase29_normalize_public_profile_text: {
        Args: { p_max_length: number; p_value: string };
        Returns: string;
      };
      phase29_validate_public_profile_accent_color: {
        Args: { p_accent_color: string };
        Returns: string;
      };
      phase29_validate_public_profile_avatar_url: {
        Args: { p_avatar_url: string; p_user_id: string };
        Returns: string;
      };
      phase29_validate_public_profile_flair_key: {
        Args: { p_flair_key: string };
        Returns: string;
      };
      phase29_validate_public_profile_visibility: {
        Args: { p_visibility: string };
        Returns: string;
      };
      phase31_expire_practice_rematch_requests: {
        Args: never;
        Returns: undefined;
      };
      phase31_practice_rematch_response: {
        Args: {
          p_created?: boolean;
          p_idempotent?: boolean;
          p_request_id: string;
          p_viewer_user_id: string;
        };
        Returns: {
          created: boolean;
          created_at: string;
          created_game_id: string;
          expires_at: string;
          go_puzzle_count: number;
          hard_mode: boolean;
          idempotent: boolean;
          mode: string;
          opponent_seat: string;
          request_id: string;
          request_status: string;
          requester_seat: string;
          responded_at: string;
          source_game_id: string;
          time_limit_ms: number;
          updated_at: string;
          viewer_can_accept: boolean;
          viewer_can_cancel: boolean;
          viewer_role: string;
          word_length: number;
        }[];
      };
      phase33_is_ranked_practice_time_limit_supported: {
        Args: { p_time_limit_ms: number };
        Returns: boolean;
      };
      phase33_is_timed_ranked_practice_storage_bucket: {
        Args: { p_bucket: string };
        Returns: boolean;
      };
      phase33_ranked_practice_app_bucket_for_storage_bucket: {
        Args: { p_bucket: string };
        Returns: string;
      };
      phase33_ranked_practice_storage_bucket_for_mode_and_time_limit: {
        Args: { p_mode: string; p_time_limit_ms: number };
        Returns: string;
      };
      phase33_ranked_timed_practice_time_limit_ms: {
        Args: never;
        Returns: number;
      };
      phase40_expire_private_match_requests: { Args: never; Returns: undefined };
      phase40_private_match_request_response: {
        Args: {
          p_created?: boolean;
          p_idempotent?: boolean;
          p_request_id: string;
          p_viewer_user_id: string;
        };
        Returns: {
          created: boolean;
          created_at: string;
          created_game_id: string;
          expires_at: string;
          go_puzzle_count: number;
          hard_mode: boolean;
          idempotent: boolean;
          mode: string;
          opponent_accent_color: string;
          opponent_avatar_url: string;
          opponent_display_name: string;
          opponent_flair_key: string;
          opponent_identity_available: boolean;
          opponent_profile_updated_at: string;
          opponent_public_profile_id: string;
          request_id: string;
          request_status: string;
          requester_accent_color: string;
          requester_avatar_url: string;
          requester_display_name: string;
          requester_flair_key: string;
          requester_identity_available: boolean;
          requester_profile_updated_at: string;
          requester_public_profile_id: string;
          responded_at: string;
          time_limit_ms: number;
          updated_at: string;
          viewer_can_accept: boolean;
          viewer_can_cancel: boolean;
          viewer_can_decline: boolean;
          viewer_role: string;
          word_length: number;
        }[];
      };
      phase43_is_recent_ranked_practice_opponent: {
        Args: {
          p_candidate_user_id: string;
          p_hard_mode: boolean;
          p_mode: string;
          p_rating_bucket: string;
          p_reference_time?: string;
          p_request_user_id: string;
          p_time_limit_ms: number;
          p_word_length: number;
        };
        Returns: boolean;
      };
      phase55_ranked_app_bucket: {
        Args: { p_storage_bucket: string };
        Returns: string;
      };
      phase55_ranked_daily_hard_mode_guess_is_valid: {
        Args: { p_guess: string; p_moves: Json; p_puzzle_index: number };
        Returns: boolean;
      };
      phase55_ranked_daily_lane_lock_key: {
        Args: { p_daily_date_key: string; p_mode: string; p_user_id: string };
        Returns: number;
      };
      phase55_ranked_daily_player_points: {
        Args: { p_hard_mode: boolean; p_moves: Json; p_player_id: string };
        Returns: number;
      };
      phase55_ranked_daily_session_answers: {
        Args: { p_mode: string; p_serialized_session: Json };
        Returns: Json;
      };
      phase55_ranked_daily_tiles: {
        Args: { p_answer: string; p_guess: string };
        Returns: Json;
      };
      phase55_ranked_queue_settings_are_valid: {
        Args: {
          p_daily_date_key: string;
          p_mode: string;
          p_rating_bucket: string;
          p_scope: string;
          p_time_limit_ms: number;
          p_word_length: number;
        };
        Returns: boolean;
      };
      phase55_ranked_storage_bucket: {
        Args: { p_mode: string; p_scope: string; p_time_limit_ms: number };
        Returns: string;
      };
      phase56_find_active_private_request: {
        Args: {
          p_mode: string;
          p_opponent_user_id: string;
          p_requester_user_id: string;
        };
        Returns: string;
      };
      phase57_apply_player_economy_operation: {
        Args: {
          p_amount?: number;
          p_consumable_type?: string;
          p_operation_id: string;
          p_operation_type: string;
          p_scope?: string;
        };
        Returns: {
          applied: boolean;
          coins: number;
          operation_id: string;
          remove_incorrect_letters: number;
          reveal_one_letter: number;
          revision: number;
        }[];
      };
      phase57_ensure_player_economy_state: {
        Args: { p_user_id: string };
        Returns: {
          coins: number;
          created_at: string;
          remove_incorrect_letters: number;
          reveal_one_letter: number;
          revision: number;
          updated_at: string;
          user_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'player_economy_state';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      phase63_validate_accent_hex: {
        Args: { p_accent_hex: string };
        Returns: string;
      };
      phase63_validate_accent_preset_name: {
        Args: { p_accent_hex: string; p_name: string };
        Returns: string;
      };
      probe_amordle_combat_e2e_residue_v2: {
        Args: {
          p_game_ids: string[];
          p_request_ids: string[];
          p_run_id: string;
          p_user_ids: string[];
        };
        Returns: Json;
      };
      purchase_solo_practice_consumable: {
        Args: { p_consumable_type: string; p_operation_id: string };
        Returns: {
          applied: boolean;
          coins: number;
          operation_id: string;
          remove_incorrect_letters: number;
          reveal_one_letter: number;
          revision: number;
        }[];
      };
      release_daily_multiplayer_claim:
        | {
            Args: {
              p_daily_date_key: string;
              p_mode: string;
              p_source_id: string;
              p_source_kind: string;
              p_transport: string;
              p_user_id: string;
            };
            Returns: undefined;
          }
        | {
            Args: {
              p_daily_date_key: string;
              p_mode: string;
              p_ranked: boolean;
              p_source_id: string;
              p_source_kind: string;
              p_transport: string;
              p_user_id: string;
            };
            Returns: undefined;
          };
      request_practice_multiplayer_rematch: {
        Args: {
          p_expires_at?: string;
          p_idempotency_key?: string;
          p_source_game_id: string;
        };
        Returns: {
          created: boolean;
          created_at: string;
          created_game_id: string;
          expires_at: string;
          go_puzzle_count: number;
          hard_mode: boolean;
          idempotent: boolean;
          mode: string;
          opponent_seat: string;
          request_id: string;
          request_status: string;
          requester_seat: string;
          responded_at: string;
          source_game_id: string;
          time_limit_ms: number;
          updated_at: string;
          viewer_can_accept: boolean;
          viewer_can_cancel: boolean;
          viewer_role: string;
          word_length: number;
        }[];
      };
      save_amordle_combat_command_v2: {
        Args: {
          p_action_id: string;
          p_command: string;
          p_expected_move_count: number;
          p_expected_version: number;
          p_game_id: string;
          p_guess?: string;
        };
        Returns: Json;
      };
      save_ranked_daily_async_multiplayer_action: {
        Args: {
          p_action_id: string;
          p_expected_move_count: number;
          p_expected_version: number;
          p_forfeit?: boolean;
          p_game_id: string;
          p_guess?: string;
        };
        Returns: {
          game_projection: Json;
        }[];
      };
      set_private_multiplayer_request_block: {
        Args: { p_blocked: boolean; p_target_public_profile_id: string };
        Returns: {
          blocked: boolean;
          public_profile_id: string;
          updated_at: string;
        }[];
      };
      settle_amordle_ranked_daily_v3: {
        Args: { p_action_id: string; p_game_id: string };
        Returns: Json;
      };
      settle_amordle_ranked_practice_v2: {
        Args: { p_action_id: string; p_game_id: string };
        Returns: Json;
      };
      settle_ranked_async_multiplayer_match: {
        Args: { p_game_id: string; p_idempotency_key?: string };
        Returns: {
          bucket: string;
          expected_score: number;
          idempotent: boolean;
          match_result_id: string;
          new_rating: number;
          old_rating: number;
          opponent_user_id: string;
          outcome: string;
          rating_delta: number;
          user_id: string;
        }[];
      };
      settle_ranked_async_multiplayer_match_v2: {
        Args: { p_game_id: string; p_idempotency_key?: string };
        Returns: {
          bucket: string;
          expected_score: number;
          idempotent: boolean;
          match_result_id: string;
          new_rating: number;
          old_rating: number;
          opponent_user_id: string;
          outcome: string;
          rating_delta: number;
          user_id: string;
        }[];
      };
      spend_player_economy_coins: {
        Args: { p_amount: number; p_operation_id: string };
        Returns: {
          applied: boolean;
          coins: number;
          operation_id: string;
          remove_incorrect_letters: number;
          reveal_one_letter: number;
          revision: number;
        }[];
      };
      update_private_multiplayer_request_preference: {
        Args: { p_accept: boolean };
        Returns: {
          accept_private_practice_requests: boolean;
          updated_at: string;
        }[];
      };
      upsert_my_accent_preset_v2: {
        Args: {
          p_accent_hex: string;
          p_name: string;
          p_preset_id: string;
          p_select: boolean;
        };
        Returns: {
          accent_hex: string;
          created_at: string;
          is_active: boolean;
          name: string;
          preset_id: string;
          updated_at: string;
        }[];
      };
      upsert_my_public_player_profile: {
        Args: {
          p_accent_color?: string;
          p_avatar_url?: string;
          p_bio?: string;
          p_display_name?: string;
          p_flair_key?: string;
          p_visibility?: string;
        };
        Returns: {
          accent_color: string;
          avatar_url: string;
          bio: string;
          created_at: string;
          display_name: string;
          flair_key: string;
          moderation_status: string;
          public_profile_id: string;
          updated_at: string;
          visibility: string;
        }[];
      };
      upsert_my_public_player_profile_v2: {
        Args: {
          p_accent_color?: string;
          p_active_accent_preset_id?: string;
          p_avatar_url?: string;
          p_bio?: string;
          p_display_name?: string;
          p_flair_key?: string;
          p_visibility?: string;
        };
        Returns: {
          accent_color: string;
          accent_hex: string;
          active_accent_preset_id: string;
          avatar_url: string;
          bio: string;
          created_at: string;
          display_name: string;
          flair_key: string;
          moderation_status: string;
          public_profile_id: string;
          updated_at: string;
          visibility: string;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  brrrdle_private: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
