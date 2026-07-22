import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useNavigate } from 'react-router';
import { Button } from '../components/Button';
import { Icon, type IconName } from '../components/Icon';
import { useNotificationProjection } from '../features/supporting/use-notification-projection';
import { useAuth } from './auth-context';

const primaryNav: Array<{ to: string; label: string; icon: IconName; end?: boolean }> = [
  { to: '/play', label: 'Play', icon: 'play' },
  { to: '/calendar', label: 'Daily', icon: 'daily' },
  { to: '/combat', label: 'Combat', icon: 'combat' },
  { to: '/stats', label: 'Stats', icon: 'stats' },
  { to: '/history', label: 'History', icon: 'history' },
];

const moreNav = [
  ['/marketplace', 'Marketplace'],
  ['/leaderboards', 'Leaderboards'],
  ['/word-explorer', 'Word Explorer'],
  ['/definitions', 'Definitions'],
  ['/profile', 'Profile'],
  ['/settings', 'Settings'],
  ['/help', 'Help'],
  ['/feedback', 'Feedback'],
  ['/about', 'About'],
] as const;

function Brand() {
  return (
    <Link className="brand" to="/" aria-label="amordle home">
      amordle
    </Link>
  );
}

function HeaderAccount({
  onOpen,
  authenticated,
  loading,
}: {
  onOpen: () => void;
  authenticated: boolean;
  loading: boolean;
}) {
  return (
    <button
      className="account-button"
      type="button"
      onClick={onOpen}
      aria-label={authenticated ? 'Open account menu' : 'Sign in or open account menu'}
    >
      <span className="avatar">{authenticated ? 'A' : 'G'}</span>
      <span>{loading ? 'Loading' : authenticated ? 'Account' : 'Guest'}</span>
      <span className="presence" aria-hidden="true" />
    </button>
  );
}

function DesktopRail() {
  const location = useLocation();
  const moreActive = moreNav.some(([path]) => location.pathname.startsWith(path));
  return (
    <aside className="desktop-rail" aria-label="Primary">
      <nav>
        {primaryNav.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => (isActive ? 'rail-link is-active' : 'rail-link')}
          >
            <Icon name={icon} />
            <span>{label}</span>
          </NavLink>
        ))}
        <details className={`rail-more ${moreActive ? 'is-active' : ''}`} open={moreActive}>
          <summary>
            <Icon name="more" />
            <span>More</span>
            <span aria-hidden="true">⌄</span>
          </summary>
          <div>
            {moreNav.map(([to, label]) => (
              <NavLink key={to} to={to}>
                {label}
              </NavLink>
            ))}
          </div>
        </details>
      </nav>
    </aside>
  );
}

function MobileDock({ onMore }: { onMore: () => void }) {
  const location = useLocation();
  const moreActive = moreNav.some(([path]) => location.pathname.startsWith(path));
  const items = primaryNav.slice(0, 3);
  return (
    <nav className="mobile-dock" aria-label="Primary">
      {items.map(({ to, label, icon }) => (
        <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'is-active' : '')}>
          <Icon name={icon} />
          <span>{label}</span>
        </NavLink>
      ))}
      <button
        type="button"
        className={moreActive ? 'is-active' : ''}
        onClick={onMore}
        aria-label="Open more destinations"
      >
        <Icon name="more" />
        <span>More</span>
      </button>
    </nav>
  );
}

export function AppShell() {
  const [accountOpenAt, setAccountOpenAt] = useState<string | null>(null);
  const [moreOpenAt, setMoreOpenAt] = useState<string | null>(null);
  const [notificationsOpenAt, setNotificationsOpenAt] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const focus = new URLSearchParams(location.search).get('focus') === '1';
  const { service: authService, status: authStatus, user, identity } = useAuth();
  const authenticated = authStatus === 'authenticated';
  const accountOpen = accountOpenAt === location.pathname;
  const moreOpen = moreOpenAt === location.pathname;
  const notificationsOpen = notificationsOpenAt === location.pathname;
  const notifications = useNotificationProjection(identity, authStatus !== 'loading');

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (notificationsOpen) setNotificationsOpenAt(null);
        else if (moreOpen) setMoreOpenAt(null);
        else if (accountOpen) setAccountOpenAt(null);
        else if (focus) {
          const search = new URLSearchParams(location.search);
          search.delete('focus');
          navigate(`${location.pathname}${search.size ? `?${search}` : ''}`, { replace: true });
        }
      }
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [
    accountOpen,
    focus,
    location.pathname,
    location.search,
    moreOpen,
    navigate,
    notificationsOpen,
  ]);

  return (
    <div className={`app-shell ${focus ? 'app-shell--focus' : ''}`}>
      <div className="atmosphere" aria-hidden="true" />
      <header className="topbar">
        <Brand />
        {focus ? (
          <Button className="focus-exit" onClick={() => navigate(location.pathname)}>
            <Icon name="focus" /> Exit focus <kbd>Esc</kbd>
          </Button>
        ) : (
          <nav className="topbar__center" aria-label="Workspace">
            <NavLink to="/play">Solo</NavLink>
            <NavLink to="/combat">Combat</NavLink>
          </nav>
        )}
        <div className="topbar__actions">
          <Link className="top-action" to="/help">
            <Icon name="help" />
            <span>Help</span>
          </Link>
          <Link className="top-action" to="/settings">
            <Icon name="settings" />
            <span>Settings</span>
          </Link>
          <button
            className="top-action notification-button"
            type="button"
            aria-label={`Notifications${notifications.unreadCount ? `, ${notifications.unreadCount} unread` : ''}`}
            aria-expanded={notificationsOpen}
            onClick={() => {
              setAccountOpenAt(null);
              setMoreOpenAt(null);
              setNotificationsOpenAt((value) => (value ? null : location.pathname));
            }}
          >
            <Icon name="bell" />
            <span>Alerts</span>
            {notifications.unreadCount > 0 ? (
              <span className="notification-count" aria-hidden="true">
                {notifications.unreadCount}
              </span>
            ) : null}
          </button>
          <HeaderAccount
            onOpen={() => {
              setMoreOpenAt(null);
              setNotificationsOpenAt(null);
              setAccountOpenAt((value) => (value ? null : location.pathname));
            }}
            authenticated={authenticated}
            loading={authStatus === 'loading'}
          />
        </div>
      </header>
      {!focus ? <DesktopRail /> : null}
      <main id="main-content" className="main-content" tabIndex={-1}>
        <Outlet />
      </main>
      {!focus ? (
        <MobileDock
          onMore={() => {
            setAccountOpenAt(null);
            setNotificationsOpenAt(null);
            setMoreOpenAt(location.pathname);
          }}
        />
      ) : null}

      {accountOpen ? (
        <div
          className="popover-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setAccountOpenAt(null);
          }}
        >
          <div
            className="popover account-popover"
            role="dialog"
            aria-label={authenticated ? 'Account menu' : 'Guest account'}
          >
            <Button
              className="popover__close"
              type="button"
              onClick={() => setAccountOpenAt(null)}
              aria-label="Close account menu"
            >
              <Icon name="close" />
            </Button>
            <span className="avatar avatar--large">{authenticated ? 'A' : 'G'}</span>
            <h2>{authenticated ? 'Signed-in account' : 'Guest play'}</h2>
            <p>
              {authenticated
                ? `Account session verified${user?.email ? ` for ${user.email}` : ''}. Account data remains private.`
                : 'Solo progress stays in the guest namespace on this device. Sign in to sync and enter authenticated COMBAT.'}
            </p>
            {authenticated ? (
              <Button
                type="button"
                tone="primary"
                onClick={() => {
                  void authService?.signOut().finally(() => setAccountOpenAt(null));
                }}
              >
                Sign out
              </Button>
            ) : (
              <Button
                type="button"
                tone="primary"
                onClick={() =>
                  navigate(
                    `/auth?returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`,
                  )
                }
              >
                Sign in
              </Button>
            )}
            <Button
              type="button"
              onClick={() => {
                setAccountOpenAt(null);
                navigate('/profile');
              }}
            >
              Open profile
            </Button>
          </div>
        </div>
      ) : null}

      {notificationsOpen ? (
        <div
          className="popover-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setNotificationsOpenAt(null);
          }}
        >
          <section
            className="popover notification-popover"
            role="dialog"
            aria-modal="true"
            aria-label="Notifications"
          >
            <header>
              <div>
                <p className="eyebrow">Source-derived events</p>
                <h2>Notifications</h2>
              </div>
              <button
                className="popover__close"
                type="button"
                onClick={() => setNotificationsOpenAt(null)}
                aria-label="Close notifications"
              >
                <Icon name="close" />
              </button>
            </header>
            {notifications.visible.length > 0 ? (
              <>
                <div className="notification-list" aria-live="polite">
                  {notifications.visible.map((event) => {
                    const unread = !notifications.read.has(event.id);
                    return (
                      <article
                        className={`notification-row ${unread ? 'is-unread' : ''}`}
                        key={event.id}
                      >
                        <div>
                          <strong>{event.title}</strong>
                          <p>{event.body}</p>
                          <small>{new Date(event.createdAt).toLocaleString()}</small>
                        </div>
                        <div className="notification-actions">
                          <Button
                            tone="primary"
                            onClick={() => {
                              notifications.markRead(event.id);
                              setNotificationsOpenAt(null);
                              navigate(event.target);
                            }}
                          >
                            Open
                          </Button>
                          {unread ? (
                            <Button onClick={() => notifications.markRead(event.id)}>
                              Mark read
                            </Button>
                          ) : null}
                          <Button tone="quiet" onClick={() => notifications.hide(event.id)}>
                            Hide
                          </Button>
                        </div>
                      </article>
                    );
                  })}
                </div>
                <Button onClick={() => notifications.markAllRead()}>Mark all read</Button>
              </>
            ) : (
              <p className="empty-state">No source-derived notifications are available.</p>
            )}
          </section>
        </div>
      ) : null}

      {moreOpen ? (
        <div
          className="sheet-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setMoreOpenAt(null);
          }}
        >
          <section
            className="mobile-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="More destinations"
          >
            <header>
              <h2>More</h2>
              <button
                type="button"
                onClick={() => setMoreOpenAt(null)}
                aria-label="Close destinations"
              >
                <Icon name="close" />
              </button>
            </header>
            <nav>
              {moreNav.map(([to, label]) => (
                <NavLink key={to} to={to}>
                  {label}
                  <span aria-hidden="true">›</span>
                </NavLink>
              ))}
            </nav>
          </section>
        </div>
      ) : null}
      <ScrollRestoration />
    </div>
  );
}

export function RouteError() {
  const navigate = useNavigate();
  return (
    <section className="route-error" aria-labelledby="route-error-title">
      <div className="route-error__mark" aria-hidden="true">
        !
      </div>
      <p className="eyebrow">Recovery ledger</p>
      <h1 id="route-error-title">Route unavailable</h1>
      <p>
        The interface chunk was unavailable. Retry returns to Home while preserving saved game
        progress.
      </p>
      <Button tone="primary" onClick={() => navigate('/')}>
        Retry
      </Button>
      <p className="continuity-note">Local Solo / Practice remains available.</p>
    </section>
  );
}

export function RouteLoading() {
  return (
    <main className="route-error" aria-busy="true">
      <p className="eyebrow">Amordle</p>
      <h1>Loading route</h1>
      <p>Restoring the current workspace…</p>
    </main>
  );
}
