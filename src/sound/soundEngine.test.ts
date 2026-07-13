import { describe, expect, it } from 'vitest'
import {
  SOUND_CATEGORIES,
  SOUND_PREF_STORAGE_KEY,
  createSoundEngine,
  getSoundCategory,
  loadSoundPreference,
  saveSoundPreference,
  type AudioContextLike,
  type GainNodeLike,
  type OscillatorNodeLike,
  type SoundCategory,
  type SoundEvent,
} from './soundEngine'

function createMockContext() {
  const events: string[] = []
  const oscillators: OscillatorNodeLike[] = []
  const gains: GainNodeLike[] = []
  const destination = { _isDestination: true as const }

  const context: AudioContextLike = {
    currentTime: 0,
    destination,
    state: 'running',
    createOscillator(): OscillatorNodeLike {
      const node: OscillatorNodeLike = {
        type: 'sine',
        frequency: {
          setValueAtTime() {
            events.push('frequency.setValueAtTime')
          },
        },
        connect() {
          events.push('oscillator.connect')
        },
        start() {
          events.push('oscillator.start')
        },
        stop() {
          events.push('oscillator.stop')
        },
      }
      oscillators.push(node)
      return node
    },
    createGain(): GainNodeLike {
      const node: GainNodeLike = {
        gain: {
          setValueAtTime() { events.push('gain.setValueAtTime') },
          exponentialRampToValueAtTime() { events.push('gain.ramp') },
        },
        connect() {
          events.push('gain.connect')
        },
      }
      gains.push(node)
      return node
    },
  }

  return { context, events, oscillators, gains }
}

describe('createSoundEngine', () => {
  it('is a complete no-op when disabled (never invokes the audio context factory)', () => {
    let factoryCalls = 0
    const engine = createSoundEngine({
      enabled: false,
      audioContextFactory: () => {
        factoryCalls += 1
        return undefined
      },
    })
    engine.play('tile-flip')
    engine.play('correct-guess')
    expect(factoryCalls).toBe(0)
    expect(engine.enabled).toBe(false)
  })

  it('plays oscillators when enabled', () => {
    const mock = createMockContext()
    const engine = createSoundEngine({ enabled: true, audioContextFactory: () => mock.context })
    engine.play('tile-flip')
    expect(mock.oscillators.length).toBe(1)
    expect(mock.events).toContain('oscillator.start')
    expect(mock.events).toContain('oscillator.stop')
  })

  it('requests an AudioContext resume when a user-triggered sound plays while suspended', () => {
    const mock = createMockContext()
    let resumeCalls = 0
    const suspendedContext: AudioContextLike = {
      ...mock.context,
      state: 'suspended',
      resume: async () => {
        resumeCalls += 1
      },
    }
    const engine = createSoundEngine({ enabled: true, audioContextFactory: () => suspendedContext })
    engine.play('keyboard-click')
    expect(resumeCalls).toBe(1)
    expect(mock.oscillators.length).toBe(1)
  })

  it('plays a multi-tone arpeggio for game-over-win', () => {
    const mock = createMockContext()
    const engine = createSoundEngine({ enabled: true, audioContextFactory: () => mock.context })
    engine.play('game-over-win')
    expect(mock.oscillators.length).toBeGreaterThanOrEqual(3)
  })

  it('plays the unique multi-tone daily-reset chime', () => {
    const mock = createMockContext()
    const engine = createSoundEngine({ enabled: true, audioContextFactory: () => mock.context })
    engine.play('daily-reset')
    // The reset chime is a distinct ascending four-note arpeggio.
    expect(mock.oscillators.length).toBe(4)
    expect(mock.events).toContain('oscillator.start')
  })

  it('plays a separate unique multi-tone Daily Multiplayer reset chime', () => {
    const mock = createMockContext()
    const engine = createSoundEngine({ enabled: true, audioContextFactory: () => mock.context })
    engine.play('daily-multiplayer-reset')
    expect(mock.oscillators.length).toBe(4)
    expect(mock.events).toContain('oscillator.start')
  })

  it('plays a compact notification alert', () => {
    const mock = createMockContext()
    const engine = createSoundEngine({ enabled: true, audioContextFactory: () => mock.context })
    engine.play('notification-alert')
    expect(mock.oscillators.length).toBe(2)
    expect(mock.events).toContain('oscillator.start')
  })

  it('stops creating new audio activity after setEnabled(false)', () => {
    const mock = createMockContext()
    const engine = createSoundEngine({ enabled: true, audioContextFactory: () => mock.context })
    engine.play('keyboard-click')
    const after = mock.oscillators.length
    engine.setEnabled(false)
    engine.play('keyboard-click')
    expect(mock.oscillators.length).toBe(after)
  })

  it('degrades to a no-op when the factory returns undefined', () => {
    const engine = createSoundEngine({ enabled: true, audioContextFactory: () => undefined })
    expect(() => engine.play('invalid-guess')).not.toThrow()
  })
})

describe('sound preference persistence', () => {
  function memoryStorage(): Storage {
    const map = new Map<string, string>()
    return {
      length: 0,
      clear() { map.clear() },
      getItem(key: string) { return map.get(key) ?? null },
      key() { return null },
      removeItem(key: string) { map.delete(key) },
      setItem(key: string, value: string) { map.set(key, value) },
    } as Storage
  }

  it('defaults to true when nothing has been saved', () => {
    expect(loadSoundPreference(memoryStorage())).toBe(true)
  })

  it('round-trips true and false through storage', () => {
    const storage = memoryStorage()
    saveSoundPreference(false, storage)
    expect(loadSoundPreference(storage)).toBe(false)
    saveSoundPreference(true, storage)
    expect(loadSoundPreference(storage)).toBe(true)
  })

  it('uses a stable storage key', () => {
    expect(SOUND_PREF_STORAGE_KEY).toBe('brrrdle:sound-effects-enabled')
  })
})

describe('sound categories', () => {
  const events: readonly SoundEvent[] = [
    'tile-flip',
    'correct-guess',
    'game-over-win',
    'game-over-loss',
    'keyboard-click',
    'invalid-guess',
    'daily-reset',
    'daily-multiplayer-reset',
    'notification-alert',
  ]

  it('assigns every sound event to exactly one category', () => {
    for (const event of events) {
      expect(SOUND_CATEGORIES[event]).toBe(getSoundCategory(event))
      expect(SOUND_CATEGORIES[event]).toBeTypeOf('string')
    }
  })

  it('maps gameplay events to the expected categories', () => {
    expect(getSoundCategory('keyboard-click')).toBe('keypress')
    expect(getSoundCategory('tile-flip')).toBe('submit')
    expect(getSoundCategory('correct-guess')).toBe('submit')
    expect(getSoundCategory('game-over-win')).toBe('win')
    expect(getSoundCategory('game-over-loss')).toBe('loss')
    expect(getSoundCategory('invalid-guess')).toBe('ui')
    expect(getSoundCategory('notification-alert')).toBe('ui')
  })

  it('covers exactly the five defined categories', () => {
    const categories = new Set<SoundCategory>(Object.values(SOUND_CATEGORIES))
    expect([...categories].sort()).toEqual(['keypress', 'loss', 'submit', 'ui', 'win'])
  })
})
