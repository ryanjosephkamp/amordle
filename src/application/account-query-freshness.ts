import type { QueryClient } from '@tanstack/react-query';
import {
  accountEconomyNamespace,
  completionOutboxQueryKey,
  economyQueryKey,
  historyQueryKey,
  progressQueryKey,
  ratingsQueryKey,
} from './query-keys';

export async function invalidateAccountProjections(
  queryClient: QueryClient,
  userId: string,
  options: { includeRanked?: boolean } = {},
) {
  const work = [
    queryClient.invalidateQueries({ queryKey: completionOutboxQueryKey(userId) }),
    queryClient.invalidateQueries({ queryKey: historyQueryKey(userId) }),
    queryClient.invalidateQueries({ queryKey: progressQueryKey(userId) }),
    queryClient.invalidateQueries({ queryKey: economyQueryKey(accountEconomyNamespace(userId)) }),
    queryClient.invalidateQueries({ queryKey: ['combat', 'home-attention', userId] }),
    queryClient.invalidateQueries({ queryKey: ['combat', 'active', userId] }),
  ];
  if (options.includeRanked) {
    work.push(
      queryClient.invalidateQueries({ queryKey: ratingsQueryKey(userId) }),
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] }),
      queryClient.invalidateQueries({ queryKey: ['site-stats'] }),
      queryClient.invalidateQueries({ queryKey: ['player-directory'] }),
    );
  }
  await Promise.all(work);
}

export function isAccountProjectionRoute(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname === '/history' ||
    pathname === '/stats' ||
    pathname === '/leaderboards' ||
    pathname === '/play/solo' ||
    pathname === '/combat/active'
  );
}
