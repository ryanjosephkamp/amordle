'use client';

import { clearAvatarCleanupQueue } from '@/adapters/avatar-storage';
import { removeRankedQueueIntent } from '@/adapters/durable-combat';
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
  /*
   * v8-B1. The ranked search intent is durable now, so a competitive reset has to
   * reach IndexedDB too — otherwise the app-wide watcher keeps polling a request the
   * player just asked to be rid of. Kept fire-and-forget so this stays synchronous
   * for its one caller, and harmless if the store is unavailable.
   */
  void removeRankedQueueIntent(userId).catch(() => undefined);
}
