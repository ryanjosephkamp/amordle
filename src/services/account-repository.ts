import type { AmordleSupabaseClient } from '../lib/supabase-browser';
import type { Json, Tables } from '../types/database';
import { throwIfServiceError } from './service-error';

export class AccountRepository {
  constructor(private readonly client: AmordleSupabaseClient) {}

  async loadProgress(userId: string): Promise<Json | null> {
    const { data, error } = await this.client
      .from('progress_snapshots')
      .select('progress')
      .eq('user_id', userId)
      .maybeSingle();
    throwIfServiceError(error, 'Load progress');
    return data?.progress ?? null;
  }

  async saveProgress(userId: string, progress: Json, updatedAt: string): Promise<void> {
    const update = await this.client
      .from('progress_snapshots')
      .update({ progress, updated_at: updatedAt })
      .eq('user_id', userId)
      .lte('updated_at', updatedAt)
      .select('updated_at');
    throwIfServiceError(update.error, 'Save progress');
    if ((update.data?.length ?? 0) > 0) return;
    const insert = await this.client
      .from('progress_snapshots')
      .upsert(
        { user_id: userId, progress, updated_at: updatedAt },
        { onConflict: 'user_id', ignoreDuplicates: true },
      );
    throwIfServiceError(insert.error, 'Save progress');
  }

  async loadSettings(userId: string): Promise<Json | null> {
    const { data, error } = await this.client
      .from('settings')
      .select('settings')
      .eq('user_id', userId)
      .maybeSingle();
    throwIfServiceError(error, 'Load settings');
    return data?.settings ?? null;
  }

  async saveSettings(userId: string, settings: Json, updatedAt: string): Promise<void> {
    const update = await this.client
      .from('settings')
      .update({ settings, updated_at: updatedAt })
      .eq('user_id', userId)
      .lte('updated_at', updatedAt)
      .select('updated_at');
    throwIfServiceError(update.error, 'Save settings');
    if ((update.data?.length ?? 0) > 0) return;
    const insert = await this.client
      .from('settings')
      .upsert(
        { user_id: userId, settings, updated_at: updatedAt },
        { onConflict: 'user_id', ignoreDuplicates: true },
      );
    throwIfServiceError(insert.error, 'Save settings');
  }

  async listHistory(userId: string, limit = 100): Promise<Tables<'game_history'>[]> {
    const { data, error } = await this.client
      .from('game_history')
      .select('*')
      .eq('user_id', userId)
      .order('completed_at', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 250));
    throwIfServiceError(error, 'Load history');
    return data ?? [];
  }

  async saveHistory(entry: Tables<'game_history'>): Promise<void> {
    const { error } = await this.client
      .from('game_history')
      .upsert(entry, { onConflict: 'user_id,id' });
    throwIfServiceError(error, 'Save history');
  }
}
