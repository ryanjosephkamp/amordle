'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getEconomy, loadHistory, loadProgress, spendCoins } from '@/adapters/supabase/account';
import { setDailyEntitlement } from '@/adapters/supabase/solo';
import { useAuth } from '@/components/providers';

const floor = '2025-01-01';

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function CalendarView() {
  const search = useSearchParams();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [today, setToday] = useState('');
  const [selectedDate, setSelectedDate] = useState(search.get('date') ?? '');
  const [mode, setMode] = useState<'og' | 'go'>(search.get('mode') === 'go' ? 'go' : 'og');
  const [message, setMessage] = useState('');
  const todayButton = useRef<HTMLButtonElement | null>(null);
  const userId = auth.user?.id ?? '';
  const progress = useQuery({
    queryKey: ['progress', userId],
    queryFn: () => loadProgress(userId),
    enabled: Boolean(userId),
  });
  const economy = useQuery({
    queryKey: ['economy'],
    queryFn: getEconomy,
    enabled: Boolean(userId),
  });
  const history = useQuery({
    queryKey: ['history', userId],
    queryFn: () => loadHistory(userId),
    enabled: Boolean(userId),
  });

  useEffect(() => {
    queueMicrotask(() => {
      const localToday = dateKey(new Date());
      setToday(localToday);
      setSelectedDate((current) => current || localToday);
    });
  }, []);

  useEffect(() => {
    if (!today) return;
    const timer = window.setTimeout(() => {
      todayButton.current?.scrollIntoView({ block: 'nearest', inline: 'end' });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [today]);

  const recentDates = useMemo(() => {
    if (!today) return [];
    const anchor = new Date(`${today}T12:00:00`);
    return Array.from({ length: 35 }, (_, index) => {
      const date = new Date(anchor);
      date.setDate(anchor.getDate() - (34 - index));
      return dateKey(date);
    }).filter((key) => key >= floor);
  }, [today]);

  const completed = useMemo(
    () =>
      new Set(
        history.data
          ?.filter((row) => row.entry.kind === 'solo-daily' && row.entry.dailyDate)
          .map((row) => `${row.entry.dailyDate}:${row.entry.mode}`) ?? [],
      ),
    [history.data],
  );
  const entitlementKey = `${selectedDate}:${mode}`;
  const entitlement = progress.data?.dailyEntitlements?.[entitlementKey];
  const isCurrent = selectedDate === today;
  const isFuture = Boolean(today && selectedDate > today);
  const playable =
    !isFuture &&
    (isCurrent ||
      entitlement === 'pending' ||
      entitlement === 'unlocked' ||
      completed.has(entitlementKey));

  const unlock = useMutation({
    mutationFn: async () => {
      if (!userId || !selectedDate || selectedDate >= today) {
        throw new Error('Choose a past Daily and sign in first.');
      }
      const operation = `daily-unlock:${selectedDate}:${mode}`;
      const nextEconomy = await spendCoins(60, operation);
      const nextProgress = await setDailyEntitlement(userId, entitlementKey, 'pending');
      return { nextEconomy, nextProgress };
    },
    onSuccess: ({ nextEconomy, nextProgress }) => {
      queryClient.setQueryData(['economy'], nextEconomy);
      queryClient.setQueryData(['progress', userId], nextProgress);
      setMessage('Unlocked. It becomes permanent after your first accepted saved guess.');
    },
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : 'The Daily was not unlocked.'),
  });

  if (!today) return <p aria-live="polite">Preparing your local calendar…</p>;

  return (
    <>
      <div className="calendar-strip" role="group" aria-label="Recent Solo Daily dates">
        {recentDates.map((key) => {
          const state = completed.has(`${key}:${mode}`)
            ? 'Complete'
            : key === today
              ? 'Today'
              : progress.data?.dailyEntitlements?.[`${key}:${mode}`]
                ? 'Unlocked'
                : 'Locked';
          return (
            <button
              ref={key === today ? todayButton : undefined}
              type="button"
              className={selectedDate === key ? 'calendar-day is-selected' : 'calendar-day'}
              aria-pressed={selectedDate === key}
              key={key}
              onClick={() => setSelectedDate(key)}
            >
              <span>
                {new Date(`${key}T12:00:00`).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
              <strong>{state}</strong>
            </button>
          );
        })}
      </div>
      <div className="calendar-controls">
        <label>
          Any date from January 1, 2025
          <input
            type="date"
            min={floor}
            max={today}
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
          />
        </label>
        <div className="segmented" aria-label="Daily mode">
          <button type="button" aria-pressed={mode === 'og'} onClick={() => setMode('og')}>
            OG
          </button>
          <button type="button" aria-pressed={mode === 'go'} onClick={() => setMode('go')}>
            GO
          </button>
        </div>
      </div>
      <section className="calendar-selection" aria-labelledby="selected-daily-heading">
        <div>
          <h2 id="selected-daily-heading">{selectedDate || 'Choose a date'}</h2>
          <p>
            Solo {mode.toUpperCase()} · local calendar day ·{' '}
            {isFuture
              ? 'Unavailable'
              : completed.has(entitlementKey)
                ? 'Complete'
                : playable
                  ? entitlement === 'pending'
                    ? 'Pending unlock'
                    : 'Ready'
                  : 'Locked · 60 coins'}
          </p>
        </div>
        <div className="action-row">
          {playable ? (
            <Link className="button primary" href={`/play/solo/daily/${selectedDate}/${mode}`}>
              {completed.has(entitlementKey) ? 'Replay' : 'Play'}
            </Link>
          ) : !isFuture ? (
            <button
              className="primary"
              disabled={!userId || unlock.isPending || !economy.data || economy.data.coins < 60}
              onClick={() => unlock.mutate()}
            >
              {unlock.isPending ? 'Unlocking…' : 'Unlock for 60 coins'}
            </button>
          ) : null}
          <Link className="button" href="/combat/daily">
            Open UTC COMBAT Daily
          </Link>
        </div>
      </section>
      <p className="prose">
        {userId
          ? `Authoritative balance: ${economy.data?.coins ?? 'loading'} coins.`
          : 'Sign in to unlock a past Daily. Selecting a date never charges you.'}
      </p>
      <p aria-live="polite">{message}</p>
    </>
  );
}
