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
  { href: '/', label: 'HOME' },
  { href: '/play/solo', label: 'SOLO' },
  { href: '/calendar', label: 'DAILY' },
  { href: '/combat', label: 'COMBAT' },
  { href: '/history', label: 'DATA' },
] as const;

const secondary = [
  { href: '/play', label: 'All game modes' },
  { href: '/leaderboards', label: 'Leaderboards' },
  { href: '/history', label: 'History' },
  { href: '/words', label: 'Words' },
  { href: '/stats', label: 'Stats' },
  { href: '/marketplace', label: 'Marketplace' },
  { href: '/settings', label: 'Settings' },
  { href: '/help', label: 'Help' },
] as const;

function isCurrent(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function routeContext(pathname: string): string {
  if (pathname === '/') return 'AMORDLE / HOME';
  const parts = pathname.split('/').filter(Boolean);
  return `AMORDLE / ${parts.map((part) => part.replaceAll('-', ' ').toUpperCase()).join(' / ')}`;
}

export function AppShell({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const search = useSearchParams();
  const auth = useAuth();
  const [moreOpenedOn, setMoreOpenedOn] = useState<string | null>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  const mobileMoreButton = useRef<HTMLButtonElement>(null);
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
        !moreButton.current?.contains(target) &&
        !mobileMoreButton.current?.contains(target)
      ) {
        setMoreOpenedOn(null);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMoreOpenedOn(null);
        const target = window.matchMedia('(max-width: 47.99rem)').matches
          ? mobileMoreButton.current
          : moreButton.current;
        target?.focus();
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
        <div className="global-chrome">
          <header className="topbar">
            <Link className="wordmark" href="/" aria-label="Amordle home">
              <span aria-hidden="true">A:</span> AMORDLE
            </Link>
            <nav className="desktop-nav" aria-label="Primary">
              {primary.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isCurrent(pathname, item.href) ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="topbar-tools">
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
                  MORE
                </button>
                {moreOpen && (
                  <div
                    ref={morePanel}
                    id="more-navigation"
                    className="menu-popover"
                    role="menu"
                    aria-label="More navigation"
                  >
                    <div className="menu-heading" aria-hidden="true">
                      MORE / DESTINATIONS
                    </div>
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
            </div>
          </header>
          <div className="context-rail" aria-label="Current location">
            <span>{routeContext(pathname)}</span>
            <span className="context-ready">READY</span>
          </div>
        </div>
      )}
      <main id="main-content">{children}</main>
      {focus && (
        <Link className="focus-exit" href={pathname as Route}>
          EXIT FOCUS
        </Link>
      )}
      {!focus && (
        <nav className="mobile-nav" aria-label="Primary">
          {primary.slice(0, 4).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isCurrent(pathname, item.href) ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
          <button
            ref={mobileMoreButton}
            type="button"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            aria-controls="more-navigation"
            onClick={() => setMoreOpenedOn(moreOpen ? null : pathname)}
          >
            MORE
          </button>
        </nav>
      )}
    </div>
  );
}
