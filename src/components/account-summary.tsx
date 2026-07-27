'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { getEconomy, loadProgress } from '@/adapters/supabase/account';
import { useAuth } from './providers';

export function AccountSummary() {
  const auth = useAuth();
  const userId = auth.user?.id ?? '';
  const economy = useQuery({
    queryKey: ['economy'],
    queryFn: getEconomy,
    enabled: auth.status === 'signed-in',
  });
  const progress = useQuery({
    queryKey: ['progress', userId],
    queryFn: () => loadProgress(userId),
    enabled: Boolean(userId),
  });
  if (auth.status !== 'signed-in') return null;
  return (
    <div className="account-summary" aria-label="Progression summary">
      <Link href="/stats">
        L{progress.data?.level ?? '–'} · {progress.data?.xp ?? '–'} XP
      </Link>
      <Link href="/marketplace">{economy.data?.coins ?? '–'} coins</Link>
    </div>
  );
}
