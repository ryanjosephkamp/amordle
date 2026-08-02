'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext } from 'react';
import type { PropsWithChildren } from 'react';
import { loadLocalPreferences, saveLocalFeedback } from '@/adapters/local-account';
import { loadSettings, saveSettings } from '@/adapters/supabase/account';
import type { PlayerSettings } from '@/adapters/supabase/account';
import { settingsQueryKey } from '@/application/query-keys';
import { useAuth } from './providers';

export interface FeedbackSettings extends PlayerSettings {
  accountBacked: boolean;
}

interface FeedbackPreferencesValue {
  status: 'loading' | 'ready' | 'error' | 'saving';
  settings: FeedbackSettings;
  settingsOwner: string;
  error: Error | null;
  saveError: boolean;
  update(patch: Partial<PlayerSettings>): Promise<FeedbackSettings>;
  retry(): Promise<unknown>;
}

const defaultFeedbackSettings: FeedbackSettings = {
  schemaVersion: 1,
  sound: true,
  reducedEffects: false,
  notifications: true,
  defaultHardMode: false,
  keyboardSoundProfile: 'terminal',
  hapticsEnabled: false,
  accountBacked: false,
};

const FeedbackPreferencesContext = createContext<FeedbackPreferencesValue | null>(null);

async function loadFeedbackSettings(input: {
  accountBacked: boolean;
  ownerNamespace: string;
  userId: string;
}): Promise<FeedbackSettings> {
  if (input.accountBacked) {
    return { ...(await loadSettings(input.userId)), accountBacked: true };
  }
  const local = await loadLocalPreferences(input.ownerNamespace);
  return {
    ...defaultFeedbackSettings,
    sound: local.sound,
    reducedEffects: local.reducedEffects,
    keyboardSoundProfile: local.keyboardSoundProfile,
    hapticsEnabled: local.hapticsEnabled,
  };
}

export function FeedbackPreferencesProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const userId = auth.user?.id ?? '';
  const accountBacked = auth.status === 'signed-in' && Boolean(userId);
  const settingsOwner = accountBacked ? `account:${userId}` : 'guest';
  const queryKey = settingsQueryKey(settingsOwner);
  const preferences = useQuery({
    queryKey,
    queryFn: () => loadFeedbackSettings({ accountBacked, ownerNamespace: settingsOwner, userId }),
    enabled: auth.status !== 'loading',
  });
  const save = useMutation({
    mutationFn: async (next: FeedbackSettings): Promise<FeedbackSettings> => {
      if (next.accountBacked) {
        const accountSettings: PlayerSettings = {
          schemaVersion: 1,
          sound: next.sound,
          reducedEffects: next.reducedEffects,
          notifications: next.notifications,
          defaultHardMode: next.defaultHardMode,
          keyboardSoundProfile: next.keyboardSoundProfile,
          hapticsEnabled: next.hapticsEnabled,
        };
        return { ...(await saveSettings(userId, accountSettings)), accountBacked: true };
      }
      const local = await saveLocalFeedback(settingsOwner, {
        sound: next.sound,
        reducedEffects: next.reducedEffects,
        keyboardSoundProfile: next.keyboardSoundProfile,
        hapticsEnabled: next.hapticsEnabled,
      });
      return {
        ...defaultFeedbackSettings,
        sound: local.state.sound,
        reducedEffects: local.state.reducedEffects,
        keyboardSoundProfile: local.state.keyboardSoundProfile,
        hapticsEnabled: local.state.hapticsEnabled,
      };
    },
    onSuccess: (next) => {
      queryClient.setQueryData(queryKey, next);
    },
  });
  const settings: FeedbackSettings = preferences.data ?? {
    ...defaultFeedbackSettings,
    accountBacked,
  };
  const value: FeedbackPreferencesValue = {
    status: save.isPending
      ? 'saving'
      : preferences.isPending
        ? 'loading'
        : preferences.isError
          ? 'error'
          : 'ready',
    settings,
    settingsOwner,
    error: preferences.error instanceof Error ? preferences.error : null,
    saveError: save.isError,
    async update(patch) {
      const current =
        queryClient.getQueryData<FeedbackSettings>(queryKey) ??
        (await loadFeedbackSettings({ accountBacked, ownerNamespace: settingsOwner, userId }));
      const next = { ...current, ...patch, accountBacked };
      queryClient.setQueryData(queryKey, next);
      try {
        return await save.mutateAsync(next);
      } catch (error) {
        queryClient.setQueryData(queryKey, current);
        throw error;
      }
    },
    retry: () => preferences.refetch(),
  };

  return (
    <FeedbackPreferencesContext.Provider value={value}>
      {children}
    </FeedbackPreferencesContext.Provider>
  );
}

export function useFeedbackPreferences(): FeedbackPreferencesValue {
  const value = useContext(FeedbackPreferencesContext);
  if (!value) {
    throw new Error('useFeedbackPreferences must be used inside FeedbackPreferencesProvider.');
  }
  return value;
}
