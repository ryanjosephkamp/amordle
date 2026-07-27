'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { loadProgress } from '@/adapters/supabase/account';
import { useAuth } from '@/components/providers';
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
    queueMicrotask(() => {
      const date = new Date();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      setToday(`${year}-${month}-${day}`);
    });
  }, []);

  if (!today || auth.status === 'loading') {
    return <p aria-live="polite">Checking Daily access…</p>;
  }
  if (localDate > today) {
    return (
      <section className="status-panel">
        <h2>Daily not available yet</h2>
        <p>This local date has not begun for you.</p>
        <Link className="button" href="/calendar">
          Return to Calendar
        </Link>
      </section>
    );
  }
  if (localDate === today) return children;
  const entitlement = progress.data?.dailyEntitlements?.[`${localDate}:${mode}`];
  if (entitlement === 'pending' || entitlement === 'unlocked') return children;
  return (
    <section className="status-panel">
      <h2>Past Daily locked</h2>
      <p>
        This {mode.toUpperCase()} Daily costs 60 coins to unlock. Selecting it never charges you;
        confirm the purchase in Calendar.
      </p>
      <Link className="button primary" href={`/calendar?date=${localDate}&mode=${mode}`}>
        Review in Calendar
      </Link>
    </section>
  );
}
