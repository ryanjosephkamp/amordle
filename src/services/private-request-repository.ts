import { z } from 'zod';
import type { AmordleSupabaseClient } from '../lib/supabase-browser';
import type { Json } from '../types/database';
import { postgresTimestamptzSchema } from './postgres-timestamp';
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

const preferenceSchema = z.object({
  accept_private_practice_requests: z.boolean(),
  updated_at: postgresTimestamptzSchema,
});
const blockSchema = z.object({
  public_profile_id: z.string().uuid(),
  display_name: z.string().trim().min(1).max(50),
  accent_color: z.enum(['ice', 'aurora', 'cyan', 'violet', 'rose', 'amber']),
  flair_key: z.literal('none'),
  avatar_url: z.url().max(2048).nullable(),
  blocked_at: postgresTimestamptzSchema,
});
const blockMutationSchema = z.object({
  blocked: z.boolean(),
  public_profile_id: z.string().uuid(),
  updated_at: postgresTimestamptzSchema,
});

export type PrivateRequestPreference = z.infer<typeof preferenceSchema>;
export type PrivateRequestBlock = z.infer<typeof blockSchema>;
export type PrivateRequestBlockMutation = z.infer<typeof blockMutationSchema>;

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

  async preference(): Promise<PrivateRequestPreference> {
    const { data, error } = await this.client.rpc('get_private_multiplayer_request_preference');
    throwIfServiceError(error, 'Load private request preference');
    return preferenceSchema.parse(data?.[0]);
  }

  async updatePreference(accept: boolean): Promise<PrivateRequestPreference> {
    const { data, error } = await this.client.rpc('update_private_multiplayer_request_preference', {
      p_accept: accept,
    });
    throwIfServiceError(error, 'Update private request preference');
    return preferenceSchema.parse(data?.[0]);
  }

  async blocks(): Promise<PrivateRequestBlock[]> {
    const { data, error } = await this.client.rpc('get_private_multiplayer_request_blocks');
    throwIfServiceError(error, 'Load private request blocks');
    return z.array(blockSchema).parse(data ?? []);
  }

  async setBlock(publicProfileId: string, blocked: boolean): Promise<PrivateRequestBlockMutation> {
    const { data, error } = await this.client.rpc('set_private_multiplayer_request_block', {
      p_target_public_profile_id: z.string().uuid().parse(publicProfileId),
      p_blocked: blocked,
    });
    throwIfServiceError(error, 'Update private request block');
    return blockMutationSchema.parse(data?.[0]);
  }
}
