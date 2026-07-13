import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { SoundContext, type SoundContextValue } from './SoundContext'
import {
  createSoundEngine,
  loadSoundPreference,
  saveSoundPreference,
  type SoundEngine,
  type SoundEvent,
} from './soundEngine'

export function SoundProvider({ children }: { readonly children: ReactNode }) {
  const [enabled, setEnabledState] = useState<boolean>(() => loadSoundPreference())
  const engineRef = useRef<SoundEngine | undefined>(undefined)

  if (engineRef.current == null) {
    engineRef.current = createSoundEngine({ enabled })
  }

  useEffect(() => {
    engineRef.current?.setEnabled(enabled)
  }, [enabled])

  useEffect(() => () => engineRef.current?.dispose(), [])

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next)
    saveSoundPreference(next)
  }, [])

  const play = useCallback((event: SoundEvent) => {
    engineRef.current?.play(event)
  }, [])

  const value = useMemo<SoundContextValue>(() => ({ enabled, setEnabled, play }), [enabled, setEnabled, play])

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>
}
