'use client';

import { useState } from 'react';
import { playKeyboardSound } from '@/application/keyboard-feedback';
import { useFeedbackPreferences } from '@/components/feedback-preferences';
import { SkeletonRows } from '@/components/route-states';
import { keyboardSoundProfileSchema, keyboardSoundProfiles } from '@/domain/feedback';

export function SettingsPanel() {
  const feedback = useFeedbackPreferences();
  const [saveMessage, setSaveMessage] = useState('');

  if (feedback.status === 'loading') {
    return <SkeletonRows label="Loading settings…" rows={6} />;
  }
  if (feedback.status === 'error') {
    return (
      <section className="status-panel">
        <h2>Settings unavailable</h2>
        <p>Your current preferences were not changed.</p>
        <button onClick={() => void feedback.retry()}>Try again</button>
      </section>
    );
  }
  const value = feedback.settings;
  const change = (next: typeof value) => {
    setSaveMessage('');
    void feedback
      .update(next)
      .then((saved) =>
        setSaveMessage(
          saved.accountBacked
            ? 'Settings saved to your account.'
            : 'Settings saved on this device.',
        ),
      )
      .catch(() => setSaveMessage('Settings could not be saved.'));
  };
  const toggle = (
    key: 'sound' | 'reducedEffects' | 'notifications' | 'defaultHardMode' | 'hapticsEnabled',
  ) => change({ ...value, [key]: !value[key] });

  return (
    <div className="data-list" aria-label="Player settings">
      <SettingRow
        label="Sound"
        description="Play restrained feedback for keyboard input and accepted actions."
        checked={value.sound}
        disabled={feedback.status === 'saving'}
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
            disabled={feedback.status === 'saving'}
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
          <button
            type="button"
            onClick={() => void playKeyboardSound(value.keyboardSoundProfile, 'reject')}
          >
            INVALID GUESS
          </button>
        </div>
      </div>
      <p className="settings-description">
        {keyboardSoundProfiles.find((profile) => profile.id === value.keyboardSoundProfile)
          ?.description ?? ''}
      </p>
      <SettingRow
        label="Touch haptics"
        description="Use one short vibration for direct taps on buttons and button-like controls when this browser supports it."
        checked={value.hapticsEnabled}
        disabled={feedback.status === 'saving'}
        onChange={() => toggle('hapticsEnabled')}
      />
      <SettingRow
        label="Reduced effects"
        description="Use simpler transitions and suppress haptics in addition to system motion preferences."
        checked={value.reducedEffects}
        disabled={feedback.status === 'saving'}
        onChange={() => toggle('reducedEffects')}
      />
      {value.accountBacked ? (
        <>
          <SettingRow
            label="Notifications"
            description="Show actionable match and request updates."
            checked={value.notifications}
            disabled={feedback.status === 'saving'}
            onChange={() => toggle('notifications')}
          />
          <SettingRow
            label="Default Hard Mode"
            description="Preselect Hard Mode for new Practice games."
            checked={value.defaultHardMode}
            disabled={feedback.status === 'saving'}
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
        {value.recovered
          ? 'Some older settings were restored with current defaults. Save any preference to update the account copy. '
          : ''}
        {feedback.status === 'saving'
          ? 'Saving…'
          : feedback.saveError
            ? 'Settings could not be saved.'
            : saveMessage}
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
