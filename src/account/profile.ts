/**
 * Phase 15.1 — Pure profile helpers.
 *
 * No Supabase client, no React, no I/O. These helpers derive display values
 * (initials, accent color, gradient) from a Supabase user's metadata so that
 * the UI can render an avatar + display name on every route without ever
 * hitting the network.
 */

export const PROFILE_DISPLAY_NAME_MAX_LENGTH = 50
export const PROFILE_DISPLAY_NAME_ALLOWED_CHARACTERS_DESCRIPTION =
  'letters, numbers, spaces, apostrophes, periods, underscores, or hyphens'

/**
 * Allow-listed accent colors. Stored as user_metadata.accent_color. The UI
 * maps these to icy palette tokens; storing the slug (not a raw hex) keeps
 * the data forward-compatible with future theme changes.
 */
export const PROFILE_ACCENT_COLORS = ['ice', 'aurora', 'cyan', 'violet', 'rose', 'amber'] as const
export type ProfileAccentColor = (typeof PROFILE_ACCENT_COLORS)[number]
export const DEFAULT_PROFILE_ACCENT_COLOR: ProfileAccentColor = 'ice'

export const PROFILE_ACCENT_AVATAR_BACKGROUNDS: Record<ProfileAccentColor, string> = {
  amber: 'from-amber-300 to-orange-700',
  aurora: 'from-emerald-300 to-teal-700',
  cyan: 'from-sky-400 to-cyan-700',
  ice: 'from-cyan-300 to-sky-600',
  rose: 'from-rose-300 to-pink-700',
  violet: 'from-violet-400 to-indigo-700',
}

export function getProfileAccentAvatarBackground(
  accentColor: ProfileAccentColor = DEFAULT_PROFILE_ACCENT_COLOR,
): string {
  return PROFILE_ACCENT_AVATAR_BACKGROUNDS[accentColor]
}

/**
 * Maximum size (in bytes) for an avatar data URL fallback when no Supabase
 * Storage bucket exists. Keep tight so we never bloat user_metadata.
 */
export const PROFILE_AVATAR_MAX_BYTES = 200 * 1024 // 200 KB

/** Deterministic gradient seeds for the initials avatar (Tailwind-friendly). */
const INITIALS_GRADIENTS: readonly string[] = [
  'from-cyan-500 to-sky-700',
  'from-fuchsia-500 to-violet-700',
  'from-emerald-500 to-teal-700',
  'from-amber-500 to-orange-700',
  'from-rose-500 to-pink-700',
  'from-indigo-500 to-blue-700',
  'from-lime-500 to-emerald-700',
  'from-purple-500 to-indigo-700',
]

/**
 * Returns the initials to render in the avatar circle. Prefers the display
 * name, falls back to the email local-part, then to a stable placeholder.
 */
export function deriveInitials(source: { readonly displayName?: string; readonly email?: string }): string {
  const rawCandidate = source.displayName?.trim() || source.email?.trim() || ''
  if (!rawCandidate) {
    return '?'
  }
  // For emails, only consider the local-part (before the first @) so that
  // "first.last@example.com" → "FL", not "FC" (com).
  const atIndex = !source.displayName && rawCandidate.includes('@')
    ? rawCandidate.indexOf('@')
    : -1
  const candidate = atIndex > 0 ? rawCandidate.slice(0, atIndex) : rawCandidate
  // Split on whitespace, dash, dot, or underscore for "first.last" style emails.
  const parts = candidate
    .split(/[\s._-]+/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  if (parts.length === 0) {
    return candidate.charAt(0).toLocaleUpperCase()
  }
  if (parts.length === 1) {
    return parts[0]!.charAt(0).toLocaleUpperCase()
  }
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toLocaleUpperCase()
}

const UNSAFE_PLAYER_NAME_CHARACTERS_PATTERN = /[\p{Cc}\p{Cf}\p{Co}\p{Cs}]/u
const PLAYER_NAME_ALLOWED_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}\p{M} ._'-]*$/u
const PLAYER_NAME_HAS_WORD_CHARACTER_PATTERN = /[\p{L}\p{N}]/u

export function getPlayerDisplayNameValidationMessage(
  candidate: unknown,
  label = 'Player name',
): string | undefined {
  if (typeof candidate !== 'string') {
    return `${label} must be text.`
  }
  const trimmed = candidate.trim()
  if (!trimmed || trimmed.length > PROFILE_DISPLAY_NAME_MAX_LENGTH) {
    return `${label} must be 1-${PROFILE_DISPLAY_NAME_MAX_LENGTH} characters.`
  }
  if (
    UNSAFE_PLAYER_NAME_CHARACTERS_PATTERN.test(trimmed)
    || !PLAYER_NAME_HAS_WORD_CHARACTER_PATTERN.test(trimmed)
    || !PLAYER_NAME_ALLOWED_PATTERN.test(trimmed)
  ) {
    return `${label} can use ${PROFILE_DISPLAY_NAME_ALLOWED_CHARACTERS_DESCRIPTION}. Emoji, control characters, and symbols are not supported.`
  }
  return undefined
}

/**
 * Trims a candidate player name after applying the shared safe-name policy.
 * Returns undefined for empty or unsafe values so callers can fall back
 * without saving unsupported identity text.
 */
export function normalizePlayerDisplayName(candidate: unknown): string | undefined {
  if (getPlayerDisplayNameValidationMessage(candidate) !== undefined) {
    return undefined
  }
  return (candidate as string).trim().replace(/ +/gu, ' ')
}

export function normalizeDisplayName(candidate: unknown): string | undefined {
  return normalizePlayerDisplayName(candidate)
}

export function validateAccentColor(candidate: unknown): ProfileAccentColor {
  return typeof candidate === 'string' && (PROFILE_ACCENT_COLORS as readonly string[]).includes(candidate)
    ? (candidate as ProfileAccentColor)
    : DEFAULT_PROFILE_ACCENT_COLOR
}

/**
 * Validates an avatar URL candidate. Accepts:
 *   - https URLs (intended for Supabase Storage public/sign URLs)
 *   - data URLs under PROFILE_AVATAR_MAX_BYTES when no Storage is configured
 * Rejects everything else (no javascript:, no http:, no relative).
 */
export function validateAvatarUrl(candidate: unknown): string | undefined {
  if (typeof candidate !== 'string') {
    return undefined
  }
  const trimmed = candidate.trim()
  if (!trimmed) {
    return undefined
  }
  if (trimmed.startsWith('https://')) {
    return trimmed
  }
  if (trimmed.startsWith('data:image/')) {
    // Rough size cap based on the raw string length (base64 + header).
    if (trimmed.length > PROFILE_AVATAR_MAX_BYTES * 2) {
      return undefined
    }
    return trimmed
  }
  return undefined
}

/**
 * Stable gradient key for the initials avatar. Same id → same gradient,
 * which keeps the avatar visually steady across reloads.
 */
export function pickInitialsGradient(seed: string): string {
  if (!seed) {
    return INITIALS_GRADIENTS[0]!
  }
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return INITIALS_GRADIENTS[hash % INITIALS_GRADIENTS.length]!
}

export interface DerivedProfile {
  readonly accentColor: ProfileAccentColor
  readonly avatarUrl?: string
  readonly displayName?: string
  readonly gradient: string
  readonly initials: string
  /** Email or '' if absent — never undefined to keep render code simple. */
  readonly email: string
  /** A non-empty label suitable for the AccountBadge: name → email → 'Account'. */
  readonly label: string
}

interface UserLike {
  readonly id?: string
  readonly email?: string
  readonly user_metadata?: Record<string, unknown> | null
}

/**
 * Builds a DerivedProfile from a Supabase User (or User-like summary).
 * Pure: no Supabase calls, safe to use in tests and SSR.
 */
export function deriveProfileFromUser(user: UserLike): DerivedProfile {
  const metadata = (user.user_metadata && typeof user.user_metadata === 'object' ? user.user_metadata : {}) as Record<string, unknown>
  const displayName = normalizeDisplayName(
    metadata.display_name ?? metadata.displayName ?? metadata.full_name ?? metadata.name,
  )
  const accentColor = validateAccentColor(metadata.accent_color ?? metadata.accentColor)
  const avatarUrl = validateAvatarUrl(metadata.avatar_url ?? metadata.avatarUrl ?? metadata.picture)
  const email = typeof user.email === 'string' ? user.email : ''
  const initials = deriveInitials({ displayName, email })
  const gradient = pickInitialsGradient(user.id ?? email ?? initials)
  const label = displayName || email || 'Account'
  return { accentColor, avatarUrl, displayName, email, gradient, initials, label }
}
