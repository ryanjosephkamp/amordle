import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import {
  applyEconomyOperation,
  type ConsumableType,
  type EconomyOperation,
  type EconomyState,
} from '../domain/economy';
import {
  applyCompletionReward,
  initialProgressionState,
  promotePastDailyEntitlement,
  purchasePastDailyEntitlement,
  type ProgressionState,
} from '../domain/progression';
import { createVersionedLocalRepository } from '../persistence/local-repository';
import { AccountRepository } from '../services/account-repository';
import { EconomyRepository } from '../services/economy-repository';
import type { Json } from '../types/database';
import { useAuth } from './auth-context';
import { PlayerStateContext, type PlayerStateContextValue } from './player-state-context';

const progressionSchema = z.object({
  xp: z.number().int().nonnegative(),
  coins: z.number().int().nonnegative(),
  rewardedGameIds: z.array(z.string().min(1)),
  unlockedDailies: z.array(z.string().regex(/^(og|go):\d{4}-\d{2}-\d{2}$/)),
  appliedUnlockIds: z.array(z.string().min(1)),
  rewardOperations: z.record(z.string(), z.string()).default({}),
  unlockOperations: z.record(z.string(), z.string()).default({}),
  consumables: z
    .object({
      revealOneLetter: z.number().int().nonnegative(),
      removeIncorrectLetters: z.number().int().nonnegative(),
    })
    .default({ revealOneLetter: 0, removeIncorrectLetters: 0 }),
  economyRevision: z.number().int().nonnegative().default(0),
  economyOperations: z.record(z.string(), z.string()).default({}),
  pendingDailyUnlocks: z.record(z.string(), z.string()).default({}),
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

function parseCloudProgression(value: Json | null | undefined): ProgressionState | undefined {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const nested = progressionSchema.safeParse(value.progression);
    if (nested.success) return nested.data;
  }
  const legacy = progressionSchema.safeParse(value);
  return legacy.success ? legacy.data : undefined;
}

function mergeProgression(
  local: ProgressionState,
  cloud: ProgressionState | undefined,
  economy:
    | {
        coins: number;
        revealOneLetter: number;
        removeIncorrectLetters: number;
        revision: number;
      }
    | undefined,
): ProgressionState {
  const remote = cloud ?? initialProgressionState();
  const unique = (left: readonly string[], right: readonly string[]) => [
    ...new Set([...left, ...right]),
  ];
  const unlockedDailies = unique(local.unlockedDailies, remote.unlockedDailies);
  const pendingDailyUnlocks = {
    ...remote.pendingDailyUnlocks,
    ...local.pendingDailyUnlocks,
  };
  for (const unlockedDaily of unlockedDailies) delete pendingDailyUnlocks[unlockedDaily];
  return {
    ...local,
    xp: Math.max(local.xp, remote.xp),
    coins: economy?.coins ?? (cloud ? remote.coins : local.coins),
    rewardedGameIds: unique(local.rewardedGameIds, remote.rewardedGameIds),
    unlockedDailies,
    appliedUnlockIds: unique(local.appliedUnlockIds, remote.appliedUnlockIds),
    rewardOperations: { ...remote.rewardOperations, ...local.rewardOperations },
    unlockOperations: { ...remote.unlockOperations, ...local.unlockOperations },
    consumables: economy
      ? {
          revealOneLetter: economy.revealOneLetter,
          removeIncorrectLetters: economy.removeIncorrectLetters,
        }
      : (local.consumables ?? remote.consumables),
    economyRevision:
      economy?.revision ?? Math.max(local.economyRevision ?? 0, remote.economyRevision ?? 0),
    economyOperations: { ...remote.economyOperations, ...local.economyOperations },
    pendingDailyUnlocks,
  };
}

export function PlayerStateProvider({ children }: { children: ReactNode }) {
  const { client, identity, user } = useAuth();
  const accountRepository = useMemo(
    () => (client ? new AccountRepository(client) : null),
    [client],
  );
  const economyRepository = useMemo(
    () => (client && user ? new EconomyRepository(client) : null),
    [client, user],
  );
  const [economyPending, setEconomyPending] = useState(false);
  const cloud = useQuery({
    queryKey: ['progression-cloud', user?.id],
    enabled: Boolean(accountRepository && user),
    queryFn: () => accountRepository!.loadProgressSnapshot(user!.id),
    staleTime: 10_000,
    retry: 1,
  });
  const cloudEconomy = useQuery({
    queryKey: ['economy-authority', user?.id],
    enabled: Boolean(economyRepository && user),
    queryFn: () => economyRepository!.get(),
    staleTime: 5_000,
    retry: 1,
  });
  const loaded = useMemo(() => progressionRepository.load(identity), [identity]);
  const [stateByOwner, setStateByOwner] = useState(() => ({
    owner: progressionRepository.storageKey(identity),
    state: loaded.status === 'ok' ? loaded.envelope.payload : initialProgressionState(),
    revision: loaded.status === 'ok' ? loaded.envelope.revision : 0,
  }));
  const owner = progressionRepository.storageKey(identity);
  const cloudProgression = parseCloudProgression(cloud.data?.progress);
  const localForOwner =
    loaded.status === 'ok' ? loaded.envelope.payload : initialProgressionState();
  const initialForOwner = mergeProgression(localForOwner, cloudProgression, cloudEconomy.data);
  const loadedRevision = loaded.status === 'ok' ? loaded.envelope.revision : 0;
  const active =
    stateByOwner.owner === owner
      ? stateByOwner
      : {
          owner,
          state: initialForOwner,
          revision: loadedRevision,
        };
  const current = mergeProgression(active.state, cloudProgression, cloudEconomy.data);

  const persist = useCallback(
    (next: ProgressionState): boolean => {
      const result = progressionRepository.save(identity, next, {
        expectedRevision: active.revision,
        replaceCorrupt: true,
      });
      if (!result.ok) return false;
      setStateByOwner({ owner, state: next, revision: result.envelope.revision });
      if (accountRepository && user) {
        void accountRepository.saveProgression(
          user.id,
          next as unknown as Json,
          result.envelope.updatedAt,
        );
      }
      return true;
    },
    [accountRepository, active.revision, identity, owner, user],
  );

  const economyFrom = useCallback(
    (state: ProgressionState): EconomyState => ({
      coins: state.coins,
      inventory: state.consumables ?? { revealOneLetter: 0, removeIncorrectLetters: 0 },
      revision: state.economyRevision ?? 0,
      operations: state.economyOperations ?? {},
    }),
    [],
  );

  const persistEconomy = useCallback(
    (base: ProgressionState, economy: EconomyState): boolean =>
      persist({
        ...base,
        coins: economy.coins,
        consumables: economy.inventory,
        economyRevision: economy.revision,
        economyOperations: economy.operations,
      }),
    [persist],
  );

  const runEconomy = useCallback(
    async (operation: EconomyOperation) => {
      if (economyPending) return { ok: false, code: 'conflict' } as const;
      setEconomyPending(true);
      try {
        if (economyRepository) {
          const mutation =
            operation.type === 'purchase'
              ? await economyRepository.purchase(operation.consumable, operation.operationId)
              : operation.type === 'consume'
                ? await economyRepository.consume(operation.consumable, operation.operationId)
                : operation.type === 'spend'
                  ? await economyRepository.spend(operation.amount, operation.operationId)
                  : await economyRepository.credit(operation.amount, operation.operationId);
          const next: EconomyState = {
            coins: mutation.coins,
            inventory: {
              revealOneLetter: mutation.revealOneLetter,
              removeIncorrectLetters: mutation.removeIncorrectLetters,
            },
            revision: mutation.revision,
            operations: {
              ...(current.economyOperations ?? {}),
              [operation.operationId]: JSON.stringify(operation),
            },
          };
          return persistEconomy(current, next)
            ? ({ ok: true, applied: mutation.applied } as const)
            : ({ ok: false, code: 'unavailable' } as const);
        }
        const result = applyEconomyOperation(economyFrom(current), operation);
        if (!result.ok) {
          const code =
            result.code === 'insufficient_coins' ||
            result.code === 'insufficient_inventory' ||
            result.code === 'invalid_scope'
              ? result.code
              : 'conflict';
          return { ok: false, code } as const;
        }
        return persistEconomy(current, result.state)
          ? ({ ok: true, applied: result.applied } as const)
          : ({ ok: false, code: 'unavailable' } as const);
      } catch (error) {
        const message = error instanceof Error ? error.message.toLowerCase() : '';
        return {
          ok: false,
          code: message.includes('insufficient coin')
            ? 'insufficient_coins'
            : message.includes('inventory')
              ? 'insufficient_inventory'
              : 'unavailable',
        } as const;
      } finally {
        setEconomyPending(false);
      }
    },
    [current, economyFrom, economyPending, economyRepository, persistEconomy],
  );

  useEffect(() => {
    const snapshot = cloudEconomy.data;
    if (!snapshot || snapshot.revision <= (active.state.economyRevision ?? 0)) return;
    persistEconomy(current, {
      coins: snapshot.coins,
      inventory: {
        revealOneLetter: snapshot.revealOneLetter,
        removeIncorrectLetters: snapshot.removeIncorrectLetters,
      },
      revision: snapshot.revision,
      operations: current.economyOperations ?? {},
    });
  }, [active.state.economyRevision, cloudEconomy.data, current, persistEconomy]);

  const value = useMemo<PlayerStateContextValue>(
    () => ({
      progression: current,
      persistenceAvailable: loaded.status !== 'unavailable',
      economyPending,
      async reward(completion) {
        const result = applyCompletionReward(current, completion);
        if (result.conflict) return false;
        if (!economyRepository) return !result.applied || persist(result.state);
        setEconomyPending(true);
        try {
          const mutation = await economyRepository.credit(
            result.reward.coins,
            `reward:${completion.gameId}`,
          );
          return persist({
            ...result.state,
            coins: mutation.coins,
            consumables: {
              revealOneLetter: mutation.revealOneLetter,
              removeIncorrectLetters: mutation.removeIncorrectLetters,
            },
            economyRevision: mutation.revision,
            economyOperations: {
              ...(result.state.economyOperations ?? {}),
              [`reward:${completion.gameId}`]: JSON.stringify({
                type: 'credit',
                amount: result.reward.coins,
              }),
            },
          });
        } catch {
          return false;
        } finally {
          setEconomyPending(false);
        }
      },
      async unlockDaily(mode, dateKey, todayKey) {
        const operationId = `past-daily:${mode}:${dateKey}`;
        const result = purchasePastDailyEntitlement({
          state: current,
          operationId,
          mode,
          dateKey,
          todayKey,
        });
        if (!result.ok) return result.code === 'insufficient_coins' ? 'insufficient' : 'invalid';
        if (!result.applied) return 'already';
        if (!economyRepository) return persist(result.state) ? 'unlocked' : 'invalid';
        setEconomyPending(true);
        try {
          const mutation = await economyRepository.spend(60, operationId);
          return persist({
            ...result.state,
            coins: mutation.coins,
            consumables: {
              revealOneLetter: mutation.revealOneLetter,
              removeIncorrectLetters: mutation.removeIncorrectLetters,
            },
            economyRevision: mutation.revision,
            economyOperations: {
              ...(result.state.economyOperations ?? {}),
              [operationId]: JSON.stringify({ type: 'spend', amount: 60 }),
            },
          })
            ? 'unlocked'
            : 'invalid';
        } catch (error) {
          return error instanceof Error && error.message.toLowerCase().includes('insufficient')
            ? 'insufficient'
            : 'invalid';
        } finally {
          setEconomyPending(false);
        }
      },
      promoteDailyUnlock(mode, dateKey) {
        const result = promotePastDailyEntitlement(current, mode, dateKey);
        return !result.applied || persist(result.state);
      },
      purchaseConsumable(type: ConsumableType, operationId: string) {
        return runEconomy({ type: 'purchase', consumable: type, operationId });
      },
      consumeConsumable(type: ConsumableType, operationId: string) {
        return runEconomy({
          type: 'consume',
          consumable: type,
          operationId,
          scope: 'solo-practice',
        });
      },
      spendCoins(amount: number, operationId: string) {
        return runEconomy({ type: 'spend', amount, operationId });
      },
    }),
    [current, economyPending, economyRepository, loaded.status, persist, runEconomy],
  );

  return <PlayerStateContext.Provider value={value}>{children}</PlayerStateContext.Provider>;
}
