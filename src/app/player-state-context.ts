import { createContext, useContext } from 'react';
import type { CompletionRewardInput, ProgressionState } from '../domain/progression';

export type PlayerStateContextValue = {
  progression: ProgressionState;
  persistenceAvailable: boolean;
  reward(completion: CompletionRewardInput): void;
  unlockDaily(
    mode: 'og' | 'go',
    dateKey: string,
    todayKey: string,
  ): 'unlocked' | 'already' | 'invalid' | 'insufficient';
};

export const PlayerStateContext = createContext<PlayerStateContextValue | null>(null);

export function usePlayerState(): PlayerStateContextValue {
  const value = useContext(PlayerStateContext);
  if (!value) throw new Error('usePlayerState must be used inside PlayerStateProvider.');
  return value;
}
