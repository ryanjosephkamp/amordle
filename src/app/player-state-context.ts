import { createContext, useContext } from 'react';
import type { ConsumableType } from '../domain/economy';
import type { CompletionRewardInput, ProgressionState } from '../domain/progression';

export type EconomyActionResult =
  | { readonly ok: true; readonly applied: boolean }
  | {
      readonly ok: false;
      readonly code:
        | 'unavailable'
        | 'insufficient_coins'
        | 'insufficient_inventory'
        | 'invalid_scope'
        | 'conflict';
    };

export type PlayerStateContextValue = {
  progression: ProgressionState;
  persistenceAvailable: boolean;
  economyPending: boolean;
  reward(completion: CompletionRewardInput): Promise<boolean>;
  unlockDaily(
    mode: 'og' | 'go',
    dateKey: string,
    todayKey: string,
  ): Promise<'unlocked' | 'already' | 'invalid' | 'insufficient'>;
  promoteDailyUnlock(mode: 'og' | 'go', dateKey: string): boolean;
  purchaseConsumable(type: ConsumableType, operationId: string): Promise<EconomyActionResult>;
  consumeConsumable(type: ConsumableType, operationId: string): Promise<EconomyActionResult>;
  spendCoins(amount: number, operationId: string): Promise<EconomyActionResult>;
};

export const PlayerStateContext = createContext<PlayerStateContextValue | null>(null);

export function usePlayerState(): PlayerStateContextValue {
  const value = useContext(PlayerStateContext);
  if (!value) throw new Error('usePlayerState must be used inside PlayerStateProvider.');
  return value;
}
