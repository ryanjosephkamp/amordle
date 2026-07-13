import { createContext, useContext } from 'react'
import type { SoundEvent } from './soundEngine'

export interface SoundContextValue {
  readonly enabled: boolean
  readonly setEnabled: (enabled: boolean) => void
  readonly play: (event: SoundEvent) => void
}

export const SoundContext = createContext<SoundContextValue | undefined>(undefined)

export function useSound(): SoundContextValue {
  const ctx = useContext(SoundContext)
  if (ctx) {
    return ctx
  }
  return { enabled: false, setEnabled: () => undefined, play: () => undefined }
}
