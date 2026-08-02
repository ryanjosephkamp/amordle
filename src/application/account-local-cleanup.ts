'use client';

import { clearAvatarCleanupQueue } from '@/adapters/avatar-storage';
import {
  deleteEnvelope,
  deleteOwnerEnvelopes,
  deleteOwnerEnvelopesByDomainPrefix,
} from '@/adapters/indexeddb';
import {
  removeCombatAttentionProjection,
  removeRankedDailyQueueIntent,
  removeRankedPracticeQueueIntent,
} from '@/adapters/session-combat';
import { removeSoloPendingCompletions } from '@/application/completion-outbox';

export async function clearDeletedAccountLocalState(userId: string): Promise<void> {
  await deleteOwnerEnvelopes(`account:${userId}`);
  removeRankedPracticeQueueIntent(userId);
  removeRankedDailyQueueIntent(userId);
  removeCombatAttentionProjection(userId);
  clearAvatarCleanupQueue(userId);
}

export async function clearSoloAccountLocalState(userId: string): Promise<void> {
  const owner = `account:${userId}`;
  await Promise.all([
    deleteOwnerEnvelopesByDomainPrefix(owner, 'solo:'),
    deleteEnvelope(owner, 'solo:index:v2'),
    removeSoloPendingCompletions(userId),
  ]);
}

export function clearCompetitiveAccountLocalState(userId: string): void {
  removeRankedPracticeQueueIntent(userId);
  removeRankedDailyQueueIntent(userId);
  removeCombatAttentionProjection(userId);
}
