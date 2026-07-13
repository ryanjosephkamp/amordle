export const NOTIFICATION_STORAGE_KEY = 'brrrdle:notifications:v1'
export const NOTIFICATION_METADATA_VERSION = 1

export interface NotificationMetadataRecord {
  readonly id: string
  readonly fingerprint: string
  readonly readAt?: string
  readonly dismissedAt?: string
}

export interface NotificationMetadataState {
  readonly version: typeof NOTIFICATION_METADATA_VERSION
  readonly records: readonly NotificationMetadataRecord[]
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export const EMPTY_NOTIFICATION_METADATA: NotificationMetadataState = {
  records: [],
  version: NOTIFICATION_METADATA_VERSION,
}

function getDefaultStorage(): StorageLike | undefined {
  return typeof window === 'undefined' ? undefined : window.localStorage
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function normalizeOptionalTimestamp(value: unknown): string | undefined {
  return isNonEmptyString(value) ? value : undefined
}

function normalizeRecord(value: unknown): NotificationMetadataRecord | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }

  const record = value as Record<string, unknown>
  if (!isNonEmptyString(record.id) || !isNonEmptyString(record.fingerprint)) {
    return undefined
  }

  return {
    dismissedAt: normalizeOptionalTimestamp(record.dismissedAt),
    fingerprint: record.fingerprint,
    id: record.id,
    readAt: normalizeOptionalTimestamp(record.readAt),
  }
}

export function normalizeNotificationMetadataState(value: unknown): NotificationMetadataState {
  if (typeof value !== 'object' || value === null) {
    return EMPTY_NOTIFICATION_METADATA
  }

  const record = value as Record<string, unknown>
  if (!Array.isArray(record.records)) {
    return EMPTY_NOTIFICATION_METADATA
  }

  const recordsByKey = new Map<string, NotificationMetadataRecord>()
  for (const entry of record.records) {
    const normalized = normalizeRecord(entry)
    if (normalized) {
      recordsByKey.set(`${normalized.id}:${normalized.fingerprint}`, normalized)
    }
  }

  return {
    records: Array.from(recordsByKey.values()),
    version: NOTIFICATION_METADATA_VERSION,
  }
}

export function loadNotificationMetadata(
  storage: StorageLike | undefined = getDefaultStorage(),
): NotificationMetadataState {
  if (!storage) {
    return EMPTY_NOTIFICATION_METADATA
  }

  const raw = storage.getItem(NOTIFICATION_STORAGE_KEY)
  if (!raw) {
    return EMPTY_NOTIFICATION_METADATA
  }

  try {
    return normalizeNotificationMetadataState(JSON.parse(raw))
  } catch {
    return EMPTY_NOTIFICATION_METADATA
  }
}

export function saveNotificationMetadata(
  state: NotificationMetadataState,
  storage: StorageLike | undefined = getDefaultStorage(),
): void {
  if (!storage) {
    return
  }

  try {
    const normalized = normalizeNotificationMetadataState(state)
    storage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    // Notification metadata is local UI state only; failures must never affect gameplay.
  }
}

function upsertMetadataRecord(
  state: NotificationMetadataState,
  record: NotificationMetadataRecord,
): NotificationMetadataState {
  const normalized = normalizeNotificationMetadataState(state)
  const records = normalized.records.filter((entry) => (
    entry.id !== record.id || entry.fingerprint !== record.fingerprint
  ))

  return {
    records: [record, ...records],
    version: NOTIFICATION_METADATA_VERSION,
  }
}

export function markNotificationRead(
  state: NotificationMetadataState,
  input: {
    readonly id: string
    readonly fingerprint: string
    readonly readAt: string
  },
): NotificationMetadataState {
  if (!isNonEmptyString(input.id) || !isNonEmptyString(input.fingerprint) || !isNonEmptyString(input.readAt)) {
    return normalizeNotificationMetadataState(state)
  }

  const existing = normalizeNotificationMetadataState(state).records.find((record) => (
    record.id === input.id && record.fingerprint === input.fingerprint
  ))

  return upsertMetadataRecord(state, {
    dismissedAt: existing?.dismissedAt,
    fingerprint: input.fingerprint,
    id: input.id,
    readAt: input.readAt,
  })
}

export function markNotificationDismissed(
  state: NotificationMetadataState,
  input: {
    readonly id: string
    readonly fingerprint: string
    readonly dismissedAt: string
  },
): NotificationMetadataState {
  if (!isNonEmptyString(input.id) || !isNonEmptyString(input.fingerprint) || !isNonEmptyString(input.dismissedAt)) {
    return normalizeNotificationMetadataState(state)
  }

  const existing = normalizeNotificationMetadataState(state).records.find((record) => (
    record.id === input.id && record.fingerprint === input.fingerprint
  ))

  return upsertMetadataRecord(state, {
    dismissedAt: input.dismissedAt,
    fingerprint: input.fingerprint,
    id: input.id,
    readAt: existing?.readAt,
  })
}

export function pruneNotificationMetadata(
  state: NotificationMetadataState,
  activeFingerprints: readonly Pick<NotificationMetadataRecord, 'fingerprint' | 'id'>[],
  limit = 100,
): NotificationMetadataState {
  const activeKeys = new Set(activeFingerprints.map((record) => `${record.id}:${record.fingerprint}`))
  const normalized = normalizeNotificationMetadataState(state)
  const maxRecords = Math.max(0, limit)

  return {
    records: normalized.records
      .filter((record) => activeKeys.has(`${record.id}:${record.fingerprint}`))
      .slice(0, maxRecords),
    version: NOTIFICATION_METADATA_VERSION,
  }
}

export function clearNotificationMetadata(storage: StorageLike | undefined = getDefaultStorage()): void {
  if (!storage) {
    return
  }

  try {
    storage.removeItem(NOTIFICATION_STORAGE_KEY)
  } catch {
    // Best-effort local UI cleanup only.
  }
}
