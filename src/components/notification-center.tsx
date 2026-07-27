'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { readEnvelope, writeEnvelope } from '@/adapters/indexeddb';
import { loadSettings } from '@/adapters/supabase/account';
import { listActiveCombat, listPrivateRequests } from '@/adapters/supabase/combat';
import { useAuth } from './providers';
import { mergeNotifications } from '@/domain/notifications';
import type { PlayerNotification } from '@/domain/notifications';

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

export function NotificationCenter() {
  const auth = useAuth();
  const userId = auth.user?.id ?? '';
  const namespace = `account:${userId}`;
  const [open, setOpen] = useState(false);
  const [metadata, setMetadata] = useState<PlayerNotification[]>([]);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const revisionRef = useRef(0);
  const feed = useQuery({
    queryKey: ['notifications', userId],
    queryFn: async () => {
      const [settings, games, requests] = await Promise.all([
        loadSettings(userId),
        listActiveCombat(),
        listPrivateRequests(),
      ]);
      if (!settings.notifications) return [];
      const notifications: PlayerNotification[] = [];
      for (const request of requests) {
        if (request.request_status === 'pending' && request.viewer_can_accept) {
          notifications.push({
            id: `request:${request.request_id}`,
            accountNamespace: namespace,
            kind: 'request',
            durableRevision: `${request.request_id}:${request.updated_at}`,
            route: '/combat/lobby',
            createdAt: request.updated_at,
            read: false,
          });
        }
      }
      for (const game of games) {
        const terminal = game.outcome.terminal;
        const isTurn =
          !terminal && game.status === 'playing' && game.currentTurn === game.viewerSeat;
        if (terminal || isTurn) {
          notifications.push({
            id: `${terminal ? 'result' : 'turn'}:${game.id}`,
            accountNamespace: namespace,
            kind: terminal ? 'result' : 'turn',
            durableRevision: `${game.id}:${game.version}:${terminal ? 'terminal' : game.currentTurn}`,
            route: terminal ? `/combat/results/${game.id}` : `/combat/match/${game.id}`,
            createdAt: game.updatedAt,
            read: false,
          });
        }
      }
      return notifications;
    },
    enabled: Boolean(userId),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void readEnvelope(namespace, 'notifications:metadata', stateSchema).then((envelope) => {
      if (active && envelope) setMetadata(envelope.state);
    });
    return () => {
      active = false;
    };
  }, [namespace, userId]);

  const notifications = useMemo(() => {
    const merged = mergeNotifications(metadata, feed.data ?? []);
    return merged.slice(0, 40);
  }, [feed.data, metadata]);
  const unread = notifications.filter((item) => !item.read).length;

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

  const persist = (next: PlayerNotification[]) => {
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
  };
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
            <div className="notification-list">
              {notifications.map((item) => (
                <Link
                  key={item.id}
                  href={item.route as Route}
                  className={item.read ? '' : 'is-unread'}
                  onClick={() => markRead(item.id)}
                >
                  <strong>{labelFor(item.kind)}</strong>
                  <span>{new Date(item.createdAt).toLocaleString()}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p>No current notifications.</p>
          )}
        </div>
      )}
    </div>
  );
}

function labelFor(kind: PlayerNotification['kind']): string {
  if (kind === 'request') return 'Private match request';
  if (kind === 'turn') return 'Your turn';
  if (kind === 'result') return 'Match result';
  if (kind === 'rematch') return 'Rematch update';
  return 'Match update';
}
