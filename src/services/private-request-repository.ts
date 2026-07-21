import { z } from 'zod';
import type { AmordleSupabaseClient } from '../lib/supabase-browser';
import type { Json } from '../types/database';
import { throwIfServiceError } from './service-error';

export type PrivateRequestInput = {
  targetPublicProfileId: string;
  mode: 'og' | 'go';
  wordLength: number;
  hardMode: boolean;
  timeLimitMs?: number;
  goPuzzleCount?: 5 | 7 | 10;
  idempotencyKey: string;
  expiresAt?: string;
};

const requestSchema = z
  .object({
    targetPublicProfileId: z.string().uuid(),
    mode: z.enum(['og', 'go']),
    wordLength: z.number().int().min(2).max(35),
    hardMode: z.boolean(),
    timeLimitMs: z.number().int().positive().optional(),
    goPuzzleCount: z.union([z.literal(5), z.literal(7), z.literal(10)]).optional(),
    idempotencyKey: z.string().trim().min(1).max(200),
    expiresAt: z.string().datetime().optional(),
  })
  .superRefine((request, context) => {
    if ((request.mode === 'go') !== (request.goPuzzleCount !== undefined)) {
      context.addIssue({ code: 'custom', message: 'GO requests require a valid chain count.' });
    }
  });

export class PrivateRequestRepository {
  constructor(private readonly client: AmordleSupabaseClient) {}

  async create(input: PrivateRequestInput): Promise<unknown> {
    const request = requestSchema.parse(input);
    const { data, error } = await this.client.rpc('create_private_multiplayer_match_request_v2', {
      p_target_public_profile_id: request.targetPublicProfileId,
      p_mode: request.mode,
      p_word_length: request.wordLength,
      p_hard_mode: request.hardMode,
      p_idempotency_key: request.idempotencyKey,
      ...(request.timeLimitMs === undefined ? {} : { p_time_limit_ms: request.timeLimitMs }),
      ...(request.goPuzzleCount === undefined ? {} : { p_go_puzzle_count: request.goPuzzleCount }),
      ...(request.expiresAt === undefined ? {} : { p_expires_at: request.expiresAt }),
    });
    throwIfServiceError(error, 'Create private match request');
    return data?.[0] ?? null;
  }

  async list(status?: string, limit = 50): Promise<unknown[]> {
    const { data, error } = await this.client.rpc('get_private_multiplayer_match_requests', {
      p_limit: Math.min(Math.max(limit, 1), 100),
      ...(status ? { p_status: status } : {}),
    });
    throwIfServiceError(error, 'Load private match requests');
    return data ?? [];
  }

  async accept(requestId: string, projection: Json, idempotencyKey: string): Promise<unknown> {
    const { data, error } = await this.client.rpc('accept_private_multiplayer_match_request_v2', {
      p_request_id: requestId,
      p_game_projection: projection,
      p_idempotency_key: idempotencyKey,
    });
    throwIfServiceError(error, 'Accept private match request');
    return data?.[0] ?? null;
  }

  async decline(requestId: string): Promise<unknown> {
    const { data, error } = await this.client.rpc('decline_private_multiplayer_match_request', {
      p_request_id: requestId,
    });
    throwIfServiceError(error, 'Decline private match request');
    return data?.[0] ?? null;
  }

  async cancel(requestId: string): Promise<unknown> {
    const { data, error } = await this.client.rpc('cancel_private_multiplayer_match_request', {
      p_request_id: requestId,
    });
    throwIfServiceError(error, 'Cancel private match request');
    return data?.[0] ?? null;
  }

  async preference(): Promise<unknown> {
    const { data, error } = await this.client.rpc('get_private_multiplayer_request_preference');
    throwIfServiceError(error, 'Load private request preference');
    return data?.[0] ?? null;
  }

  async updatePreference(accept: boolean): Promise<unknown> {
    const { data, error } = await this.client.rpc('update_private_multiplayer_request_preference', {
      p_accept: accept,
    });
    throwIfServiceError(error, 'Update private request preference');
    return data?.[0] ?? null;
  }

  async blocks(): Promise<unknown[]> {
    const { data, error } = await this.client.rpc('get_private_multiplayer_request_blocks');
    throwIfServiceError(error, 'Load private request blocks');
    return data ?? [];
  }

  async setBlock(publicProfileId: string, blocked: boolean): Promise<unknown> {
    const { data, error } = await this.client.rpc('set_private_multiplayer_request_block', {
      p_target_public_profile_id: z.string().uuid().parse(publicProfileId),
      p_blocked: blocked,
    });
    throwIfServiceError(error, 'Update private request block');
    return data?.[0] ?? null;
  }
}
