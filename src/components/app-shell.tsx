'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { AccountSummary } from './account-summary';
import { ConnectivityStatus } from './connectivity-status';
import { NotificationCenter } from './notification-center';
import { useAuth } from './providers';

const primary = [
  { href: '/', label: 'home', shortcut: '1' },
  { href: '/play/solo', label: 'solo', shortcut: '2' },
  { href: '/calendar', label: 'daily', shortcut: '3' },
  { href: '/combat', label: 'combat', shortcut: '4' },
  { href: '/history', label: 'data', shortcut: '5' },
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
  if (pathname === '/') return 'amordle / home';
  const parts = pathname.split('/').filter(Boolean);
  return `amordle / ${parts.map((part) => part.replaceAll('-', ' ')).join(' / ')}`;
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
  const gameSurface = pathname.includes('/play/solo/') || pathname.includes('/combat/match/');
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
    <div
      className={['app-shell', focus ? 'is-focus' : '', gameSurface ? 'is-game-surface' : '']
        .filter(Boolean)
        .join(' ')}
    >
      {!focus && (
        <div className="global-chrome">
          <header className="terminal-titlebar">
            <span className="traffic-lights" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <Link className="window-title" href="/" aria-label="Amordle home">
              amordle — play
            </Link>
            <span className="window-session">
              {auth.status === 'signed-in' ? 'account' : 'guest'} · local
            </span>
          </header>
          <div className="context-rail" aria-label="Current location">
            <span>{routeContext(pathname)}</span>
            <span className="context-ready">ready</span>
          </div>
          <div className="topbar">
            <Link className="wordmark" href="/" aria-label="Amordle home">
              <span aria-hidden="true">❯</span> amordle
            </Link>
            <nav className="desktop-nav" aria-label="Primary">
              {primary.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isCurrent(pathname, item.href) ? 'page' : undefined}
                >
                  <span aria-hidden="true" className="nav-marker">
                    {isCurrent(pathname, item.href) ? '❯' : ' '}
                  </span>
                  {item.label}
                  <kbd>[{item.shortcut}]</kbd>
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
                  aria-label="More navigation"
                  aria-haspopup="menu"
                  aria-expanded={moreOpen}
                  aria-controls="more-navigation"
                  onClick={() => setMoreOpenedOn(moreOpen ? null : pathname)}
                >
                  <span aria-hidden="true">[m]</span> menu
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
                      ┌─ destinations ─────────────────┐
                    </div>
                    {secondary.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        role="menuitem"
                        onClick={() => setMoreOpenedOn(null)}
                      >
                        <span aria-hidden="true">›</span> {item.label}
                      </Link>
                    ))}
                    <Link
                      href={auth.status === 'signed-in' ? '/profile' : '/auth'}
                      role="menuitem"
                      onClick={() => setMoreOpenedOn(null)}
                    >
                      <span aria-hidden="true">›</span>{' '}
                      {auth.status === 'signed-in' ? 'Profile' : 'Sign in'}
                    </Link>
                    <div className="menu-footer" aria-hidden="true">
                      └────────────────────────────────┘
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      <main id="main-content">{children}</main>
      {focus && (
        <Link className="focus-exit" href={pathname as Route}>
          EXIT FOCUS
        </Link>
      )}
      {!focus && !gameSurface && (
        <nav className="mobile-nav" aria-label="Primary">
          {primary.slice(0, 4).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isCurrent(pathname, item.href) ? 'page' : undefined}
            >
              <span aria-hidden="true">[{item.shortcut}]</span> {item.label}
            </Link>
          ))}
          <button
            ref={mobileMoreButton}
            type="button"
            aria-label="More navigation"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            aria-controls="more-navigation"
            onClick={() => setMoreOpenedOn(moreOpen ? null : pathname)}
          >
            [m] menu
          </button>
        </nav>
      )}
      {!focus && (
        <footer className="terminal-statusbar" aria-label="Application status">
          <span>tab select · enter open · esc close</span>
          <span>{auth.status === 'signed-in' ? 'account synced' : 'guest · device save'}</span>
        </footer>
      )}
      <ConnectivityStatus />
    </div>
  );
}
