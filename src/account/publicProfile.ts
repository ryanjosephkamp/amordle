import type { BrrrdleSupabaseClient } from './supabaseClient'
import {
  PROFILE_ACCENT_COLORS,
  PROFILE_DISPLAY_NAME_ALLOWED_CHARACTERS_DESCRIPTION,
  PROFILE_DISPLAY_NAME_MAX_LENGTH,
  normalizePlayerDisplayName,
  type ProfileAccentColor,
} from './profile'

export const PUBLIC_PROFILE_BIO_MAX_LENGTH = 160
export const PUBLIC_PROFILE_AVATAR_URL_MAX_LENGTH = 2048
export const PUBLIC_PROFILE_FLAIR_KEYS = ['none'] as const
export const PUBLIC_PROFILE_VISIBILITIES = ['private', 'public'] as const

export type PublicProfileFlairKey = (typeof PUBLIC_PROFILE_FLAIR_KEYS)[number]
export type PublicProfileVisibility = (typeof PUBLIC_PROFILE_VISIBILITIES)[number]

export interface OwnerPublicProfile {
  readonly accentColor: ProfileAccentColor
  readonly avatarUrl?: string
  readonly bio?: string
  readonly createdAt: string
  readonly displayName?: string
  readonly flairKey: PublicProfileFlairKey
  readonly moderationStatus: 'active' | 'hidden' | 'suspended'
  readonly publicProfileId: string
  readonly updatedAt: string
  readonly visibility: PublicProfileVisibility
}

export interface PublicPlayerProfile {
  readonly accentColor: ProfileAccentColor
  readonly avatarUrl?: string
  readonly bio?: string
  readonly createdAt: string
  readonly displayName: string
  readonly flairKey: PublicProfileFlairKey
  readonly publicProfileId: string
  readonly updatedAt: string
}

export interface PublicProfileUpdateInput {
  readonly accentColor?: ProfileAccentColor | string
  readonly avatarUrl?: string
  readonly bio?: string
  readonly displayName?: string
  readonly flairKey?: PublicProfileFlairKey | string
  readonly visibility?: PublicProfileVisibility | string
}

export type PublicProfileUpdateResult =
  | { readonly ok: true; readonly value: Required<Pick<PublicProfileUpdateInput, 'accentColor' | 'flairKey' | 'visibility'>> & Pick<PublicProfileUpdateInput, 'avatarUrl' | 'bio' | 'displayName'> }
  | { readonly message: string; readonly ok: false }

export interface PublicProfileRepository {
  readonly loadMine: () => Promise<OwnerPublicProfile | undefined>
  readonly saveMine: (input: PublicProfileUpdateInput, userId?: string) => Promise<OwnerPublicProfile>
  readonly loadPublicProfile: (publicProfileId: string) => Promise<PublicPlayerProfile | undefined>
  readonly loadPublicProfiles: (publicProfileIds: readonly string[]) => Promise<readonly PublicPlayerProfile[]>
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

const FORBIDDEN_PUBLIC_PROFILE_KEYS = new Set([
  'app_metadata',
  'auth_id',
  'daily_claims',
  'email',
  'game_history',
  'match_id',
  'metadata',
  'progress',
  'progress_snapshots',
  'queue_id',
  'rating',
  'rating_transaction_id',
  'raw_app_meta_data',
  'raw_user_meta_data',
  'seed',
  'seeds',
  'serialized_session',
  'service_id',
  'session',
  'settings',
  'token',
  'tokens',
  'user_id',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

export function normalizePublicProfileId(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return UUID_PATTERN.test(trimmed) ? trimmed : undefined
}

function normalizePlainText(candidate: unknown, maxLength: number): string | undefined {
  if (typeof candidate !== 'string') {
    return undefined
  }
  const trimmed = candidate.trim()
  if (!trimmed) {
    return undefined
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/u.test(trimmed)) {
    return undefined
  }
  return trimmed.length <= maxLength ? trimmed : undefined
}

export function normalizePublicProfileDisplayName(candidate: unknown): string | undefined {
  return normalizePlayerDisplayName(candidate)
}

export function normalizePublicProfileBio(candidate: unknown): string | undefined {
  return normalizePlainText(candidate, PUBLIC_PROFILE_BIO_MAX_LENGTH)
}

export function normalizePublicProfileVisibility(candidate: unknown): PublicProfileVisibility {
  const value = typeof candidate === 'string' ? candidate.trim().toLowerCase() : ''
  return (PUBLIC_PROFILE_VISIBILITIES as readonly string[]).includes(value)
    ? value as PublicProfileVisibility
    : 'private'
}

export function normalizePublicProfileAccentColor(candidate: unknown): ProfileAccentColor | undefined {
  const value = typeof candidate === 'string' ? candidate.trim().toLowerCase() : ''
  return (PROFILE_ACCENT_COLORS as readonly string[]).includes(value)
    ? value as ProfileAccentColor
    : undefined
}

export function normalizePublicProfileFlairKey(candidate: unknown): PublicProfileFlairKey | undefined {
  const value = typeof candidate === 'string' ? candidate.trim().toLowerCase() : ''
  return (PUBLIC_PROFILE_FLAIR_KEYS as readonly string[]).includes(value)
    ? value as PublicProfileFlairKey
    : undefined
}

export function normalizePublicProfileAvatarUrl(candidate: unknown, userId?: string): string | undefined {
  if (typeof candidate !== 'string') {
    return undefined
  }
  const trimmed = candidate.trim()
  if (!trimmed) {
    return undefined
  }
  if (trimmed.length > PUBLIC_PROFILE_AVATAR_URL_MAX_LENGTH || !trimmed.startsWith('https://')) {
    return undefined
  }
  if (userId) {
    const compactUserId = userId.replaceAll('-', '')
    if (trimmed.includes(userId) || (compactUserId && trimmed.includes(compactUserId))) {
      return undefined
    }
  }
  return trimmed
}

export function normalizePublicProfileUpdateInput(
  input: PublicProfileUpdateInput,
  userId?: string,
): PublicProfileUpdateResult {
  const visibility = normalizePublicProfileVisibility(input.visibility)
  const displayName = normalizePublicProfileDisplayName(input.displayName)
  if (input.displayName !== undefined && input.displayName.trim() !== '' && !displayName) {
    return {
      message: `Player name must be 1-${PROFILE_DISPLAY_NAME_MAX_LENGTH} characters using ${PROFILE_DISPLAY_NAME_ALLOWED_CHARACTERS_DESCRIPTION}. Emoji, control characters, and symbols are not supported.`,
      ok: false,
    }
  }
  if (visibility === 'public' && !displayName) {
    return { message: 'Add a Player name before saving your player profile.', ok: false }
  }

  const accentColor = normalizePublicProfileAccentColor(input.accentColor) ?? 'ice'
  const flairKey = normalizePublicProfileFlairKey(input.flairKey) ?? 'none'

  const avatarUrl = normalizePublicProfileAvatarUrl(input.avatarUrl, userId)
  if (input.avatarUrl !== undefined && input.avatarUrl.trim() !== '' && !avatarUrl) {
    return { message: 'Public avatar URL must be an https URL and cannot contain your raw account id.', ok: false }
  }

  const bio = normalizePublicProfileBio(input.bio)
  if (input.bio !== undefined && input.bio.trim() !== '' && !bio) {
    return { message: `Bio must be ${PUBLIC_PROFILE_BIO_MAX_LENGTH} plain-text characters or fewer.`, ok: false }
  }

  return {
    ok: true,
    value: {
      accentColor,
      avatarUrl,
      bio,
      displayName,
      flairKey,
      visibility,
    },
  }
}

function hasForbiddenKeys(record: Record<string, unknown>): boolean {
  return Object.keys(record).some((key) => FORBIDDEN_PUBLIC_PROFILE_KEYS.has(key))
}

function parseTimestamp(record: Record<string, unknown>, key: string): string | undefined {
  const value = getString(record, key)
  return value && !Number.isNaN(Date.parse(value)) ? value : undefined
}

function parsePublicProfileId(record: Record<string, unknown>): string | undefined {
  return normalizePublicProfileId(getString(record, 'public_profile_id'))
}

export function parseOwnerPublicProfileDto(value: unknown): OwnerPublicProfile | undefined {
  if (!isRecord(value) || hasForbiddenKeys(value)) {
    return undefined
  }

  const publicProfileId = parsePublicProfileId(value)
  const visibility = getString(value, 'visibility')
  const accentColor = normalizePublicProfileAccentColor(getString(value, 'accent_color'))
  const flairKey = normalizePublicProfileFlairKey(getString(value, 'flair_key'))
  const moderationStatus = getString(value, 'moderation_status')
  const createdAt = parseTimestamp(value, 'created_at')
  const updatedAt = parseTimestamp(value, 'updated_at')
  if (
    !publicProfileId
    || !visibility
    || !(PUBLIC_PROFILE_VISIBILITIES as readonly string[]).includes(visibility)
    || !accentColor
    || !flairKey
    || !moderationStatus
    || !['active', 'hidden', 'suspended'].includes(moderationStatus)
    || !createdAt
    || !updatedAt
  ) {
    return undefined
  }

  const displayName = normalizePublicProfileDisplayName(value.display_name)
  if (value.display_name !== null && value.display_name !== undefined && !displayName) {
    return undefined
  }
  const avatarUrl = normalizePublicProfileAvatarUrl(value.avatar_url)
  if (value.avatar_url !== null && value.avatar_url !== undefined && !avatarUrl) {
    return undefined
  }
  const bio = normalizePublicProfileBio(value.bio)
  if (value.bio !== null && value.bio !== undefined && !bio) {
    return undefined
  }

  return {
    accentColor,
    avatarUrl,
    bio,
    createdAt,
    displayName,
    flairKey,
    moderationStatus: moderationStatus as OwnerPublicProfile['moderationStatus'],
    publicProfileId,
    updatedAt,
    visibility: visibility as PublicProfileVisibility,
  }
}

export function parsePublicPlayerProfileDto(value: unknown): PublicPlayerProfile | undefined {
  if (!isRecord(value) || hasForbiddenKeys(value)) {
    return undefined
  }

  const publicProfileId = parsePublicProfileId(value)
  const displayName = normalizePublicProfileDisplayName(value.display_name)
  const accentColor = normalizePublicProfileAccentColor(getString(value, 'accent_color'))
  const flairKey = normalizePublicProfileFlairKey(getString(value, 'flair_key'))
  const createdAt = parseTimestamp(value, 'created_at')
  const updatedAt = parseTimestamp(value, 'updated_at')
  if (!publicProfileId || !displayName || !accentColor || !flairKey || !createdAt || !updatedAt) {
    return undefined
  }

  const avatarUrl = normalizePublicProfileAvatarUrl(value.avatar_url)
  if (value.avatar_url !== null && value.avatar_url !== undefined && !avatarUrl) {
    return undefined
  }
  const bio = normalizePublicProfileBio(value.bio)
  if (value.bio !== null && value.bio !== undefined && !bio) {
    return undefined
  }

  return {
    accentColor,
    avatarUrl,
    bio,
    createdAt,
    displayName,
    flairKey,
    publicProfileId,
    updatedAt,
  }
}

function firstParsedRow<T>(value: unknown, parser: (row: unknown) => T | undefined): T | undefined {
  if (!Array.isArray(value)) {
    return parser(value)
  }
  for (const row of value) {
    const parsed = parser(row)
    if (parsed) {
      return parsed
    }
  }
  return undefined
}

function parsePublicRows(value: unknown): readonly PublicPlayerProfile[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((row) => parsePublicPlayerProfileDto(row) ?? [])
}

function uniqueValidPublicProfileIds(publicProfileIds: readonly string[]): readonly string[] {
  const seen = new Set<string>()
  const ids: string[] = []
  for (const id of publicProfileIds) {
    const trimmed = id.trim()
    if (!UUID_PATTERN.test(trimmed) || seen.has(trimmed)) {
      continue
    }
    seen.add(trimmed)
    ids.push(trimmed)
    if (ids.length >= 100) {
      break
    }
  }
  return ids
}

export function createSupabasePublicProfileRepository(client: BrrrdleSupabaseClient): PublicProfileRepository {
  return {
    async loadMine() {
      const { data, error } = await client.rpc('get_my_public_player_profile')
      if (error) {
        return undefined
      }
      return firstParsedRow(data, parseOwnerPublicProfileDto)
    },
    async saveMine(input, userId) {
      const normalized = normalizePublicProfileUpdateInput(input, userId)
      if (!normalized.ok) {
        throw new Error(normalized.message)
      }
      const { data, error } = await client.rpc('upsert_my_public_player_profile', {
        p_accent_color: normalized.value.accentColor,
        p_avatar_url: normalized.value.avatarUrl ?? null,
        p_bio: normalized.value.bio ?? null,
        p_display_name: normalized.value.displayName ?? null,
        p_flair_key: normalized.value.flairKey,
        p_visibility: normalized.value.visibility,
      })
      if (error) {
        throw new Error('Unable to save public profile.')
      }
      const parsed = firstParsedRow(data, parseOwnerPublicProfileDto)
      if (!parsed) {
        throw new Error('Unable to parse public profile response.')
      }
      return parsed
    },
    async loadPublicProfile(publicProfileId) {
      const trimmed = normalizePublicProfileId(publicProfileId)
      if (!trimmed) {
        return undefined
      }
      const { data, error } = await client.rpc('get_public_player_profile', {
        p_public_profile_id: trimmed,
      })
      if (error) {
        return undefined
      }
      return firstParsedRow(data, parsePublicPlayerProfileDto)
    },
    async loadPublicProfiles(publicProfileIds) {
      const ids = uniqueValidPublicProfileIds(publicProfileIds)
      if (ids.length === 0) {
        return []
      }
      const { data, error } = await client.rpc('get_public_player_profiles', {
        p_public_profile_ids: ids,
      })
      if (error) {
        return []
      }
      return parsePublicRows(data)
    },
  }
}
