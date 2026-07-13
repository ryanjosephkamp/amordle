import {
  normalizeCompletedSoloDisplaySlots,
  type ResumeSlotCollection,
} from './resumeSlot'

export interface SoloCompletionDisplayStorage {
  readonly getItem: (key: string) => string | null
  readonly removeItem: (key: string) => void
  readonly setItem: (key: string, value: string) => void
}

interface SoloCompletionDisplayPayload {
  readonly owners: Record<string, unknown>
  readonly version: typeof SOLO_COMPLETION_DISPLAY_STORAGE_VERSION
}

export const SOLO_COMPLETION_DISPLAY_STORAGE_KEY = 'brrrdle:solo-completion-display:v1'
const SOLO_COMPLETION_DISPLAY_STORAGE_VERSION = 1

function getBrowserStorage(): SoloCompletionDisplayStorage | undefined {
  return typeof window === 'undefined' ? undefined : window.localStorage
}

function getOwnerCacheKey(ownerKey: string): string {
  if (ownerKey === 'guest' || ownerKey === 'unconfigured') {
    return ownerKey
  }

  let hash = 0x811c9dc5
  for (let index = 0; index < ownerKey.length; index += 1) {
    hash ^= ownerKey.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `owner-${hash.toString(36)}`
}

function parsePayload(rawValue: string | null): SoloCompletionDisplayPayload {
  if (!rawValue) {
    return { owners: {}, version: SOLO_COMPLETION_DISPLAY_STORAGE_VERSION }
  }

  try {
    const parsed: unknown = JSON.parse(rawValue)
    if (typeof parsed !== 'object' || parsed === null) {
      return { owners: {}, version: SOLO_COMPLETION_DISPLAY_STORAGE_VERSION }
    }
    const record = parsed as Record<string, unknown>
    const owners = typeof record.owners === 'object' && record.owners !== null
      ? record.owners as Record<string, unknown>
      : {}
    return { owners, version: SOLO_COMPLETION_DISPLAY_STORAGE_VERSION }
  } catch {
    return { owners: {}, version: SOLO_COMPLETION_DISPLAY_STORAGE_VERSION }
  }
}

function writePayload(payload: SoloCompletionDisplayPayload, storage: SoloCompletionDisplayStorage): void {
  if (Object.keys(payload.owners).length === 0) {
    storage.removeItem(SOLO_COMPLETION_DISPLAY_STORAGE_KEY)
    return
  }

  storage.setItem(SOLO_COMPLETION_DISPLAY_STORAGE_KEY, JSON.stringify(payload))
}

export function loadSoloCompletionDisplaySlots(
  ownerKey: string,
  storage: SoloCompletionDisplayStorage | undefined = getBrowserStorage(),
): ResumeSlotCollection {
  if (!storage) {
    return {}
  }

  const payload = parsePayload(storage.getItem(SOLO_COMPLETION_DISPLAY_STORAGE_KEY))
  return normalizeCompletedSoloDisplaySlots(payload.owners[getOwnerCacheKey(ownerKey)])
}

export function saveSoloCompletionDisplaySlots(
  ownerKey: string,
  slots: ResumeSlotCollection,
  storage: SoloCompletionDisplayStorage | undefined = getBrowserStorage(),
): void {
  if (!storage) {
    return
  }

  const payload = parsePayload(storage.getItem(SOLO_COMPLETION_DISPLAY_STORAGE_KEY))
  const ownerCacheKey = getOwnerCacheKey(ownerKey)
  const completedSlots = normalizeCompletedSoloDisplaySlots(slots)
  if (Object.keys(completedSlots).length === 0) {
    delete payload.owners[ownerCacheKey]
  } else {
    payload.owners[ownerCacheKey] = completedSlots
  }
  writePayload(payload, storage)
}

export function clearSoloCompletionDisplaySlots(
  ownerKey: string,
  storage: SoloCompletionDisplayStorage | undefined = getBrowserStorage(),
): void {
  if (!storage) {
    return
  }

  const payload = parsePayload(storage.getItem(SOLO_COMPLETION_DISPLAY_STORAGE_KEY))
  delete payload.owners[getOwnerCacheKey(ownerKey)]
  writePayload(payload, storage)
}
