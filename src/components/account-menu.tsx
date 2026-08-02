'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { getEconomy, loadProgress } from '@/adapters/supabase/account';
import { accountEconomyNamespace, economyQueryKey } from '@/application/query-keys';
import { useAuth } from './providers';

export function AccountMenu() {
  const auth = useAuth();
  const userId = auth.user?.id ?? '';
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const progress = useQuery({
    queryKey: ['progress', userId],
    queryFn: () => loadProgress(userId),
    enabled: auth.status === 'signed-in' && Boolean(userId),
  });
  const economy = useQuery({
    queryKey: economyQueryKey(accountEconomyNamespace(userId)),
    queryFn: getEconomy,
    enabled: auth.status === 'signed-in' && Boolean(userId),
  });

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !panel.current?.contains(target) &&
        !button.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    panel.current?.querySelector<HTMLElement>('a,button')?.focus();
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (auth.status !== 'signed-in') {
    return (
      <div className="account-menu">
        <Link href="/auth">Sign in</Link>
      </div>
    );
  }

  const displayName =
    typeof auth.user?.user_metadata.display_name === 'string' &&
    auth.user.user_metadata.display_name.trim()
      ? auth.user.user_metadata.display_name.trim()
      : (auth.user?.email ?? 'Signed-in player');
  const partialFailure = progress.isError || economy.isError;

  return (
    <div className="account-menu">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="account-navigation"
        onClick={() => setOpen((value) => !value)}
      >
        Account
      </button>
      {open && (
        <div
          ref={panel}
          id="account-navigation"
          className="menu-popover account-popover"
          role="menu"
          aria-label="Account"
        >
          <div className="account-popover-summary" role="presentation">
            <strong title={displayName}>{displayName}</strong>
            <dl aria-label="Account progression">
              <div>
                <dt>Level</dt>
                <dd>{progress.data?.level ?? '—'}</dd>
              </div>
              <div>
                <dt>XP</dt>
                <dd>{progress.data?.xp ?? '—'}</dd>
              </div>
              <div>
                <dt>Coins</dt>
                <dd>{economy.data?.coins ?? '—'}</dd>
              </div>
            </dl>
            {partialFailure && <small>Some account totals could not refresh.</small>}
          </div>
          <Link href="/profile" role="menuitem" onClick={() => setOpen(false)}>
            <span aria-hidden="true">›</span> View Profile
          </Link>
          <Link href="/settings" role="menuitem" onClick={() => setOpen(false)}>
            <span aria-hidden="true">›</span> Open Settings
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void auth.signOut();
            }}
          >
            <span aria-hidden="true">›</span> Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
