'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const routes: Record<string, string> = {
  home: '/',
  play: '/play',
  solo: '/play/solo',
  calendar: '/calendar',
  daily: '/calendar',
  combat: '/combat',
  multiplayer: '/combat',
  'combat-practice': '/combat/practice',
  'multiplayer-practice': '/combat/practice',
  'combat-daily': '/combat/daily',
  'multiplayer-daily': '/combat/daily',
  active: '/combat/active',
  lobby: '/combat/lobby',
  live: '/combat/live',
  marketplace: '/marketplace',
  market: '/marketplace',
  history: '/history',
  leaderboards: '/leaderboards',
  leaderboard: '/leaderboards',
  words: '/words',
  profile: '/profile',
  stats: '/stats',
  settings: '/settings',
  help: '/help',
  feedback: '/feedback',
  about: '/about',
  auth: '/auth',
  admin: '/admin',
};

export function LegacyRouteBridge() {
  const router = useRouter();
  useEffect(() => {
    const url = new URL(window.location.href);
    const raw = (
      url.searchParams.get('view') ??
      url.searchParams.get('route') ??
      url.hash.replace(/^#\/?/, '')
    )
      .trim()
      .toLowerCase();
    if (!raw) return;

    const matchId =
      url.searchParams.get('matchId') ??
      url.searchParams.get('gameId') ??
      (raw === 'match' ? url.searchParams.get('id') : null);
    const resultId =
      url.searchParams.get('resultId') ?? (raw === 'result' ? url.searchParams.get('id') : null);
    const profileId =
      url.searchParams.get('publicProfileId') ??
      (raw === 'player' ? url.searchParams.get('id') : null);
    const localDate = url.searchParams.get('date');
    const mode = url.searchParams.get('mode');
    let destination = matchId
      ? `/combat/match/${encodeURIComponent(matchId)}`
      : resultId
        ? `/combat/results/${encodeURIComponent(resultId)}`
        : profileId
          ? `/players/${encodeURIComponent(profileId)}`
          : routes[raw];
    if (
      raw === 'daily-game' &&
      localDate &&
      /^\d{4}-\d{2}-\d{2}$/.test(localDate) &&
      (mode === 'og' || mode === 'go')
    ) {
      destination = `/play/solo/daily/${localDate}/${mode}`;
    }
    if (raw === 'practice-game' && (mode === 'og' || mode === 'go')) {
      const allowed = new URLSearchParams();
      for (const key of ['length', 'difficulty', 'count', 'hard', 'generation']) {
        const value = url.searchParams.get(key);
        if (value !== null) allowed.set(key, value);
      }
      destination = `/play/solo/practice/${mode}${allowed.size ? `?${allowed.toString()}` : ''}`;
    }
    if (!destination) return;
    router.replace(destination as Route);
  }, [router]);
  return null;
}
