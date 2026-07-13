import type { BrrrdleSupabaseClient } from './supabaseClient'
import { mergeGuestProgressIntoCloud } from './guestTransfer'
import { createDefaultGuestProgress } from './storageSchema'
import { migrateGuestProgress } from './guestStorage'
import type { GuestProgressState } from './storageSchema'
import { createSyncStatus, type SyncStatusState } from './syncStatus'

export interface CloudProgressRecord {
  readonly progress: GuestProgressState
  readonly updatedAt: string
  readonly userId: string
}

export interface CloudProgressRepository {
  readonly download: (userId: string) => Promise<CloudProgressRecord | undefined>
  readonly upload: (record: CloudProgressRecord) => Promise<void>
}

export interface SyncGuestProgressInput {
  readonly isOnline: boolean
  readonly localProgress: GuestProgressState
  readonly localUpdatedAt: string
  readonly repository: CloudProgressRepository
  readonly userId: string
}

export interface SyncGuestProgressResult {
  readonly progress: GuestProgressState
  readonly status: SyncStatusState
}

export type SyncAuthenticatedProgressInput = SyncGuestProgressInput

export type SyncAuthenticatedProgressResult = SyncGuestProgressResult

export function createSupabaseProgressRepository(client: BrrrdleSupabaseClient): CloudProgressRepository {
  return {
    async download(userId) {
      const { data, error } = await client
        .from('progress_snapshots')
        .select('progress, updated_at, user_id')
        .eq('user_id', userId)
        .maybeSingle()

      if (error || !data) {
        return undefined
      }

      return {
        progress: migrateGuestProgress(data.progress) ?? createDefaultGuestProgress(),
        updatedAt: String(data.updated_at),
        userId: String(data.user_id),
      }
    },
    async upload(record) {
      const { error } = await client
        .from('progress_snapshots')
        .upsert({ progress: record.progress, updated_at: record.updatedAt, user_id: record.userId })

      if (error) {
        throw new Error(error.message)
      }
    },
  }
}

export async function syncGuestProgress(input: SyncGuestProgressInput): Promise<SyncGuestProgressResult> {
  if (!input.isOnline) {
    return { progress: input.localProgress, status: createSyncStatus('offline') }
  }

  try {
    const cloud = await input.repository.download(input.userId)
    if (!cloud) {
      await input.repository.upload({ progress: input.localProgress, updatedAt: input.localUpdatedAt, userId: input.userId })
      return { progress: input.localProgress, status: createSyncStatus('synced') }
    }

    const cloudIsNewer = cloud.updatedAt.localeCompare(input.localUpdatedAt) > 0
    const progress = cloudIsNewer ? mergeGuestProgressIntoCloud(input.localProgress, cloud.progress) : mergeGuestProgressIntoCloud(cloud.progress, input.localProgress)
    await input.repository.upload({ progress, updatedAt: new Date().toISOString(), userId: input.userId })

    return { progress, status: createSyncStatus(cloudIsNewer ? 'conflict' : 'synced') }
  } catch {
    return { progress: input.localProgress, status: createSyncStatus('error') }
  }
}

export async function syncAuthenticatedProgress(input: SyncAuthenticatedProgressInput): Promise<SyncAuthenticatedProgressResult> {
  return syncGuestProgress(input)
}
