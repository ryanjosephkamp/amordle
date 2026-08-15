'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { loadProgress } from '@/adapters/supabase/account';
import { useAuth } from '@/components/providers';
import { StatusPanel } from '@/components/route-states';
import { localDayKey } from '@/domain/daily-streak';
import type { PropsWithChildren } from 'react';

export function DailyAccessGate({
  localDate,
  mode,
  children,
}: PropsWithChildren<{ localDate: string; mode: 'og' | 'go' }>) {
  const auth = useAuth();
  const [today, setToday] = useState('');
  const userId = auth.user?.id ?? '';
  const progress = useQuery({
    queryKey: ['progress', userId],
    queryFn: () => loadProgress(userId),
    enabled: Boolean(userId),
  });

  useEffect(() => {
    queueMicrotask(() => setToday(localDayKey(new Date())));
  }, []);

  if (!today || auth.status === 'loading') {
    return <p aria-live="polite">Checking Daily access…</p>;
  }
  if (localDate > today) {
    return (
      <StatusPanel
        title="Daily not available yet"
        action={
          <Link className="button" href="/calendar">
            RETURN TO CALENDAR
          </Link>
        }
      >
        <p>This local date has not begun for you.</p>
      </StatusPanel>
    );
  }
  if (localDate === today) return children;
  const entitlement = progress.data?.dailyEntitlements?.[`${localDate}:${mode}`];
  if (entitlement === 'pending' || entitlement === 'unlocked') return children;
  return (
    <StatusPanel
      title="Locked Daily"
      action={
        <Link className="button primary" href={`/calendar?date=${localDate}&mode=${mode}`}>
          REVIEW IN CALENDAR
        </Link>
      }
    >
      <p>
        Unlock this date to play or view results. This {mode.toUpperCase()} Daily costs 60 coins. No
        coins are spent until you confirm.
      </p>
    </StatusPanel>
  );
}
