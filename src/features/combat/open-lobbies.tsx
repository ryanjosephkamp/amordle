'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  cancelUnrankedPractice,
  joinDailyLobby,
  joinUnrankedPractice,
  listDailyLobbiesWithDiagnostics,
  listUnrankedPracticeWithDiagnostics,
  saveCombatCommand,
} from '@/adapters/supabase/combat';
import type { DailyLobby, PublicPracticeLobby } from '@/adapters/supabase/combat';
import { operationId } from '@/adapters/supabase/shared';
import { getBrowserSupabase } from '@/adapters/supabase/browser';
import { useAuth } from '@/components/providers';
import { AccountGate } from '@/components/route-states';

export function OpenLobbies() {
  return (
    <AccountGate>
      <OpenLobbiesInner />
    </AccountGate>
  );
}

function OpenLobbiesInner() {
  const auth = useAuth();
  const userId = auth.user?.id ?? '';
  const router = useRouter();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const practice = useQuery({
    queryKey: ['combat', 'lobby', 'practice'],
    queryFn: listUnrankedPracticeWithDiagnostics,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const daily = useQuery({
    queryKey: ['combat', 'lobby', 'daily'],
    queryFn: () => listDailyLobbiesWithDiagnostics(),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ['combat', 'lobby'] });
    const channel = supabase
      .channel(`open-lobbies:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'async_multiplayer_games' },
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

  const practiceRows = useMemo(
    () => (practice.data?.items ?? []).filter((row) => row.status === 'waiting'),
    [practice.data],
  );
  const dailyRows = useMemo(
    () => (daily.data?.items ?? []).filter((row) => row.status === 'waiting'),
    [daily.data],
  );

  const refresh = async () => {
    setMessage('');
    await Promise.all([practice.refetch(), daily.refetch()]);
  };
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['combat'] }),
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    ]);

  const joinPractice = useMutation({
    mutationFn: (lobby: PublicPracticeLobby) =>
      joinUnrankedPractice(lobby, operationId('public-practice-join')),
    onSuccess: (game) => {
      void invalidate();
      router.push(`/combat/match/${game.id}`);
    },
    onError: () => {
      setMessage('That Practice match changed before you joined. The lobby has been refreshed.');
      void practice.refetch();
    },
  });
  const cancelPractice = useMutation({
    mutationFn: (lobby: PublicPracticeLobby) =>
      cancelUnrankedPractice(lobby, operationId('public-practice-cancel')),
    onSuccess: () => {
      setMessage('Practice lobby cancelled.');
      void invalidate();
    },
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : 'The Practice lobby was not cancelled.'),
  });
  const joinDaily = useMutation({
    mutationFn: (lobby: DailyLobby) =>
      joinDailyLobby(lobby.id, lobby.version, operationId('daily-lobby-join')),
    onSuccess: (game) => {
      void invalidate();
      router.push(`/combat/match/${game.id}`);
    },
    onError: () => {
      setMessage('That Daily game changed before you joined. The lobby has been refreshed.');
      void daily.refetch();
    },
  });
  const cancelDaily = useMutation({
    mutationFn: (lobby: DailyLobby) =>
      saveCombatCommand({
        gameId: lobby.id,
        actionId: operationId('daily-lobby-cancel'),
        expectedVersion: lobby.version,
        expectedMoveCount: lobby.moveCount,
        command: 'cancel',
      }),
    onSuccess: () => {
      setMessage('Daily lobby cancelled.');
      void invalidate();
    },
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : 'The Daily lobby was not cancelled.'),
  });

  const pending =
    joinPractice.isPending ||
    cancelPractice.isPending ||
    joinDaily.isPending ||
    cancelDaily.isPending;
  const total = practiceRows.length + dailyRows.length;
  const skipped = (practice.data?.skipped ?? 0) + (daily.data?.skipped ?? 0);

  return (
    <section className="open-lobbies" aria-labelledby="open-games-heading">
      <div className="section-heading">
        <div>
          <h2 id="open-games-heading">Open public games</h2>
          <p className="mono">{total} joinable or waiting for you</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={pending}>
          Refresh
        </button>
      </div>
      <div className="action-row open-lobby-create-links">
        <Link className="button primary" href="/combat/practice">
          Open Practice setup
        </Link>
        <Link className="button" href="/combat/daily">
          Open Daily setup
        </Link>
      </div>

      {practice.isPending || daily.isPending ? (
        <p aria-live="polite">Checking public games…</p>
      ) : total ? (
        <div className="data-list">
          {practiceRows.map((row) => (
            <PracticeLobbyRow
              key={row.id}
              row={row}
              isOwner={row.capabilities.canCancel}
              pending={pending}
              join={() => joinPractice.mutate(row)}
              cancel={() => cancelPractice.mutate(row)}
            />
          ))}
          {dailyRows.map((lobby) => (
            <DailyLobbyRow
              key={lobby.id}
              lobby={lobby}
              pending={pending}
              join={() => joinDaily.mutate(lobby)}
              cancel={() => cancelDaily.mutate(lobby)}
            />
          ))}
        </div>
      ) : practice.isError && daily.isError ? (
        <div className="status-panel">
          <h2>Public games unavailable</h2>
          <p>Your private requests remain available below.</p>
          <button type="button" onClick={() => void refresh()}>
            Try again
          </button>
        </div>
      ) : (
        <p className="prose">No public games are waiting. Open one for another player to join.</p>
      )}

      {(practice.isError || daily.isError) && !(practice.isError && daily.isError) && (
        <p className="form-error" role="status">
          One public lane could not refresh. Available games from the other lane are still shown.
        </p>
      )}
      {skipped > 0 && (
        <p className="form-error" role="status">
          {skipped} outdated {skipped === 1 ? 'game was' : 'games were'} omitted safely.
        </p>
      )}
      <p aria-live="polite">{message}</p>
    </section>
  );
}

function PracticeLobbyRow({
  row,
  isOwner,
  pending,
  join,
  cancel,
}: {
  row: PublicPracticeLobby;
  isOwner: boolean;
  pending: boolean;
  join(): void;
  cancel(): void;
}) {
  return (
    <div className="data-row" data-game-id={row.id}>
      <div>
        <strong>{isOwner ? 'Your Practice lobby' : 'Open Practice player'}</strong>
        <p>
          Practice · {row.mode.toUpperCase()} · {row.wordLength} letters · {row.difficulty}
          {row.hardMode ? ' · Hard Mode' : ''}
          {row.timeLimitMs === 300_000 ? ' · 5:00 per player' : ' · untimed'}
        </p>
        <span className="mono">opened {formatAge(row.createdAt)}</span>
      </div>
      {isOwner ? (
        <button type="button" disabled={pending} onClick={cancel}>
          Cancel
        </button>
      ) : (
        <button className="primary" type="button" disabled={pending} onClick={join}>
          Join
        </button>
      )}
    </div>
  );
}

function DailyLobbyRow({
  lobby,
  pending,
  join,
  cancel,
}: {
  lobby: DailyLobby;
  pending: boolean;
  join(): void;
  cancel(): void;
}) {
  return (
    <div className="data-row" data-game-id={lobby.id}>
      <div>
        <strong>
          {lobby.capabilities.canCancel ? 'Your Daily lobby' : lobby.owner.displayName}
        </strong>
        <p>
          Daily · {lobby.mode.toUpperCase()} · {lobby.wordLength} letters
          {lobby.hardMode ? ' · Hard Mode' : ''}
        </p>
        <span className="mono">opened {formatAge(lobby.createdAt)}</span>
      </div>
      {lobby.capabilities.canCancel ? (
        <button type="button" disabled={pending} onClick={cancel}>
          Cancel
        </button>
      ) : lobby.capabilities.canJoin ? (
        <button className="primary" type="button" disabled={pending} onClick={join}>
          Join
        </button>
      ) : (
        <span className="badge">Unavailable</span>
      )}
    </div>
  );
}

function formatAge(value: string): string {
  const milliseconds = Math.max(0, Date.now() - Date.parse(value));
  const minutes = Math.floor(milliseconds / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}
