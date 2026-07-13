import { describe, expect, it } from 'vitest'
import {
  EMPTY_NOTIFICATION_METADATA,
  NOTIFICATION_STORAGE_KEY,
  clearNotificationMetadata,
  loadNotificationMetadata,
  markNotificationDismissed,
  markNotificationRead,
  normalizeNotificationMetadataState,
  pruneNotificationMetadata,
  saveNotificationMetadata,
} from './notificationStorage'

function createStorage(initial: Record<string, string> = {}) {
  const records = new Map(Object.entries(initial))

  return {
    getItem: (key: string) => records.get(key) ?? null,
    removeItem: (key: string) => {
      records.delete(key)
    },
    setItem: (key: string, value: string) => {
      records.set(key, value)
    },
    snapshot: () => Object.fromEntries(records),
  }
}

describe('notification storage', () => {
  it('loads empty metadata without browser storage or valid data', () => {
    expect(loadNotificationMetadata(undefined)).toEqual(EMPTY_NOTIFICATION_METADATA)
    expect(loadNotificationMetadata(createStorage({
      [NOTIFICATION_STORAGE_KEY]: '{not-json',
    }))).toEqual(EMPTY_NOTIFICATION_METADATA)
  })

  it('normalizes records, drops corrupt entries, and deduplicates by id/fingerprint', () => {
    const normalized = normalizeNotificationMetadataState({
      records: [
        { fingerprint: 'turn-1', id: 'multiplayer:one:your-turn', readAt: '2026-06-14T01:00:00.000Z' },
        { fingerprint: 'turn-1', id: 'multiplayer:one:your-turn', dismissedAt: '2026-06-14T02:00:00.000Z' },
        { fingerprint: '', id: 'bad' },
        { fingerprint: 'missing-id' },
      ],
      version: 99,
    })

    expect(normalized).toEqual({
      records: [
        {
          dismissedAt: '2026-06-14T02:00:00.000Z',
          fingerprint: 'turn-1',
          id: 'multiplayer:one:your-turn',
          readAt: undefined,
        },
      ],
      version: 1,
    })
  })

  it('saves, reads, clears, and tolerates invalid metadata writes', () => {
    const storage = createStorage()

    saveNotificationMetadata({
      records: [{ fingerprint: 'daily-ready', id: 'daily:solo:ready', readAt: '2026-06-14T01:00:00.000Z' }],
      version: 1,
    }, storage)

    expect(loadNotificationMetadata(storage)).toEqual({
      records: [{ fingerprint: 'daily-ready', id: 'daily:solo:ready', readAt: '2026-06-14T01:00:00.000Z' }],
      version: 1,
    })

    clearNotificationMetadata(storage)

    expect(storage.snapshot()).toEqual({})
  })

  it('marks read and dismissed records without changing unrelated metadata', () => {
    const read = markNotificationRead(EMPTY_NOTIFICATION_METADATA, {
      fingerprint: 'turn-1',
      id: 'multiplayer:one:your-turn',
      readAt: '2026-06-14T01:00:00.000Z',
    })
    const dismissed = markNotificationDismissed(read, {
      dismissedAt: '2026-06-14T02:00:00.000Z',
      fingerprint: 'turn-1',
      id: 'multiplayer:one:your-turn',
    })

    expect(dismissed).toEqual({
      records: [
        {
          dismissedAt: '2026-06-14T02:00:00.000Z',
          fingerprint: 'turn-1',
          id: 'multiplayer:one:your-turn',
          readAt: '2026-06-14T01:00:00.000Z',
        },
      ],
      version: 1,
    })
    expect(markNotificationRead(dismissed, { fingerprint: '', id: '', readAt: '' })).toEqual(dismissed)
  })

  it('prunes metadata to active notification fingerprints and a safe limit', () => {
    const state = {
      records: [
        { fingerprint: 'keep-1', id: 'one' },
        { fingerprint: 'keep-2', id: 'two' },
        { fingerprint: 'drop', id: 'three' },
      ],
      version: 1 as const,
    }

    expect(pruneNotificationMetadata(state, [
      { fingerprint: 'keep-1', id: 'one' },
      { fingerprint: 'keep-2', id: 'two' },
    ], 1)).toEqual({
      records: [{ fingerprint: 'keep-1', id: 'one' }],
      version: 1,
    })
  })
})
