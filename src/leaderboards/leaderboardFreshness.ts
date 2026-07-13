import type { MultiplayerCompetitiveState } from '../multiplayer'

export function getPublicRankedLeaderboardFreshnessKey(state: MultiplayerCompetitiveState | undefined): string {
  if (!state) {
    return 'no-competitive-state'
  }

  const transactionDigest = state.rating.transactions
    .map((transaction) => [
      transaction.bucket,
      transaction.createdAt,
      transaction.oldRating,
      transaction.newRating,
      transaction.outcome,
    ].join(':'))
    .sort()
    .join('|')
  const profileDigest = state.rating.profiles
    .map((profile) => [
      profile.bucket,
      profile.gamesPlayed,
      profile.wins,
      profile.losses,
      profile.draws,
      profile.provisional ? 'provisional' : 'established',
      profile.rating,
      profile.updatedAt,
    ].join(':'))
    .sort()
    .join('|')

  return [
    `transactions=${state.rating.transactions.length}`,
    transactionDigest || 'no-transactions',
    `profiles=${state.rating.profiles.length}`,
    profileDigest || 'no-profiles',
  ].join('::')
}
