export type PracticeSeedMode = 'og' | 'go'

export interface PracticeSeedState {
  readonly go: number
  readonly og: number
}

const DEFAULT_PRACTICE_SEED_STATE: PracticeSeedState = { go: 0, og: 0 }

function hashString(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

function normalizeCounter(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0
}

export function createDefaultPracticeSeedState(): PracticeSeedState {
  return DEFAULT_PRACTICE_SEED_STATE
}

export function normalizePracticeSeedState(value: unknown): PracticeSeedState {
  if (typeof value !== 'object' || value === null) {
    return createDefaultPracticeSeedState()
  }
  const record = value as Record<string, unknown>
  return {
    go: normalizeCounter(record.go),
    og: normalizeCounter(record.og),
  }
}

export function advancePracticeSeedState(state: unknown, mode: PracticeSeedMode): PracticeSeedState {
  const normalized = normalizePracticeSeedState(state)
  return {
    ...normalized,
    [mode]: normalized[mode] + 1,
  }
}

export function mergePracticeSeedStates(left: unknown, right: unknown): PracticeSeedState {
  const leftState = normalizePracticeSeedState(left)
  const rightState = normalizePracticeSeedState(right)
  return {
    go: Math.max(leftState.go, rightState.go),
    og: Math.max(leftState.og, rightState.og),
  }
}

export function createAccountPracticeSeed(mode: PracticeSeedMode, userId: string | undefined, counter: number): number {
  if (!userId) {
    return normalizeCounter(counter)
  }
  return (hashString(`practice:${mode}:${userId}`) + normalizeCounter(counter)) >>> 0
}
