import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import {
  applyCompletionReward,
  initialProgressionState,
  unlockPastDaily,
  type ProgressionState,
} from '../domain/progression';
import { createVersionedLocalRepository } from '../persistence/local-repository';
import { AccountRepository } from '../services/account-repository';
import type { Json } from '../types/database';
import { useAuth } from './auth-context';
import { PlayerStateContext, type PlayerStateContextValue } from './player-state-context';

const progressionSchema = z.object({
  xp: z.number().int().nonnegative(),
  coins: z.number().int().nonnegative(),
  rewardedGameIds: z.array(z.string().min(1)),
  unlockedDailies: z.array(z.string().regex(/^(og|go):\d{4}-\d{2}-\d{2}$/)),
  appliedUnlockIds: z.array(z.string().min(1)),
});

const progressionRepository = createVersionedLocalRepository<ProgressionState>({
  schema: progressionSchema,
  storage: () => {
    try {
      return window.localStorage;
    } catch {
      return undefined;
    }
  },
  keyPrefix: 'amordle:progression',
});

export function PlayerStateProvider({ children }: { children: ReactNode }) {
  const { client, identity, user } = useAuth();
  const accountRepository = useMemo(
    () => (client ? new AccountRepository(client) : null),
    [client],
  );
  const cloud = useQuery({
    queryKey: ['progression-cloud', user?.id],
    enabled: Boolean(accountRepository && user),
    queryFn: () => accountRepository!.loadProgress(user!.id),
    staleTime: 10_000,
    retry: 1,
  });
  const loaded = useMemo(() => progressionRepository.load(identity), [identity]);
  const [stateByOwner, setStateByOwner] = useState(() => ({
    owner: progressionRepository.storageKey(identity),
    state: loaded.status === 'ok' ? loaded.envelope.payload : initialProgressionState(),
    revision: loaded.status === 'ok' ? loaded.envelope.revision : 0,
  }));
  const owner = progressionRepository.storageKey(identity);
  const cloudProgression = progressionSchema.safeParse(cloud.data);
  const localIsEmpty =
    loaded.status !== 'ok' ||
    (loaded.envelope.payload.xp === 0 &&
      loaded.envelope.payload.coins === 0 &&
      loaded.envelope.payload.rewardedGameIds.length === 0 &&
      loaded.envelope.payload.unlockedDailies.length === 0);
  const initialForOwner =
    localIsEmpty && cloudProgression.success
      ? (cloudProgression.data as ProgressionState)
      : loaded.status === 'ok'
        ? loaded.envelope.payload
        : initialProgressionState();
  const loadedRevision = loaded.status === 'ok' ? loaded.envelope.revision : 0;
  const active =
    stateByOwner.owner === owner
      ? stateByOwner
      : {
          owner,
          state: initialForOwner,
          revision: loadedRevision,
        };
  const current =
    stateByOwner.owner === owner &&
    stateByOwner.revision === loadedRevision &&
    localIsEmpty &&
    cloudProgression.success
      ? (cloudProgression.data as ProgressionState)
      : active.state;

  const persist = useCallback(
    (next: ProgressionState): boolean => {
      const result = progressionRepository.save(identity, next, {
        expectedRevision: active.revision,
        replaceCorrupt: true,
      });
      if (!result.ok) return false;
      setStateByOwner({ owner, state: next, revision: result.envelope.revision });
      if (accountRepository && user) {
        void accountRepository.saveProgress(
          user.id,
          next as unknown as Json,
          result.envelope.updatedAt,
        );
      }
      return true;
    },
    [accountRepository, active.revision, identity, owner, user],
  );

  const value = useMemo<PlayerStateContextValue>(
    () => ({
      progression: current,
      persistenceAvailable: loaded.status !== 'unavailable',
      reward(completion) {
        const result = applyCompletionReward(current, completion);
        if (result.applied) persist(result.state);
      },
      unlockDaily(mode, dateKey, todayKey) {
        const operationId = `past-daily:${mode}:${dateKey}`;
        const result = unlockPastDaily({ state: current, operationId, mode, dateKey, todayKey });
        if (!result.ok) return result.code === 'insufficient_coins' ? 'insufficient' : 'invalid';
        if (!result.applied) return 'already';
        return persist(result.state) ? 'unlocked' : 'invalid';
      },
    }),
    [current, loaded.status, persist],
  );

  return <PlayerStateContext.Provider value={value}>{children}</PlayerStateContext.Provider>;
}
