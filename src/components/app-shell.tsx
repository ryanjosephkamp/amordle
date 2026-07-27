'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { AccountSummary } from './account-summary';
import { NotificationCenter } from './notification-center';
import { useAuth } from './providers';

const primary = [
  { href: '/', label: 'Home' },
  { href: '/play', label: 'Play' },
  { href: '/calendar', label: 'Daily' },
  { href: '/combat', label: 'COMBAT' },
  { href: '/leaderboards', label: 'Community' },
] as const;

const secondary = [
  { href: '/history', label: 'History' },
  { href: '/words', label: 'Words' },
  { href: '/stats', label: 'Stats' },
  { href: '/marketplace', label: 'Market' },
  { href: '/settings', label: 'Settings' },
] as const;

export function AppShell({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const search = useSearchParams();
  const auth = useAuth();
  const [moreOpenedOn, setMoreOpenedOn] = useState<string | null>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  const morePanel = useRef<HTMLDivElement>(null);
  const focus =
    search.get('focus') === '1' &&
    (pathname.includes('/play/solo/') || pathname.includes('/combat/match/'));
  const moreOpen = moreOpenedOn === pathname;

  useEffect(() => {
    if (!moreOpen) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !morePanel.current?.contains(target) &&
        !moreButton.current?.contains(target)
      ) {
        setMoreOpenedOn(null);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMoreOpenedOn(null);
        moreButton.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    morePanel.current?.querySelector<HTMLElement>('a')?.focus();
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [moreOpen]);

  return (
    <div className={focus ? 'app-shell is-focus' : 'app-shell'}>
      {!focus && (
        <header className="topbar">
          <Link className="wordmark" href="/" aria-label="Amordle home">
            amordle
          </Link>
          <nav className="desktop-nav" aria-label="Primary">
            {primary.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={pathname === item.href ? 'page' : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <AccountSummary />
          <NotificationCenter />
          <div className="more-menu">
            <button
              ref={moreButton}
              type="button"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              aria-controls="more-navigation"
              onClick={() => setMoreOpenedOn(moreOpen ? null : pathname)}
            >
              More
            </button>
            {moreOpen && (
              <div
                ref={morePanel}
                id="more-navigation"
                className="menu-popover"
                role="menu"
                aria-label="More navigation"
              >
                {secondary.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    onClick={() => setMoreOpenedOn(null)}
                  >
                    {item.label}
                  </Link>
                ))}
                <Link
                  href={auth.status === 'signed-in' ? '/profile' : '/auth'}
                  role="menuitem"
                  onClick={() => setMoreOpenedOn(null)}
                >
                  {auth.status === 'signed-in' ? 'Profile' : 'Sign in'}
                </Link>
              </div>
            )}
          </div>
        </header>
      )}
      <main id="main-content">{children}</main>
      {focus && (
        <Link className="focus-exit" href={pathname as Route}>
          Exit focus
        </Link>
      )}
      {!focus && (
        <nav className="mobile-nav" aria-label="Primary">
          {primary.slice(0, 4).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
          <Link href="/settings">More</Link>
        </nav>
      )}
    </div>
  );
}
