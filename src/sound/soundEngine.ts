/**
 * Lightweight, dependency-free sound-effects engine using the Web Audio API.
 *
 * Design goals:
 * - Zero behaviour and zero AudioContext creation when the toggle is off.
 * - Graceful no-op when Web Audio is unavailable (older browsers, SSR-style preview).
 * - No autoplay, no media assets; tiny synthesized tones only.
 */

export type SoundEvent =
  | 'tile-flip'
  | 'correct-guess'
  | 'game-over-win'
  | 'game-over-loss'
  | 'keyboard-click'
  | 'invalid-guess'
  | 'daily-reset'
  | 'daily-multiplayer-reset'
  | 'notification-alert'

/**
 * Phase 19.4 — coarse categories layered over the individual sound events. They
 * are metadata only: every event still plays solely when the master sound
 * toggle is on, so categorizing changes no current behaviour. The grouping is
 * the foundation for future per-category preferences without another refactor.
 */
export type SoundCategory = 'keypress' | 'submit' | 'win' | 'loss' | 'ui'

export const SOUND_CATEGORIES: Record<SoundEvent, SoundCategory> = {
  'correct-guess': 'submit',
  'daily-multiplayer-reset': 'ui',
  'daily-reset': 'ui',
  'game-over-loss': 'loss',
  'game-over-win': 'win',
  'invalid-guess': 'ui',
  'keyboard-click': 'keypress',
  'notification-alert': 'ui',
  'tile-flip': 'submit',
}

/** The category a given sound event belongs to. */
export function getSoundCategory(event: SoundEvent): SoundCategory {
  return SOUND_CATEGORIES[event]
}

export interface SoundEngineOptions {
  readonly enabled: boolean
  /** Optional override for the audio context, used in tests. */
  readonly audioContextFactory?: () => AudioContextLike | undefined
}

/** Subset of `AudioContext` we rely on. Used to mock cleanly in tests. */
export interface AudioContextLike {
  readonly currentTime: number
  readonly destination: AudioDestinationNodeLike
  readonly state: 'running' | 'suspended' | 'closed'
  createOscillator(): OscillatorNodeLike
  createGain(): GainNodeLike
  resume?(): Promise<void>
}

export interface AudioDestinationNodeLike { readonly _isDestination: true }

export interface OscillatorNodeLike {
  type: OscillatorType
  frequency: { setValueAtTime(value: number, when: number): void }
  connect(node: GainNodeLike): void
  start(when: number): void
  stop(when: number): void
}

export interface GainNodeLike {
  gain: {
    setValueAtTime(value: number, when: number): void
    exponentialRampToValueAtTime(value: number, when: number): void
  }
  connect(node: AudioDestinationNodeLike | GainNodeLike): void
}

interface ToneSpec {
  readonly frequency: number
  readonly type: OscillatorType
  readonly duration: number
  readonly peakGain: number
}

const TONE_SPECS: Record<SoundEvent, readonly ToneSpec[]> = {
  'tile-flip': [{ frequency: 660, type: 'triangle', duration: 0.06, peakGain: 0.05 }],
  'correct-guess': [
    { frequency: 660, type: 'sine', duration: 0.08, peakGain: 0.06 },
    { frequency: 990, type: 'sine', duration: 0.12, peakGain: 0.07 },
  ],
  'game-over-win': [
    { frequency: 523.25, type: 'sine', duration: 0.12, peakGain: 0.06 },
    { frequency: 659.25, type: 'sine', duration: 0.12, peakGain: 0.06 },
    { frequency: 783.99, type: 'sine', duration: 0.18, peakGain: 0.07 },
  ],
  'game-over-loss': [
    { frequency: 220, type: 'sawtooth', duration: 0.18, peakGain: 0.05 },
    { frequency: 165, type: 'sawtooth', duration: 0.24, peakGain: 0.05 },
  ],
  'keyboard-click': [{ frequency: 440, type: 'square', duration: 0.03, peakGain: 0.03 }],
  'invalid-guess': [{ frequency: 180, type: 'square', duration: 0.12, peakGain: 0.05 }],
  // Phase 22 — brand-new unique "new daily is available" chime. Intentionally
  // distinct from every other event: a bright, bell-like ascending arpeggio
  // (D5 → G5 → C6 → E6) on triangle waves with a final high shimmer accent, so
  // players immediately recognise it as the daily-reset signal.
  'daily-reset': [
    { frequency: 587.33, type: 'triangle', duration: 0.12, peakGain: 0.05 },
    { frequency: 783.99, type: 'triangle', duration: 0.12, peakGain: 0.055 },
    { frequency: 1046.5, type: 'triangle', duration: 0.14, peakGain: 0.06 },
    { frequency: 1318.51, type: 'sine', duration: 0.22, peakGain: 0.05 },
  ],
  // Phase 23 — separate UTC Daily Multiplayer reset cue. Lower, glassier, and
  // more syncopated than the solo daily chime so players can distinguish it.
  'daily-multiplayer-reset': [
    { frequency: 392, type: 'sine', duration: 0.1, peakGain: 0.045 },
    { frequency: 622.25, type: 'triangle', duration: 0.1, peakGain: 0.05 },
    { frequency: 932.33, type: 'sine', duration: 0.16, peakGain: 0.052 },
    { frequency: 739.99, type: 'triangle', duration: 0.2, peakGain: 0.046 },
  ],
  // Phase 26.4 — compact notification alert for important in-app attention
  // cues. Shorter and quieter than game completion tones so it cannot be
  // mistaken for a gameplay result.
  'notification-alert': [
    { frequency: 740, type: 'sine', duration: 0.08, peakGain: 0.045 },
    { frequency: 988, type: 'triangle', duration: 0.12, peakGain: 0.04 },
  ],
}

function defaultAudioContextFactory(): AudioContextLike | undefined {
  if (typeof globalThis === 'undefined') {
    return undefined
  }
  const ctor =
    (globalThis as unknown as { AudioContext?: new () => AudioContextLike }).AudioContext ??
    (globalThis as unknown as { webkitAudioContext?: new () => AudioContextLike }).webkitAudioContext
  if (!ctor) {
    return undefined
  }
  try {
    return new ctor()
  } catch {
    return undefined
  }
}

export interface SoundEngine {
  readonly enabled: boolean
  setEnabled(enabled: boolean): void
  play(event: SoundEvent): void
  /** Releases any audio resources held by the engine. */
  dispose(): void
}

export function createSoundEngine(options: SoundEngineOptions): SoundEngine {
  let enabled = options.enabled
  let cachedContext: AudioContextLike | undefined
  const factory = options.audioContextFactory ?? defaultAudioContextFactory

  function getContext(): AudioContextLike | undefined {
    if (!enabled) {
      return undefined
    }
    if (cachedContext && cachedContext.state !== 'closed') {
      return cachedContext
    }
    cachedContext = factory()
    return cachedContext
  }

  function playSpec(context: AudioContextLike, spec: ToneSpec, offset: number): number {
    const startTime = context.currentTime + offset
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = spec.type
    oscillator.frequency.setValueAtTime(spec.frequency, startTime)
    gain.gain.setValueAtTime(0.0001, startTime)
    gain.gain.exponentialRampToValueAtTime(spec.peakGain, startTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + spec.duration)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(startTime)
    oscillator.stop(startTime + spec.duration + 0.02)
    return spec.duration
  }

  return {
    get enabled() { return enabled },
    setEnabled(next: boolean) {
      enabled = next
      if (!enabled) {
        cachedContext = undefined
      }
    },
    play(event: SoundEvent) {
      const context = getContext()
      if (!context) {
        return
      }
      if (context.state === 'suspended') {
        void context.resume?.().catch(() => undefined)
      }
      const specs = TONE_SPECS[event]
      let offset = 0
      for (const spec of specs) {
        offset += playSpec(context, spec, offset)
      }
    },
    dispose() {
      cachedContext = undefined
    },
  }
}

const SOUND_PREF_STORAGE_KEY = 'brrrdle:sound-effects-enabled'

export function loadSoundPreference(storage: Storage | undefined = typeof localStorage !== 'undefined' ? localStorage : undefined): boolean {
  if (!storage) {
    return true
  }
  try {
    const raw = storage.getItem(SOUND_PREF_STORAGE_KEY)
    if (raw === null) {
      return true
    }
    return raw === 'true'
  } catch {
    return true
  }
}

export function saveSoundPreference(enabled: boolean, storage: Storage | undefined = typeof localStorage !== 'undefined' ? localStorage : undefined): void {
  if (!storage) {
    return
  }
  try {
    storage.setItem(SOUND_PREF_STORAGE_KEY, enabled ? 'true' : 'false')
  } catch {
    // ignore quota errors
  }
}

export { SOUND_PREF_STORAGE_KEY }
