'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  PropsWithChildren,
} from 'react';
import {
  directNavigationShortcuts,
  hasActiveModal,
  isEditableShortcutTarget,
  matchDirectNavigationShortcut,
} from '@/application/keyboard-shortcuts';
import { RankedSearchStatus } from '@/features/combat/ranked-search-status';
import { FocusModeReader } from './focus-mode';
import type { FocusModeState } from './focus-mode';
import { AccountMenu } from './account-menu';
import { ConnectivityStatus } from './connectivity-status';
import { NotificationCenter } from './notification-center';
import { useAuth } from './providers';
import { useFeedbackPreferences } from './feedback-preferences';
import { eligibleHapticControl, playKeyboardHaptic } from '@/application/keyboard-feedback';

const primary = directNavigationShortcuts.filter((shortcut) => shortcut.href !== null);
const menuShortcut = directNavigationShortcuts.find((shortcut) => shortcut.id === 'menu');

/*
 * V7-09. The shell footer's hint is derived from the same shortcut registry the
 * toolbar, the Help table and the generated keyboard manuals read, so it cannot drift
 * out of step with the keys that actually work. It restates existing shortcuts and
 * adds no destinations: the footer is a bottom edge for the page, not a second
 * navigation surface.
 */
const firstPrimaryShortcut = primary.at(0);
const lastPrimaryShortcut = primary.at(-1);
const lastPrimaryKey = lastPrimaryShortcut?.keys.split(' ').at(-1);

const footerHint = [
  firstPrimaryShortcut && lastPrimaryKey && primary.length > 1
    ? `${firstPrimaryShortcut.keys}…${lastPrimaryKey} navigates`
    : null,
  menuShortcut ? `${menuShortcut.keys} opens the menu` : null,
]
  .filter(Boolean)
  .join('  ·  ');

const secondary = [
  { href: '/play', label: 'All game modes' },
  { href: '/leaderboards', label: 'Leaderboards' },
  { href: '/players', label: 'Players' },
  { href: '/history', label: 'History' },
  { href: '/words', label: 'Words' },
  { href: '/stats', label: 'Stats' },
  { href: '/marketplace', label: 'Marketplace' },
  { href: '/settings', label: 'Settings' },
  { href: '/help', label: 'Help' },
  { href: '/methodology', label: 'Methodology' },
  { href: '/about', label: 'About' },
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
  const router = useRouter();
  const auth = useAuth();
  const feedback = useFeedbackPreferences();
  const touchedControl = useRef<HTMLElement | null>(null);
  const [moreOpenedOn, setMoreOpenedOn] = useState<string | null>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  const mobileMoreButton = useRef<HTMLButtonElement>(null);
  const morePanel = useRef<HTMLDivElement>(null);
  const chrome = useRef<HTMLElement>(null);

  const previousPathname = useRef(pathname);
  const [routeAnnouncement, setRouteAnnouncement] = useState('');
  /*
   * v9-R4. Focus Mode arrives from a leaf, not from a `useSearchParams()` call here.
   *
   * That single call was forcing every route in the app to client-render, so the server
   * sent a skeleton for all of them. `FocusModeReader` reads the flag under its own
   * Suspense boundary and reports it up; everything below is unchanged, and the shell now
   * renders on the server.
   *
   * It starts false, which is what the server assumes. A cold load of a Focus Mode link
   * therefore paints the normal chrome for one frame.
   */
  const [focusState, setFocusState] = useState<FocusModeState>({
    focus: false,
    focusHref: '',
    exitFocusHref: '',
  });
  const focus = focusState.focus;
  const gameSurface = pathname.includes('/play/solo/') || pathname.includes('/combat/match/');

  /*
   * v8-A3-redux. Publish where the header actually ends.
   *
   * Every dropdown is `position: fixed` pinned to a hard-coded offset — 3.1rem, 3.4rem,
   * 5.6rem, 7.3rem, 2.95rem depending on width and surface — each one a guess at the
   * header's height. At phone width the guess clears the header by 3.6 pixels, which is
   * not a margin, it is a coincidence.
   *
   * Firefox for Android's Accessibility font setting is a TEXT-ONLY zoom: it scales
   * type but not `rem` lengths. At 1.5x the toolbar wraps and grows to 145.7px while the
   * panel stays pinned at 134.4px, so the panel paints on top of the header — measured,
   * in Gecko. Desktop Gecko has no equivalent setting, which is why every test and every
   * check on this machine said the layout was fine.
   *
   * Measuring removes the guess. The panels clamp against this value, so a header that
   * grows for any reason — text zoom, a wrapped toolbar, a longer route name, a larger
   * default font — pushes them down instead of being covered by them.
   */
  useEffect(() => {
    const header = chrome.current;
    const root = document.documentElement;
    if (!header) {
      root.style.removeProperty('--chrome-bottom');
      return;
    }
    const publish = () => {
      const bottom = header.getBoundingClientRect().bottom;
      root.style.setProperty('--chrome-bottom', `${Math.max(0, Math.round(bottom))}px`);
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(header);
    window.addEventListener('resize', publish);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', publish);
      root.style.removeProperty('--chrome-bottom');
    };
  }, []);
  const moreOpen = moreOpenedOn === pathname;
  /*
   * Reported by the reader, which is the only place the query string is known. The
   * pathname-only forms are the pre-hydration fallback and nothing more: both links live
   * behind a menu or a rail, so they are never pressed before the reader has run.
   */
  const focusHref = (focusState.focusHref || `${pathname}?focus=1`) as Route;
  const exitFocusHref = (focusState.exitFocusHref || pathname) as Route;

  const handleFocusChange = useCallback((next: FocusModeState) => setFocusState(next), []);

  const rememberTouchControl = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.nativeEvent.isTrusted || event.pointerType !== 'touch') {
      touchedControl.current = null;
      return;
    }
    const control = eligibleHapticControl(event.target);
    touchedControl.current = control;
  };

  const confirmTouchControl = (event: ReactMouseEvent<HTMLDivElement>) => {
    const remembered = touchedControl.current;
    touchedControl.current = null;
    if (
      !remembered ||
      !event.nativeEvent.isTrusted ||
      event.defaultPrevented ||
      eligibleHapticControl(event.target) !== remembered
    ) {
      return;
    }
    playKeyboardHaptic({
      enabled: feedback.settings.hapticsEnabled,
      pointerType: 'touch',
      reducedEffects: feedback.settings.reducedEffects,
    });
  };

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      const shortcut = matchDirectNavigationShortcut(event);
      if (!shortcut || isEditableShortcutTarget(event.target) || hasActiveModal()) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (shortcut.id === 'menu') {
        setMoreOpenedOn((current) => (current === pathname ? null : pathname));
        return;
      }
      if (shortcut.href) {
        setMoreOpenedOn(null);
        router.push(shortcut.href as Route);
      }
    };
    window.addEventListener('keydown', onShortcut, { capture: true });
    return () => window.removeEventListener('keydown', onShortcut, { capture: true });
  }, [pathname, router]);

  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    setRouteAnnouncement(routeContext(pathname));
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('#main-content')?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

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
      onPointerDownCapture={rememberTouchControl}
      onClick={confirmTouchControl}
    >
      {/*
        Under its own boundary so its `useSearchParams()` cannot reach the rest of the tree.
        It renders nothing; it only reports.
      */}
      <Suspense fallback={null}>
        <FocusModeReader onChange={handleFocusChange} />
      </Suspense>
      {!focus && (
        <header className="global-chrome" ref={chrome}>
          <div className="app-toolbar">
            <Link className="wordmark" href="/" aria-label="Amordle home">
              <span aria-hidden="true">❯</span> amordle
            </Link>
            <div className="toolbar-context" aria-label="Current location">
              <span title={routeContext(pathname)}>{routeContext(pathname)}</span>
              <span className="context-ready">ready</span>
            </div>
            <nav className="desktop-nav" aria-label="Primary">
              {primary.map((item) => (
                <Link
                  key={item.href}
                  href={item.href as Route}
                  aria-current={isCurrent(pathname, item.href) ? 'page' : undefined}
                  aria-keyshortcuts={item.ariaKeyShortcuts}
                >
                  <span aria-hidden="true" className="nav-marker">
                    {isCurrent(pathname, item.href) ? '❯' : ' '}
                  </span>
                  {item.label.toLowerCase()}
                  <kbd>[{item.code.replace('Digit', '')}]</kbd>
                </Link>
              ))}
            </nav>
            <div className="topbar-tools">
              <NotificationCenter />
              <AccountMenu />
              <div className="more-menu">
                <button
                  ref={moreButton}
                  type="button"
                  aria-label="More navigation"
                  aria-haspopup="menu"
                  aria-expanded={moreOpen}
                  aria-controls="more-navigation"
                  aria-keyshortcuts={menuShortcut?.ariaKeyShortcuts}
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
                      <span>destinations</span>
                    </div>
                    {gameSurface && (
                      <Link href={focusHref} role="menuitem" onClick={() => setMoreOpenedOn(null)}>
                        <span aria-hidden="true">›</span> Enter Focus Mode
                      </Link>
                    )}
                    {secondary.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href as Route}
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
                    <div className="menu-footer" aria-hidden="true" />
                  </div>
                )}
              </div>
            </div>
          </div>
          <nav className="mobile-route-rail" aria-label="Primary">
            {primary.slice(0, 4).map((item) => (
              <Link
                key={item.href}
                href={item.href as Route}
                aria-current={isCurrent(pathname, item.href) ? 'page' : undefined}
                aria-keyshortcuts={item.ariaKeyShortcuts}
              >
                <span aria-hidden="true">[{item.code.replace('Digit', '')}]</span>{' '}
                {item.label.toLowerCase()}
              </Link>
            ))}
            <button
              ref={mobileMoreButton}
              type="button"
              aria-label="More navigation"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              aria-controls="more-navigation"
              aria-keyshortcuts={menuShortcut?.ariaKeyShortcuts}
              onClick={() => setMoreOpenedOn(moreOpen ? null : pathname)}
            >
              [m] menu
            </button>
          </nav>
        </header>
      )}
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {routeAnnouncement}
      </span>
      {focus && (
        <div className="focus-utility-rail" aria-label="Focus Mode controls">
          <Link className="focus-exit" href={exitFocusHref}>
            Exit Focus Mode
          </Link>
          <NotificationCenter />
          <AccountMenu />
        </div>
      )}
      {/*
        V7-09. Short routes previously ran out of content and left several hundred
        pixels of empty page with no closing edge, which reads as an unfinished
        screen rather than a quiet one. This closes the composition. It is omitted
        during play and in Focus Mode, where the shell is deliberately contained to
        the dynamic viewport and a third row would break that contract.
      */}
      {!focus && !gameSurface && (
        <footer className="app-footer">
          <span aria-hidden="true">❯ amordle</span>
          <span className="app-footer-hint">{footerHint}</span>
          {/*
           * B3. Names the build in the page itself, so a screenshot of a layout problem
           * says which release produced it. The stale-shell mechanism this pass closed
           * cost a full trace precisely because that could not be read off the picture.
           */}
          <span className="app-footer-build" data-build={process.env.NEXT_PUBLIC_BUILD_ID || 'dev'}>
            build {process.env.NEXT_PUBLIC_BUILD_ID || 'dev'}
          </span>
        </footer>
      )}
      {/*
        v8-B2. Both floating strips share one stack, so the ranked search and an
        offline warning cannot land on top of each other. Each was independently
        fixed to the bottom-right corner before, which was fine only because they
        could never appear together — and a background search that survives
        navigation now can appear while the connection drops.

        The stack itself ignores pointer events; its children take them back, so the
        empty column never swallows a click on the page beneath it.
      */}
      <div className="status-stack">
        <RankedSearchStatus />
        <ConnectivityStatus />
      </div>
    </div>
  );
}
