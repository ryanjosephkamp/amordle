import { describe, expect, it } from 'vitest';
import { defaultPlayerSettings, normalizePlayerSettings } from '@/domain/player-settings';

describe('player settings normalization', () => {
  it('preserves every valid legacy property and defaults only missing fields', () => {
    const result = normalizePlayerSettings({
      stored: {
        schemaVersion: 1,
        sound: false,
        notifications: false,
        extraLegacyField: 'ignored',
      },
      keyboardSoundProfile: null,
      hapticsEnabled: null,
    });
    expect(result).toEqual({
      recovered: true,
      settings: {
        ...defaultPlayerSettings,
        sound: false,
        notifications: false,
      },
    });
  });

  it('accepts a canonical current row without recovery', () => {
    expect(
      normalizePlayerSettings({
        stored: {
          schemaVersion: 1,
          sound: false,
          reducedEffects: true,
          notifications: false,
          defaultHardMode: true,
        },
        keyboardSoundProfile: 'glass',
        hapticsEnabled: true,
      }),
    ).toEqual({
      recovered: false,
      settings: {
        schemaVersion: 1,
        sound: false,
        reducedEffects: true,
        notifications: false,
        defaultHardMode: true,
        keyboardSoundProfile: 'glass',
        hapticsEnabled: true,
      },
    });
  });

  it('recovers a malformed non-object payload without exposing it', () => {
    expect(
      normalizePlayerSettings({
        stored: 'private malformed contents',
        keyboardSoundProfile: 'unknown',
        hapticsEnabled: undefined,
      }),
    ).toEqual({ settings: defaultPlayerSettings, recovered: true });
  });
});
