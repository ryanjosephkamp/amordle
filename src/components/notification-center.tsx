'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { readEnvelope, writeEnvelope } from '@/adapters/indexeddb';
import { loadSettings } from '@/adapters/supabase/account';
import {
  listLegacyRecent,
  listPracticeRematches,
  listPrivateRequests,
  listRecentCombat,
} from '@/adapters/supabase/combat';
import { getBrowserSupabase } from '@/adapters/supabase/browser';
import { mergeNotifications } from '@/domain/notifications';
import type { PlayerNotification } from '@/domain/notifications';
import { useAuth } from './providers';

const notificationSchema = z
  .object({
    id: z.string(),
    accountNamespace: z.string(),
    kind: z.enum(['request', 'match', 'turn', 'result', 'rematch']),
    durableRevision: z.string(),
    route: z.string(),
    createdAt: z.string(),
    read: z.boolean(),
  })
  .strict();
const stateSchema = z.array(notificationSchema);

interface NotificationFeed {
  items: PlayerNotification[];
  failedSources: number;
}

export function NotificationCenter() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const userId = auth.user?.id ?? '';
  const namespace = `account:${userId}`;
  const [open, setOpen] = useState(false);
  const [metadata, setMetadata] = useState<PlayerNotification[]>([]);
  const [hydratedNamespace, setHydratedNamespace] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const revisionRef = useRef(0);
  const feed = useQuery({
    queryKey: ['notifications', userId],
    queryFn: () => loadNotificationFeed(userId, namespace),
    enabled: Boolean(userId),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void readEnvelope(namespace, 'notifications:metadata', stateSchema).then((envelope) => {
      if (!active) return;
      revisionRef.current = envelope?.revision ?? 0;
      setMetadata(envelope?.state ?? []);
      setHydratedNamespace(namespace);
    });
    return () => {
      active = false;
    };
  }, [namespace, userId]);

  const notifications = useMemo(
    () => mergeNotifications(metadata, feed.data?.items ?? []).slice(0, 40),
    [feed.data?.items, metadata],
  );
  const unread = notifications.filter((item) => !item.read).length;

  const persist = useCallback(
    (next: PlayerNotification[]) => {
      setMetadata(next);
      revisionRef.current += 1;
      void writeEnvelope({
        schemaVersion: 1,
        ownerNamespace: namespace,
        domain: 'notifications:metadata',
        revision: revisionRef.current,
        updatedAt: new Date().toISOString(),
        state: next,
      });
    },
    [namespace],
  );

  useEffect(() => {
    if (hydratedNamespace !== namespace || !feed.data) return;
    if (JSON.stringify(metadata) === JSON.stringify(notifications)) return;
    const next = notifications;
    queueMicrotask(() => persist(next));
  }, [feed.data, hydratedNamespace, metadata, namespace, notifications, persist]);

  useEffect(() => {
    if (!userId) return;
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    const refresh = () =>
      void queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
    const channel = supabase
      .channel(`notification-projection:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'async_multiplayer_games' },
        refresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'multiplayer_private_match_requests' },
        refresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'multiplayer_practice_rematch_requests' },
        refresh,
      )
      .subscribe();
    const onOnline = () => refresh();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibility);
      void supabase.removeChannel(channel);
    };
  }, [queryClient, userId]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !dialogRef.current?.contains(target) &&
        !buttonRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    dialogRef.current?.querySelector<HTMLElement>('a,button')?.focus();
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const markRead = (id: string) => {
    persist(notifications.map((item) => (item.id === id ? { ...item, read: true } : item)));
    setOpen(false);
  };

  if (auth.status !== 'signed-in') return null;
  return (
    <div className="notification-menu">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="notification-center"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        onClick={() => setOpen((value) => !value)}
      >
        Alerts
        {unread > 0 && <span className="attention-badge">{unread}</span>}
      </button>
      {open && (
        <div
          ref={dialogRef}
          id="notification-center"
          className="menu-popover notification-popover"
          role="dialog"
          aria-label="Notifications"
        >
          <div className="section-heading">
            <strong>Notifications</strong>
            <button
              type="button"
              onClick={() => persist(notifications.map((item) => ({ ...item, read: true })))}
            >
              Mark all read
            </button>
          </div>
          {feed.isPending ? (
            <p>Checking updates…</p>
          ) : notifications.length ? (
            <>
              {(feed.isError || (feed.data?.failedSources ?? 0) > 0) && (
                <NotificationRefreshNotice
                  failedSources={feed.data?.failedSources ?? 1}
                  onRetry={() => void feed.refetch()}
                />
              )}
              <div className="notification-list">
                {notifications.map((item) => (
                  <Link
                    key={`${item.id}:${item.durableRevision}`}
                    href={item.route as Route}
                    className={item.read ? '' : 'is-unread'}
                    onClick={() => markRead(item.id)}
                  >
                    <strong>{labelFor(item.kind)}</strong>
                    <span>{new Date(item.createdAt).toLocaleString()}</span>
                  </Link>
                ))}
              </div>
            </>
          ) : (
            <>
              <p>No current notifications.</p>
              {(feed.isError || (feed.data?.failedSources ?? 0) > 0) && (
                <NotificationRefreshNotice
                  failedSources={feed.data?.failedSources ?? 1}
                  onRetry={() => void feed.refetch()}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationRefreshNotice({
  failedSources,
  onRetry,
}: {
  failedSources: number;
  onRetry: () => void;
}) {
  return (
    <div className="notification-source-warning" role="status">
      <span>
        {failedSources} notification source{failedSources === 1 ? '' : 's'} could not refresh.
      </span>
      <button type="button" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

async function loadNotificationFeed(userId: string, namespace: string): Promise<NotificationFeed> {
  const [settingsResult, gamesResult, legacyResult, requestsResult] = await Promise.allSettled([
    loadSettings(userId),
    listRecentCombat(),
    listLegacyRecent(userId),
    listPrivateRequests(),
  ]);
  let failedSources = 0;
  const enabled = settingsResult.status === 'fulfilled' ? settingsResult.value.notifications : true;
  if (settingsResult.status === 'rejected') failedSources += 1;
  if (!enabled) return { items: [], failedSources };

  const games = gamesResult.status === 'fulfilled' ? gamesResult.value : [];
  const legacy = legacyResult.status === 'fulfilled' ? legacyResult.value : [];
  const requests = requestsResult.status === 'fulfilled' ? requestsResult.value : [];
  if (gamesResult.status === 'rejected') failedSources += 1;
  if (legacyResult.status === 'rejected') failedSources += 1;
  if (requestsResult.status === 'rejected') failedSources += 1;

  const items: PlayerNotification[] = [];
  const terminalPracticeIds = new Set<string>();
  for (const request of requests) {
    const status = request.request_status.toLowerCase();
    if ((status === 'pending' || status === 'requested') && request.viewer_can_accept) {
      items.push(
        notification(
          namespace,
          `request:${request.request_id}`,
          'request',
          `${request.request_id}:${request.updated_at}:${status}`,
          '/combat/lobby',
          request.updated_at,
        ),
      );
    } else if (
      request.created_game_id &&
      (status === 'accepted' || status === 'matched' || status === 'created')
    ) {
      items.push(
        notification(
          namespace,
          `match:${request.created_game_id}`,
          'match',
          `${request.request_id}:${request.updated_at}:${request.created_game_id}`,
          `/combat/match/${request.created_game_id}`,
          request.updated_at,
        ),
      );
    }
  }

  for (const game of games) {
    const terminal = game.outcome.terminal;
    if (terminal && game.scope === 'practice') terminalPracticeIds.add(game.id);
    const isTurn = !terminal && game.status === 'playing' && game.currentTurn === game.viewerSeat;
    const isMatch =
      !terminal && !isTurn && (game.status === 'waiting' || game.status === 'playing');
    if (!terminal && !isTurn && !isMatch) continue;
    const kind = terminal ? 'result' : isTurn ? 'turn' : 'match';
    items.push(
      notification(
        namespace,
        `${kind}:${game.id}`,
        kind,
        `${game.id}:${game.version}:${terminal ? 'terminal' : (game.currentTurn ?? game.status)}`,
        terminal ? `/combat/results/${game.id}` : `/combat/match/${game.id}`,
        game.updatedAt,
      ),
    );
  }

  for (const row of legacy) {
    const seat = row.player_one_user_id === userId ? 'player-one' : 'player-two';
    const terminal = row.status === 'won' || row.status === 'lost' || row.status === 'cancelled';
    const hasPlay = row.projection.moves.length > 0;
    const isTurn = !terminal && row.status === 'playing' && row.current_turn === seat;
    const isMatch = !terminal && !isTurn && (row.status === 'waiting' || row.status === 'playing');
    if (terminal && hasPlay) terminalPracticeIds.add(row.id);
    if ((!terminal && !isTurn && !isMatch) || (terminal && !hasPlay)) continue;
    const kind = terminal ? 'result' : isTurn ? 'turn' : 'match';
    items.push(
      notification(
        namespace,
        `${kind}:${row.id}`,
        kind,
        `${row.id}:${row.state_version}:${terminal ? row.status : row.current_turn}`,
        terminal ? `/combat/results/${row.id}` : `/combat/match/${row.id}`,
        row.updated_at,
      ),
    );
  }

  const rematchResults = await Promise.allSettled(
    [...terminalPracticeIds].slice(0, 20).map((gameId) => listPracticeRematches(gameId)),
  );
  for (const result of rematchResults) {
    if (result.status === 'rejected') {
      failedSources += 1;
      continue;
    }
    for (const request of result.value) {
      if (request.request_status === 'pending' || request.request_status === 'accepted') {
        const route = request.created_game_id
          ? `/combat/match/${request.created_game_id}`
          : `/combat/results/${request.source_game_id}`;
        items.push(
          notification(
            namespace,
            `rematch:${request.request_id}`,
            'rematch',
            `${request.request_id}:${request.updated_at}:${request.request_status}`,
            route,
            request.updated_at,
          ),
        );
      }
    }
  }

  return { items, failedSources };
}

function notification(
  accountNamespace: string,
  id: string,
  kind: PlayerNotification['kind'],
  durableRevision: string,
  route: string,
  createdAt: string,
): PlayerNotification {
  return {
    id,
    accountNamespace,
    kind,
    durableRevision,
    route,
    createdAt,
    read: false,
  };
}

function labelFor(kind: PlayerNotification['kind']): string {
  if (kind === 'request') return 'Private match request';
  if (kind === 'turn') return 'Your turn';
  if (kind === 'result') return 'Match result';
  if (kind === 'rematch') return 'Rematch update';
  return 'Match ready';
}
