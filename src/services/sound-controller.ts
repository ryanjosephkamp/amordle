import type { IdentityScope } from '../persistence/local-repository';

export type SoundCue =
  'keyboard-click' | 'tile-submit' | 'invalid' | 'solve' | 'win' | 'loss' | 'notification';

export const SOUND_PREFERENCE_EVENT = 'amordle:sound-preference';

type SoundPreferenceDetail = {
  readonly storageKey: string;
  readonly enabled: boolean;
};

type OscillatorProfile = {
  readonly frequency: number;
  readonly durationMs: number;
  readonly gain: number;
  readonly type: OscillatorType;
};

const profiles: Readonly<Record<SoundCue, readonly OscillatorProfile[]>> = {
  'keyboard-click': [{ frequency: 240, durationMs: 24, gain: 0.025, type: 'square' }],
  'tile-submit': [{ frequency: 330, durationMs: 55, gain: 0.035, type: 'triangle' }],
  invalid: [
    { frequency: 180, durationMs: 80, gain: 0.04, type: 'sawtooth' },
    { frequency: 140, durationMs: 90, gain: 0.03, type: 'sawtooth' },
  ],
  solve: [
    { frequency: 440, durationMs: 75, gain: 0.035, type: 'sine' },
    { frequency: 660, durationMs: 110, gain: 0.04, type: 'sine' },
  ],
  win: [
    { frequency: 392, durationMs: 70, gain: 0.035, type: 'sine' },
    { frequency: 523, durationMs: 80, gain: 0.04, type: 'sine' },
    { frequency: 659, durationMs: 120, gain: 0.04, type: 'sine' },
  ],
  loss: [
    { frequency: 220, durationMs: 90, gain: 0.035, type: 'triangle' },
    { frequency: 165, durationMs: 140, gain: 0.035, type: 'triangle' },
  ],
  notification: [
    { frequency: 700, durationMs: 60, gain: 0.025, type: 'sine' },
    { frequency: 880, durationMs: 90, gain: 0.025, type: 'sine' },
  ],
};

export function settingsStorageKey(identity: IdentityScope): string {
  return `amordle:settings:${
    identity.kind === 'guest' ? 'guest' : `account:${encodeURIComponent(identity.userId)}`
  }`;
}

export function readSoundEnabled(identity: IdentityScope, storage?: Storage): boolean {
  if (!storage) return true;
  try {
    const value = JSON.parse(storage.getItem(settingsStorageKey(identity)) ?? '{}') as {
      sound?: unknown;
    };
    return typeof value.sound === 'boolean' ? value.sound : true;
  } catch {
    return true;
  }
}

export function writeSoundEnabled(
  identity: IdentityScope,
  enabled: boolean,
  storage?: Storage,
): void {
  const storageKey = settingsStorageKey(identity);
  if (storage) {
    let existing: Record<string, unknown> = {};
    try {
      existing = JSON.parse(storage.getItem(storageKey) ?? '{}') as Record<string, unknown>;
    } catch {
      // A corrupt settings object is replaced by a valid, minimal envelope.
    }
    storage.setItem(storageKey, JSON.stringify({ ...existing, sound: enabled }));
  }
  soundEngine.setEnabled(enabled);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<SoundPreferenceDetail>(SOUND_PREFERENCE_EVENT, {
        detail: { storageKey, enabled },
      }),
    );
  }
}

class SoundEngine {
  private context: AudioContext | null = null;
  private enabled = true;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled && this.context?.state === 'running') void this.context.suspend();
  }

  async play(cue: SoundCue, enabled: boolean): Promise<boolean> {
    this.setEnabled(enabled);
    if (!enabled || typeof window === 'undefined') return false;
    try {
      const AudioContextConstructor = window.AudioContext;
      if (!AudioContextConstructor) return false;
      this.context ??= new AudioContextConstructor();
      if (this.context.state === 'suspended') await this.context.resume();
      if (!this.enabled || this.context.state !== 'running') return false;

      const start = this.context.currentTime;
      let offset = 0;
      for (const profile of profiles[cue]) {
        const oscillator = this.context.createOscillator();
        const gain = this.context.createGain();
        const cueStart = start + offset;
        const cueEnd = cueStart + profile.durationMs / 1_000;
        oscillator.type = profile.type;
        oscillator.frequency.setValueAtTime(profile.frequency, cueStart);
        gain.gain.setValueAtTime(0.0001, cueStart);
        gain.gain.exponentialRampToValueAtTime(profile.gain, cueStart + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, cueEnd);
        oscillator.connect(gain);
        gain.connect(this.context.destination);
        oscillator.start(cueStart);
        oscillator.stop(cueEnd + 0.005);
        offset += profile.durationMs / 1_000 + 0.012;
      }
      return true;
    } catch {
      return false;
    }
  }
}

export const soundEngine = new SoundEngine();
