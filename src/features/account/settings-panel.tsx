'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { loadSettings, saveSettings } from '@/adapters/supabase/account';
import type { PlayerSettings } from '@/adapters/supabase/account';
import { loadLocalPreferences, saveLocalFeedback } from '@/adapters/local-account';
import { playKeyboardSound } from '@/application/keyboard-feedback';
import { useAuth } from '@/components/providers';
import { SkeletonRows } from '@/components/route-states';
import { keyboardSoundProfileSchema, keyboardSoundProfiles } from '@/domain/feedback';

interface SettingsView extends PlayerSettings {
  accountBacked: boolean;
}

function guestSettings(input: Awaited<ReturnType<typeof loadLocalPreferences>>): SettingsView {
  return {
    schemaVersion: 1,
    sound: input.sound,
    reducedEffects: input.reducedEffects,
    notifications: true,
    defaultHardMode: false,
    keyboardSoundProfile: input.keyboardSoundProfile,
    hapticsEnabled: input.hapticsEnabled,
    accountBacked: false,
  };
}

export function SettingsPanel({ ownerNamespace }: { ownerNamespace: string }) {
  const auth = useAuth();
  const userId = auth.user?.id ?? '';
  const accountBacked = auth.status === 'signed-in' && Boolean(userId);
  const settingsOwner = accountBacked ? `account:${userId}` : ownerNamespace;
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ['settings', settingsOwner],
    queryFn: async (): Promise<SettingsView> =>
      accountBacked
        ? { ...(await loadSettings(userId)), accountBacked: true }
        : guestSettings(await loadLocalPreferences(ownerNamespace)),
    enabled: auth.status !== 'loading',
  });
  const update = useMutation({
    mutationFn: async (input: SettingsView): Promise<SettingsView> => {
      if (input.accountBacked) {
        const accountSettings: PlayerSettings = {
          schemaVersion: 1,
          sound: input.sound,
          reducedEffects: input.reducedEffects,
          notifications: input.notifications,
          defaultHardMode: input.defaultHardMode,
          keyboardSoundProfile: input.keyboardSoundProfile,
          hapticsEnabled: input.hapticsEnabled,
        };
        return { ...(await saveSettings(userId, accountSettings)), accountBacked: true };
      }
      const local = await saveLocalFeedback(ownerNamespace, {
        sound: input.sound,
        reducedEffects: input.reducedEffects,
        keyboardSoundProfile: input.keyboardSoundProfile,
        hapticsEnabled: input.hapticsEnabled,
      });
      return guestSettings(local.state);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['settings', settingsOwner], data);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['solo-preferences'] }),
        queryClient.invalidateQueries({ queryKey: ['combat-preferences'] }),
        queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      ]);
    },
  });

  if (auth.status === 'loading' || settings.isPending) {
    return <SkeletonRows label="Loading settings…" rows={6} />;
  }
  if (settings.isError || !settings.data) {
    return (
      <section className="status-panel">
        <h2>Settings unavailable</h2>
        <p>Your current preferences were not changed.</p>
        <button onClick={() => void settings.refetch()}>Try again</button>
      </section>
    );
  }
  const value = settings.data;
  const change = (next: SettingsView) => update.mutate(next);
  const toggle = (
    key: 'sound' | 'reducedEffects' | 'notifications' | 'defaultHardMode' | 'hapticsEnabled',
  ) => change({ ...value, [key]: !value[key] });

  return (
    <div className="data-list" aria-label="Player settings">
      <SettingRow
        label="Sound"
        description="Play restrained feedback for keyboard input and accepted actions."
        checked={value.sound}
        disabled={update.isPending}
        onChange={() => toggle('sound')}
      />
      <div className="data-row setting-row feedback-profile-row">
        <div>
          <label htmlFor="keyboard-sound-profile">
            <strong>Keyboard sound</strong>
          </label>
          <p>Choose one of five code-generated sounds. No audio files are downloaded.</p>
        </div>
        <div className="feedback-profile-control">
          <select
            id="keyboard-sound-profile"
            value={value.keyboardSoundProfile}
            disabled={update.isPending}
            onChange={(event) =>
              change({
                ...value,
                keyboardSoundProfile: keyboardSoundProfileSchema.parse(event.target.value),
              })
            }
          >
            {keyboardSoundProfiles.map((profile) => (
              <option value={profile.id} key={profile.id}>
                {profile.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void playKeyboardSound(value.keyboardSoundProfile, 'input')}
          >
            PREVIEW
          </button>
        </div>
      </div>
      <p className="settings-description">
        {keyboardSoundProfiles.find((profile) => profile.id === value.keyboardSoundProfile)
          ?.description ?? ''}
      </p>
      <SettingRow
        label="Touch haptics"
        description="Use a short vibration for direct taps on the game keyboard when this browser supports it."
        checked={value.hapticsEnabled}
        disabled={update.isPending}
        onChange={() => toggle('hapticsEnabled')}
      />
      <SettingRow
        label="Reduced effects"
        description="Use simpler transitions and suppress haptics in addition to system motion preferences."
        checked={value.reducedEffects}
        disabled={update.isPending}
        onChange={() => toggle('reducedEffects')}
      />
      {value.accountBacked ? (
        <>
          <SettingRow
            label="Notifications"
            description="Show actionable match and request updates."
            checked={value.notifications}
            disabled={update.isPending}
            onChange={() => toggle('notifications')}
          />
          <SettingRow
            label="Default Hard Mode"
            description="Preselect Hard Mode for new Practice games."
            checked={value.defaultHardMode}
            disabled={update.isPending}
            onChange={() => toggle('defaultHardMode')}
          />
        </>
      ) : (
        <p className="settings-description">
          Sound, haptics, and reduced effects are saved on this device. Sign in to synchronize them
          across devices and configure account-only preferences.
        </p>
      )}
      <p aria-live="polite">
        {update.isPending
          ? 'Saving…'
          : update.isError
            ? 'Settings could not be saved.'
            : update.isSuccess
              ? value.accountBacked
                ? 'Settings saved to your account.'
                : 'Settings saved on this device.'
              : ''}
      </p>
    </div>
  );
}

function SettingRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange(): void;
}) {
  return (
    <div className="data-row setting-row">
      <div>
        <strong>{label}</strong>
        <p>{description}</p>
      </div>
      <label className="switch-control">
        <span className="sr-only">{label}</span>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />
        <span>{checked ? 'On' : 'Off'}</span>
      </label>
    </div>
  );
}
