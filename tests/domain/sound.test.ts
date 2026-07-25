import { describe, expect, it } from 'vitest';
import {
  readSoundEnabled,
  settingsStorageKey,
  writeSoundEnabled,
} from '../../src/services/sound-controller';
import { loadPlayerSettings } from '../../src/services/settings-repository';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('sound preference boundary', () => {
  it('defaults new and corrupt scopes to enabled', () => {
    const storage = new MemoryStorage();
    const identity = { kind: 'guest' } as const;
    expect(readSoundEnabled(identity, storage)).toBe(true);
    storage.setItem(settingsStorageKey(identity), '{broken');
    expect(readSoundEnabled(identity, storage)).toBe(true);
  });

  it('round-trips an account-scoped mute without discarding other settings', () => {
    const storage = new MemoryStorage();
    const identity = { kind: 'authenticated', userId: 'user/one' } as const;
    storage.setItem(settingsStorageKey(identity), JSON.stringify({ motion: true, chain: 7 }));
    writeSoundEnabled(identity, false, storage);
    expect(readSoundEnabled(identity, storage)).toBe(false);
    const stored = JSON.parse(storage.getItem(settingsStorageKey(identity)) ?? '{}') as {
      schemaVersion?: number;
      owner?: unknown;
      revision?: number;
      payload?: Record<string, unknown>;
    };
    expect(stored).toMatchObject({
      schemaVersion: 1,
      owner: identity,
      revision: 2,
      payload: {
        difficulty: 'Expert',
        motion: true,
        chain: 7,
        sound: false,
        notifications: true,
      },
    });
    expect(settingsStorageKey(identity)).not.toContain('user/one');
  });

  it('migrates a valid legacy object into an owned versioned envelope', () => {
    const storage = new MemoryStorage();
    const identity = { kind: 'guest' } as const;
    storage.setItem(
      settingsStorageKey(identity),
      JSON.stringify({ difficulty: 'Standard', notifications: false }),
    );

    const loaded = loadPlayerSettings(identity, storage);
    expect(loaded).toMatchObject({
      status: 'legacy-migrated',
      revision: 1,
      settings: {
        difficulty: 'Standard',
        sound: true,
        notifications: false,
      },
    });
    expect(JSON.parse(storage.getItem(settingsStorageKey(identity)) ?? '{}')).toMatchObject({
      schemaVersion: 1,
      owner: identity,
      revision: 1,
      payload: loaded.settings,
    });
  });

  it('keeps corrupt and cross-account settings fail closed', () => {
    const storage = new MemoryStorage();
    const first = { kind: 'authenticated', userId: 'first' } as const;
    const second = { kind: 'authenticated', userId: 'second' } as const;
    storage.setItem(settingsStorageKey(first), '{broken');
    expect(loadPlayerSettings(first, storage)).toMatchObject({
      status: 'corrupt',
      settings: { sound: true, notifications: true },
    });
    writeSoundEnabled(second, false, storage);
    expect(readSoundEnabled(first, storage)).toBe(true);
    expect(readSoundEnabled(second, storage)).toBe(false);
  });
});
