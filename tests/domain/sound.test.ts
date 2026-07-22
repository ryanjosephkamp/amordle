import { describe, expect, it } from 'vitest';
import {
  readSoundEnabled,
  settingsStorageKey,
  writeSoundEnabled,
} from '../../src/services/sound-controller';

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
    expect(JSON.parse(storage.getItem(settingsStorageKey(identity)) ?? '{}')).toEqual({
      motion: true,
      chain: 7,
      sound: false,
    });
    expect(settingsStorageKey(identity)).not.toContain('user/one');
  });
});
