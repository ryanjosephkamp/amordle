import type { AmordleSupabaseClient } from '../lib/supabase-browser';
import type { Json, Tables } from '../types/database';
import { z } from 'zod';
import { throwIfServiceError } from './service-error';

export type RankedSearchRequest = {
  mode: 'og' | 'go';
  scope: 'practice' | 'daily';
  wordLength: number;
  hardMode: boolean;
  timeLimitMs?: number;
  dailyDateKey?: string;
  idempotencyKey: string;
};

export type RankedAction = {
  gameId: string;
  actionId: string;
  expectedMoveCount: number;
  expectedVersion: number;
  guess?: string;
  forfeit?: boolean;
};

export class CombatRepository {
  constructor(private readonly client: AmordleSupabaseClient) {}

  async listParticipantGames(
    userId: string,
    limit = 50,
  ): Promise<Tables<'async_multiplayer_games'>[]> {
    const safeUserId = z.string().uuid().parse(userId);
    const { data, error } = await this.client
      .from('async_multiplayer_games')
      .select('*')
      .or(
        `host_user_id.eq.${safeUserId},player_one_user_id.eq.${safeUserId},player_two_user_id.eq.${safeUserId}`,
      )
      .order('updated_at', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 100));
    throwIfServiceError(error, 'Load participant games');
    return data ?? [];
  }

  async getGame(gameId: string): Promise<Tables<'async_multiplayer_games'> | null> {
    const { data, error } = await this.client
      .from('async_multiplayer_games')
      .select('*')
      .eq('id', gameId)
      .maybeSingle();
    throwIfServiceError(error, 'Load multiplayer game');
    return data;
  }

  async createRankedSearch(request: RankedSearchRequest): Promise<unknown> {
    const args = {
      p_mode: request.mode,
      p_scope: request.scope,
      p_word_length: request.wordLength,
      p_hard_mode: request.hardMode,
      p_idempotency_key: request.idempotencyKey,
      ...(request.timeLimitMs === undefined ? {} : { p_time_limit_ms: request.timeLimitMs }),
      ...(request.dailyDateKey === undefined ? {} : { p_daily_date_key: request.dailyDateKey }),
    };
    const { data, error } = await this.client.rpc(
      'create_ranked_async_matchmaking_request_v2',
      args,
    );
    throwIfServiceError(error, 'Create ranked search');
    return data?.[0] ?? null;
  }

  async claimRankedSearch(requestId: string): Promise<unknown> {
    const { data, error } = await this.client.rpc('claim_ranked_async_matchmaking_pair', {
      p_request_id: requestId,
    });
    throwIfServiceError(error, 'Claim ranked search');
    return data?.[0] ?? null;
  }

  async getRankedStatus(requestId: string): Promise<unknown> {
    const { data, error } = await this.client.rpc('get_ranked_async_matchmaking_status_v2', {
      p_request_id: requestId,
    });
    throwIfServiceError(error, 'Load ranked search');
    return data?.[0] ?? null;
  }

  async cancelRankedSearch(requestId: string): Promise<unknown> {
    const { data, error } = await this.client.rpc('cancel_ranked_async_matchmaking_request', {
      p_request_id: requestId,
    });
    throwIfServiceError(error, 'Cancel ranked search');
    return data?.[0] ?? null;
  }

  async saveRankedDailyAction(action: RankedAction): Promise<Json | null> {
    const { data, error } = await this.client.rpc('save_ranked_daily_async_multiplayer_action', {
      p_game_id: action.gameId,
      p_action_id: action.actionId,
      p_expected_move_count: action.expectedMoveCount,
      p_expected_version: action.expectedVersion,
      ...(action.guess === undefined ? {} : { p_guess: action.guess }),
      ...(action.forfeit === undefined ? {} : { p_forfeit: action.forfeit }),
    });
    throwIfServiceError(error, 'Save ranked Daily action');
    return data?.[0]?.game_projection ?? null;
  }

  async settle(gameId: string, idempotencyKey: string): Promise<unknown[]> {
    const { data, error } = await this.client.rpc('settle_ranked_async_multiplayer_match_v2', {
      p_game_id: gameId,
      p_idempotency_key: idempotencyKey,
    });
    throwIfServiceError(error, 'Settle multiplayer match');
    return data ?? [];
  }

  async listPublicLive(limit = 50): Promise<unknown[]> {
    const { data, error } = await this.client.rpc('get_public_live_v1_spectator_games_v1', {
      p_limit: Math.min(Math.max(limit, 1), 50),
    });
    throwIfServiceError(error, 'Load public live games');
    return data ?? [];
  }

  async listAuthenticatedLive(limit = 50): Promise<unknown[]> {
    const { data, error } = await this.client.rpc('get_authenticated_live_v1_spectator_games_v2', {
      p_limit: Math.min(Math.max(limit, 1), 50),
    });
    throwIfServiceError(error, 'Load authenticated live games');
    return data ?? [];
  }
}
