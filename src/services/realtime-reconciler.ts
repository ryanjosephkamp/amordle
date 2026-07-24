import type { RealtimeChannel } from '@supabase/supabase-js';
import type { AmordleSupabaseClient } from '../lib/supabase-browser';

export type ReconcileReason = 'initial' | 'poll' | 'realtime' | 'visibility' | 'reconnect';

export type RealtimeReconcilerOptions = {
  channelName: string;
  table: 'async_multiplayer_games' | 'live_lobbies' | 'live_matches' | 'live_match_events';
  filter?: string;
  pollIntervalMs?: number;
  coalesceMs?: number;
  reconcile: (reason: ReconcileReason, signal: AbortSignal) => Promise<void>;
  onError?: (error: unknown) => void;
};

/**
 * Realtime only prompts a durable reload. Bounded polling and visibility
 * reconciliation remain active so missed, duplicated, or reordered events
 * cannot become application authority.
 */
export class RealtimeReconciler {
  private channel: RealtimeChannel | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private coalesceTimer: ReturnType<typeof setTimeout> | null = null;
  private activeRequest: AbortController | null = null;
  private started = false;

  constructor(
    private readonly client: AmordleSupabaseClient,
    private readonly options: RealtimeReconcilerOptions,
  ) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    const interval = Math.min(Math.max(this.options.pollIntervalMs ?? 10_000, 2_000), 30_000);

    this.channel = this.client
      .channel(this.options.channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: this.options.table,
          ...(this.options.filter ? { filter: this.options.filter } : {}),
        },
        () => this.schedule('realtime'),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') this.schedule('reconnect');
      });

    this.pollTimer = setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) this.schedule('poll');
    }, interval);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('online', this.onReconnect);
    this.schedule('initial');
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.coalesceTimer) clearTimeout(this.coalesceTimer);
    this.pollTimer = null;
    this.coalesceTimer = null;
    this.activeRequest?.abort();
    this.activeRequest = null;
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('online', this.onReconnect);
    if (this.channel) void this.client.removeChannel(this.channel);
    this.channel = null;
  }

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') this.schedule('visibility');
  };

  private readonly onReconnect = (): void => {
    this.schedule('reconnect');
  };

  private schedule(reason: ReconcileReason): void {
    if (!this.started) return;
    if (this.coalesceTimer) clearTimeout(this.coalesceTimer);
    this.coalesceTimer = setTimeout(
      () => {
        this.coalesceTimer = null;
        this.activeRequest?.abort();
        const controller = new AbortController();
        this.activeRequest = controller;
        void this.options
          .reconcile(reason, controller.signal)
          .catch((error: unknown) => this.options.onError?.(error))
          .finally(() => {
            if (this.activeRequest === controller) this.activeRequest = null;
          });
      },
      Math.min(Math.max(this.options.coalesceMs ?? 75, 0), 500),
    );
  }
}
