import { keyboardSoundProfileSchema } from './feedback';
import type { KeyboardSoundProfile } from './feedback';

export interface PlayerSettings {
  schemaVersion: 1;
  sound: boolean;
  reducedEffects: boolean;
  notifications: boolean;
  defaultHardMode: boolean;
  keyboardSoundProfile: KeyboardSoundProfile;
  hapticsEnabled: boolean;
}

export interface NormalizedPlayerSettings {
  settings: PlayerSettings;
  recovered: boolean;
}

export const defaultPlayerSettings: PlayerSettings = Object.freeze({
  schemaVersion: 1,
  sound: true,
  reducedEffects: false,
  notifications: true,
  defaultHardMode: false,
  keyboardSoundProfile: 'terminal',
  hapticsEnabled: false,
});

function storedBoolean(value: unknown, fallback: boolean): [boolean, boolean] {
  return typeof value === 'boolean' ? [value, false] : [fallback, true];
}

export function normalizePlayerSettings(input: {
  stored: unknown;
  keyboardSoundProfile: unknown;
  hapticsEnabled: unknown;
}): NormalizedPlayerSettings {
  const record =
    typeof input.stored === 'object' && input.stored !== null && !Array.isArray(input.stored)
      ? (input.stored as Record<string, unknown>)
      : null;
  const [sound, recoveredSound] = storedBoolean(record?.sound, defaultPlayerSettings.sound);
  const [reducedEffects, recoveredReducedEffects] = storedBoolean(
    record?.reducedEffects,
    defaultPlayerSettings.reducedEffects,
  );
  const [notifications, recoveredNotifications] = storedBoolean(
    record?.notifications,
    defaultPlayerSettings.notifications,
  );
  const [defaultHardMode, recoveredHardMode] = storedBoolean(
    record?.defaultHardMode,
    defaultPlayerSettings.defaultHardMode,
  );
  const parsedProfile = keyboardSoundProfileSchema.safeParse(input.keyboardSoundProfile);
  const [hapticsEnabled, recoveredHaptics] = storedBoolean(
    input.hapticsEnabled,
    defaultPlayerSettings.hapticsEnabled,
  );

  return {
    settings: {
      schemaVersion: 1,
      sound,
      reducedEffects,
      notifications,
      defaultHardMode,
      keyboardSoundProfile: parsedProfile.success
        ? parsedProfile.data
        : defaultPlayerSettings.keyboardSoundProfile,
      hapticsEnabled,
    },
    recovered:
      record === null ||
      record.schemaVersion !== 1 ||
      recoveredSound ||
      recoveredReducedEffects ||
      recoveredNotifications ||
      recoveredHardMode ||
      !parsedProfile.success ||
      recoveredHaptics,
  };
}
