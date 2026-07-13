import type { GameMode, PlayScope } from '../game/types'

export type CustomGameLobbyStatus = 'waiting' | 'matched' | 'expired' | 'cancelled'

export interface CustomGameLobby {
  readonly code: string
  readonly createdAt: string
  readonly createdByUserId?: string
  readonly expiresAt: string
  readonly id: string
  readonly mode: GameMode
  readonly ranked: boolean
  readonly scope: PlayScope
  readonly status: CustomGameLobbyStatus
  readonly wordLength?: number
}

export interface CreateCustomGameLobbyInput {
  readonly code?: string
  readonly createdAt?: string
  readonly createdByUserId?: string
  readonly expiresAt?: string
  readonly id?: string
  readonly mode: GameMode
  readonly ranked?: boolean
  readonly scope: PlayScope
  readonly wordLength?: number
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function createCustomGameCode(seed = Date.now()): string {
  return Math.abs(Math.trunc(seed)).toString(36).padStart(6, '0').slice(-6).toUpperCase()
}

export function createCustomGameLobby(input: CreateCustomGameLobbyInput): CustomGameLobby {
  const createdAt = input.createdAt ?? new Date().toISOString()
  const expiresAt = input.expiresAt ?? new Date(Date.parse(createdAt) + 24 * 60 * 60 * 1000).toISOString()
  return {
    code: input.code ?? createCustomGameCode(Date.parse(createdAt)),
    createdAt,
    createdByUserId: input.createdByUserId,
    expiresAt,
    id: input.id ?? createId(`custom-multiplayer-${input.mode}`),
    mode: input.mode,
    ranked: input.ranked === true,
    scope: input.scope,
    status: 'waiting',
    wordLength: input.wordLength,
  }
}

export function normalizeCustomGameLobby(value: unknown): CustomGameLobby | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  const record = value as Record<string, unknown>
  if (
    typeof record.id !== 'string'
    || typeof record.code !== 'string'
    || (record.mode !== 'og' && record.mode !== 'go')
    || (record.scope !== 'practice' && record.scope !== 'daily')
  ) {
    return undefined
  }
  return {
    code: record.code.toUpperCase(),
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : new Date(0).toISOString(),
    createdByUserId: typeof record.createdByUserId === 'string' ? record.createdByUserId : undefined,
    expiresAt: typeof record.expiresAt === 'string' ? record.expiresAt : new Date(0).toISOString(),
    id: record.id,
    mode: record.mode,
    ranked: record.ranked === true,
    scope: record.scope,
    status: record.status === 'matched' || record.status === 'expired' || record.status === 'cancelled' ? record.status : 'waiting',
    wordLength: typeof record.wordLength === 'number' ? Math.trunc(record.wordLength) : undefined,
  }
}
