import { createBrowserRouter } from 'react-router';
import { AppShell, RouteError, RouteLoading } from './AppShell';
import { LegacyRedirect } from './LegacyRedirect';

const redirect = (to: string) => ({ Component: () => <LegacyRedirect to={to} /> });

export const router = createBrowserRouter([
  {
    path: '/',
    Component: AppShell,
    ErrorBoundary: RouteError,
    HydrateFallback: RouteLoading,
    children: [
      {
        index: true,
        lazy: async () => ({ Component: (await import('../features/home/HomePage')).HomePage }),
      },
      {
        path: 'play',
        lazy: async () => ({ Component: (await import('../features/play/PlayPage')).PlayPage }),
      },
      {
        path: 'play/:scope/:mode',
        lazy: async () => ({
          Component: (await import('../features/play/SoloGamePage')).SoloGamePage,
        }),
      },
      {
        path: 'calendar',
        lazy: async () => ({
          Component: (await import('../features/calendar/CalendarPage')).CalendarPage,
        }),
      },
      {
        path: 'combat/match/:matchId/result',
        lazy: async () => ({
          Component: (await import('../features/combat/CombatMatchPage')).CombatResultPage,
        }),
      },
      {
        path: 'combat/match/:matchId',
        lazy: async () => ({
          Component: (await import('../features/combat/CombatMatchPage')).CombatMatchPage,
        }),
      },
      {
        path: 'combat/live/:matchId',
        lazy: async () => ({
          Component: (await import('../features/combat/CombatMatchPage')).LiveMatchPage,
        }),
      },
      {
        path: 'combat/*',
        lazy: async () => ({
          Component: (await import('../features/combat/CombatPage')).CombatPage,
        }),
      },
      {
        path: 'marketplace',
        lazy: async () => ({
          Component: (await import('../features/more/MorePages')).MarketplacePage,
        }),
      },
      {
        path: 'history',
        lazy: async () => ({ Component: (await import('../features/more/MorePages')).HistoryPage }),
      },
      {
        path: 'stats',
        lazy: async () => ({ Component: (await import('../features/more/MorePages')).StatsPage }),
      },
      {
        path: 'leaderboards',
        lazy: async () => ({
          Component: (await import('../features/more/MorePages')).LeaderboardsPage,
        }),
      },
      {
        path: 'word-explorer',
        lazy: async () => ({
          Component: (await import('../features/more/MorePages')).WordExplorerPage,
        }),
      },
      {
        path: 'definitions',
        lazy: async () => {
          const module = await import('../features/more/MorePages');
          return { Component: () => <module.WordExplorerPage definitionOnly /> };
        },
      },
      {
        path: 'profile',
        lazy: async () => ({ Component: (await import('../features/more/MorePages')).ProfilePage }),
      },
      {
        path: 'players/:publicProfileId',
        lazy: async () => {
          const module = await import('../features/more/MorePages');
          return { Component: () => <module.ProfilePage publicView /> };
        },
      },
      {
        path: 'settings',
        lazy: async () => ({
          Component: (await import('../features/more/MorePages')).SettingsPage,
        }),
      },
      {
        path: 'help',
        lazy: async () => ({ Component: (await import('../features/more/MorePages')).HelpPage }),
      },
      {
        path: 'feedback',
        lazy: async () => ({
          Component: (await import('../features/more/MorePages')).FeedbackPage,
        }),
      },
      {
        path: 'about',
        lazy: async () => ({ Component: (await import('../features/more/MorePages')).AboutPage }),
      },
      {
        path: 'auth',
        lazy: async () => ({ Component: (await import('../features/more/MorePages')).AuthPage }),
      },
      {
        path: 'auth/callback',
        lazy: async () => ({ Component: (await import('../features/more/MorePages')).AuthPage }),
      },
      {
        path: 'auth/recovery',
        lazy: async () => ({ Component: (await import('../features/more/MorePages')).AuthPage }),
      },
      {
        path: 'admin',
        lazy: async () => ({ Component: (await import('../features/admin/AdminPage')).AdminPage }),
      },
      { path: 'home', ...redirect('/') },
      { path: 'solo', ...redirect('/play') },
      { path: 'multiplayer', ...redirect('/combat') },
      { path: 'practice', ...redirect('/play/practice/og') },
      { path: 'og-daily', ...redirect('/play/daily/og') },
      { path: 'go-daily', ...redirect('/play/daily/go') },
      { path: 'leaderboard', ...redirect('/leaderboards') },
      {
        path: 'public-profile/:publicProfileId',
        Component: () => <LegacyRedirect to="/players" profile />,
      },
      {
        path: '*',
        lazy: async () => ({
          Component: (await import('../features/system/NotFoundPage')).NotFoundPage,
        }),
      },
    ],
  },
]);
