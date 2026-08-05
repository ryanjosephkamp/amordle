'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getEconomy, loadHistory, loadProgress, spendCoins } from '@/adapters/supabase/account';
import { setDailyEntitlement } from '@/adapters/supabase/solo';
import { accountEconomyNamespace, economyQueryKey } from '@/application/query-keys';
import { useAuth } from '@/components/providers';

const floor = '2025-01-01';

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function shiftedMonth(key: string, amount: number): string {
  const [year, month] = key.split('-').map(Number);
  return monthKey(new Date(year!, month! - 1 + amount, 1, 12));
}

export function CalendarView() {
  const search = useSearchParams();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [today, setToday] = useState('');
  const [selectedDate, setSelectedDate] = useState(search.get('date') ?? '');
  const [mode, setMode] = useState<'og' | 'go'>(search.get('mode') === 'go' ? 'go' : 'og');
  const [message, setMessage] = useState('');
  const [confirmingUnlock, setConfirmingUnlock] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState('');
  const touchStartX = useRef<number | null>(null);
  const userId = auth.user?.id ?? '';
  const progress = useQuery({
    queryKey: ['progress', userId],
    queryFn: () => loadProgress(userId),
    enabled: Boolean(userId),
  });
  const economy = useQuery({
    queryKey: economyQueryKey(accountEconomyNamespace(userId)),
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
      const requested =
        selectedDate >= floor && selectedDate <= localToday ? selectedDate : localToday;
      setToday(localToday);
      setSelectedDate(requested);
      setVisibleMonth(requested.slice(0, 7));
    });
  }, [selectedDate]);

  const calendarCells = useMemo(() => {
    if (!visibleMonth) return [];
    const [year, month] = visibleMonth.split('-').map(Number);
    const first = new Date(year!, month! - 1, 1, 12);
    const dayCount = new Date(year!, month!, 0, 12).getDate();
    const cells: Array<string | null> = Array.from({ length: first.getDay() }, () => null);
    for (let day = 1; day <= dayCount; day += 1) {
      cells.push(dateKey(new Date(year!, month! - 1, day, 12)));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [visibleMonth]);

  const weekdayLabels = useMemo(() => {
    const fallback = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    try {
      const formatter = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
      return fallback.map((_, index) => formatter.format(new Date(2024, 0, 7 + index, 12)));
    } catch {
      return fallback;
    }
  }, []);

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
  const earliestMonth = floor.slice(0, 7);
  const currentMonth = today.slice(0, 7);
  const showMonth = (amount: number) => {
    const next = shiftedMonth(visibleMonth, amount);
    if (next < earliestMonth || next > currentMonth) return;
    setVisibleMonth(next);
    setConfirmingUnlock(false);
  };

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
      queryClient.setQueryData(economyQueryKey(accountEconomyNamespace(userId)), nextEconomy);
      queryClient.setQueryData(['progress', userId], nextProgress);
      setConfirmingUnlock(false);
      setMessage('Unlocked. It becomes permanent after your first accepted saved guess.');
    },
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : 'The Daily was not unlocked.'),
  });

  if (!today) return <p aria-live="polite">Preparing your local calendar…</p>;

  return (
    <div className="calendar-view">
      <div className="calendar-toolbar">
        <div>
          <strong>Solo Daily</strong>
          <span>Local date · five letters</span>
        </div>
        <div className="segmented" aria-label="Daily mode">
          <button
            type="button"
            aria-pressed={mode === 'og'}
            onClick={() => {
              setMode('og');
              setConfirmingUnlock(false);
            }}
          >
            OG
          </button>
          <button
            type="button"
            aria-pressed={mode === 'go'}
            onClick={() => {
              setMode('go');
              setConfirmingUnlock(false);
            }}
          >
            GO
          </button>
        </div>
      </div>
      <div
        className="calendar-month"
        onTouchStart={(event) => {
          touchStartX.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          const start = touchStartX.current;
          const end = event.changedTouches[0]?.clientX;
          touchStartX.current = null;
          if (start === null || end === undefined || Math.abs(end - start) < 44) return;
          showMonth(end < start ? 1 : -1);
        }}
      >
        <div className="calendar-month-header">
          <button
            type="button"
            aria-label="Previous month"
            disabled={visibleMonth <= earliestMonth}
            onClick={() => showMonth(-1)}
          >
            ←
          </button>
          <h2 aria-live="polite">
            {new Date(`${visibleMonth}-01T12:00:00`).toLocaleDateString(undefined, {
              month: 'long',
              year: 'numeric',
            })}
          </h2>
          <button
            type="button"
            aria-label="Next month"
            disabled={visibleMonth >= currentMonth}
            onClick={() => showMonth(1)}
          >
            →
          </button>
        </div>
        <div className="calendar-weekdays" aria-hidden="true">
          {weekdayLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <div className="calendar-grid" role="group" aria-label={`${visibleMonth} Solo Daily dates`}>
          {calendarCells.map((key, index) => {
            if (!key) return <span className="calendar-blank" key={`blank:${index}`} />;
            const future = key > today;
            const state = completed.has(`${key}:${mode}`)
              ? 'Complete'
              : key === today
                ? 'Today'
                : progress.data?.dailyEntitlements?.[`${key}:${mode}`]
                  ? 'Unlocked'
                  : future
                    ? 'Future'
                    : 'Locked';
            return (
              <button
                type="button"
                className={selectedDate === key ? 'calendar-day is-selected' : 'calendar-day'}
                aria-pressed={selectedDate === key}
                aria-label={`${new Date(`${key}T12:00:00`).toLocaleDateString()}: ${state}`}
                disabled={future}
                key={key}
                onClick={() => {
                  setSelectedDate(key);
                  setConfirmingUnlock(false);
                }}
              >
                <span>{Number(key.slice(-2))}</span>
                <strong>{state === 'Complete' ? '✓ Done' : state}</strong>
              </button>
            );
          })}
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
              onClick={() => setConfirmingUnlock(true)}
            >
              UNLOCK FOR 60 COINS
            </button>
          ) : null}
          <Link className="button" href="/combat/daily">
            Open UTC COMBAT Daily
          </Link>
        </div>
      </section>
      <details className="calendar-details">
        <summary>Choose another date and review date rules</summary>
        <div className="calendar-controls">
          <label>
            Any date from January 1, 2025
            <input
              type="date"
              min={floor}
              max={today}
              value={selectedDate}
              onChange={(event) => {
                setSelectedDate(event.target.value);
                setConfirmingUnlock(false);
              }}
            />
          </label>
          <p>
            Solo uses your local calendar day. COMBAT Daily uses UTC. Selecting a date never charges
            you.
          </p>
        </div>
      </details>
      {/* W-7: inline confirmation, not a modal — see marketplace-panel. */}
      {confirmingUnlock && !playable && !isFuture && (
        <section
          className="confirmation-panel"
          role="group"
          aria-labelledby="unlock-confirmation-title"
        >
          <div>
            <h2 id="unlock-confirmation-title">Unlock {selectedDate}</h2>
            <p>Solo {mode.toUpperCase()} costs 60 coins. No coins are spent until you confirm.</p>
          </div>
          <div className="action-row">
            <button
              type="button"
              className="primary"
              disabled={unlock.isPending}
              onClick={() => unlock.mutate()}
            >
              {unlock.isPending ? 'UNLOCKING…' : 'CONFIRM UNLOCK'}
            </button>
            <button
              type="button"
              disabled={unlock.isPending}
              onClick={() => setConfirmingUnlock(false)}
            >
              CANCEL
            </button>
          </div>
        </section>
      )}
      <p className="prose">
        {userId
          ? `Available balance: ${economy.data?.coins ?? 'loading'} coins.`
          : 'Sign in to unlock a past Daily.'}
      </p>
      <p aria-live="polite">{message}</p>
    </div>
  );
}
