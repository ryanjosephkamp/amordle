import type { User } from '@supabase/supabase-js'
import type { BrrrdleSupabaseClient } from './supabaseClient'
import {
  deriveProfileFromUser,
  getPlayerDisplayNameValidationMessage,
  normalizeDisplayName,
  validateAccentColor,
  validateAvatarUrl,
  type DerivedProfile,
  type ProfileAccentColor,
} from './profile'

export interface AuthUserSummary {
  readonly email?: string
  readonly id: string
  readonly roles: readonly string[]
  /** Phase 15: derived profile (display name, initials, accent, avatar). */
  readonly profile?: DerivedProfile
}

export interface AuthState {
  readonly status: 'anonymous' | 'authenticated' | 'unconfigured'
  readonly user?: AuthUserSummary
}

function readRawAppMetaData(user: User): Record<string, unknown> | undefined {
  const candidate = (user as unknown as { readonly raw_app_meta_data?: unknown }).raw_app_meta_data
  return candidate && typeof candidate === 'object' ? (candidate as Record<string, unknown>) : undefined
}

function pickStringArray(value: unknown): readonly string[] | undefined {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
    ? (value as readonly string[])
    : undefined
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function getRoles(user: User): readonly string[] {
  const collected: string[] = []
  const seen = new Set<string>()
  const push = (value: string) => {
    if (!seen.has(value)) {
      seen.add(value)
      collected.push(value)
    }
  }

  const appMetadataRoles = pickStringArray(user.app_metadata?.roles)
  if (appMetadataRoles) {
    appMetadataRoles.forEach(push)
  } else {
    const appMetadataRole = pickString(user.app_metadata?.role)
    if (appMetadataRole) {
      push(appMetadataRole)
    }
  }

  const rawAppMetaData = readRawAppMetaData(user)
  if (rawAppMetaData) {
    const rawRoles = pickStringArray(rawAppMetaData.roles)
    if (rawRoles) {
      rawRoles.forEach(push)
    } else {
      const rawRole = pickString(rawAppMetaData.role)
      if (rawRole) {
        push(rawRole)
      }
    }
  }

  return collected
}

export function isAdminUser(user: User): boolean {
  return getRoles(user).includes('admin')
}

function authFailureMessage(action: 'sign-in' | 'sign-up'): string {
  return action === 'sign-in'
    ? 'Unable to sign in with those credentials. Check your email and password, then try again.'
    : 'Unable to create an account right now. Check the details and try again.'
}

export function summarizeUser(user: User): AuthUserSummary {
  return {
    email: user.email ?? undefined,
    id: user.id,
    roles: getRoles(user),
    profile: deriveProfileFromUser(user as unknown as { readonly id?: string; readonly email?: string; readonly user_metadata?: Record<string, unknown> | null }),
  }
}

export async function getCurrentAuthState(client: BrrrdleSupabaseClient | undefined): Promise<AuthState> {
  if (!client) {
    return { status: 'unconfigured' }
  }

  const { data, error } = await client.auth.getUser()
  if (error || !data.user) {
    return { status: 'anonymous' }
  }

  return { status: 'authenticated', user: summarizeUser(data.user) }
}

export async function sendMagicLink(client: BrrrdleSupabaseClient, email: string): Promise<{ readonly ok: true } | { readonly message: string; readonly ok: false }> {
  const normalizedEmail = email.trim().toLocaleLowerCase('en-US')
  const emailRedirectTo = getCurrentOriginRedirectTo()
  const { error } = await client.auth.signInWithOtp({
    email: normalizedEmail,
    ...(emailRedirectTo ? { options: { emailRedirectTo } } : {}),
  })
  return error ? { message: error.message, ok: false } : { ok: true }
}

export async function signInWithPassword(
  client: BrrrdleSupabaseClient,
  email: string,
  password: string,
): Promise<{ readonly ok: true } | { readonly message: string; readonly ok: false }> {
  const normalizedEmail = email.trim().toLocaleLowerCase('en-US')
  if (!normalizedEmail || !password) {
    return { message: 'Email and password are required.', ok: false }
  }
  const { error } = await client.auth.signInWithPassword({ email: normalizedEmail, password })
  if (error) {
    return { message: authFailureMessage('sign-in'), ok: false }
  }
  await refreshSessionBestEffort(client)
  return { ok: true }
}

export async function signUpWithPassword(
  client: BrrrdleSupabaseClient,
  email: string,
  password: string,
): Promise<{ readonly ok: true } | { readonly message: string; readonly ok: false }> {
  const normalizedEmail = email.trim().toLocaleLowerCase('en-US')
  if (!normalizedEmail || !password) {
    return { message: 'Email and password are required.', ok: false }
  }
  if (password.length < 8) {
    return { message: 'Password must be at least 8 characters.', ok: false }
  }
  const emailRedirectTo = getCurrentOriginRedirectTo()
  const { error } = await client.auth.signUp({
    email: normalizedEmail,
    password,
    ...(emailRedirectTo ? { options: { emailRedirectTo } } : {}),
  })
  if (error) {
    return { message: authFailureMessage('sign-up'), ok: false }
  }
  await refreshSessionBestEffort(client)
  return { ok: true }
}

async function refreshSessionBestEffort(client: BrrrdleSupabaseClient): Promise<void> {
  try {
    await client.auth.refreshSession()
  } catch {
    // Intentionally swallowed: a failed refresh must not surface as a sign-in failure or sign the user out.
  }
}

export type AuthChangeEventName = string

export type AuthChangeListener = (state: AuthState, event?: AuthChangeEventName) => void

export interface AuthSubscription {
  readonly unsubscribe: () => void
}

const ROLE_REFRESHING_EVENTS = new Set(['SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED'])

export function subscribeToAuthChanges(
  client: BrrrdleSupabaseClient | undefined,
  listener: AuthChangeListener,
): AuthSubscription {
  if (!client) {
    return { unsubscribe: () => undefined }
  }

  let pendingRefresh: Promise<void> | undefined

  const { data } = client.auth.onAuthStateChange((event, session) => {
    if (!session?.user) {
      listener({ status: 'anonymous' }, event)
      return
    }
    listener({ status: 'authenticated', user: summarizeUser(session.user) }, event)

    if (!ROLE_REFRESHING_EVENTS.has(event) || pendingRefresh) {
      return
    }

    pendingRefresh = (async () => {
      try {
        const fresh = await getCurrentAuthState(client)
        if (fresh.status === 'authenticated') {
          listener(fresh, event)
        }
      } catch {
        // Best-effort refresh: never surface to the UI; never log tokens.
      } finally {
        pendingRefresh = undefined
      }
    })()
  })

  return { unsubscribe: () => data.subscription.unsubscribe() }
}

// -----------------------------------------------------------------------------
// Phase 15.1 — Additive auth helpers (do not change existing behavior).
// -----------------------------------------------------------------------------

export type AuthErrorAction = 'sign-in' | 'sign-out' | 'sign-up' | 'magic-link' | 'reset-password' | 'update-password' | 'update-profile'

/**
 * Maps a Supabase error (or any unknown thrown value) into one of a closed set
 * of safe, user-facing strings. We never surface raw provider error text and
 * never log sensitive content.
 */
export function classifyAuthError(error: unknown, action: AuthErrorAction): string {
  const raw = typeof error === 'object' && error !== null && 'message' in (error as Record<string, unknown>)
    ? String((error as Record<string, unknown>).message ?? '').toLowerCase()
    : ''

  // Rate-limit hints come back as 429-ish copy.
  if (raw.includes('rate') || raw.includes('too many') || raw.includes('429')) {
    return 'Too many attempts — please wait a minute and try again.'
  }
  if (raw.includes('network') || raw.includes('fetch') || raw.includes('failed to send')) {
    return 'Network unavailable — please try again.'
  }
  if (raw.includes('already registered') || raw.includes('already exists') || raw.includes('user already')) {
    return 'That email is already registered. Try signing in instead.'
  }
  if (raw.includes('not confirmed') || raw.includes('confirm your email') || raw.includes('email not confirmed')) {
    return 'Please confirm your email before signing in.'
  }
  if (raw.includes('invalid login') || raw.includes('invalid credentials') || raw.includes('invalid email or password')) {
    return 'Email or password is incorrect.'
  }
  if (raw.includes('password') && raw.includes('short')) {
    return `Password must be at least 8 characters.`
  }
  if (raw.includes('weak password')) {
    return 'Please choose a stronger password.'
  }
  if (
    action === 'update-password'
    && raw.includes('password')
    && (
      raw.includes('same')
      || raw.includes('different')
      || raw.includes('old password')
      || raw.includes('current password')
    )
  ) {
    return 'Choose a new password that is different from your current password.'
  }
  if (raw.includes('invalid email')) {
    return 'That email address does not look valid.'
  }

  switch (action) {
    case 'sign-in':
      return 'Unable to sign in with those credentials. Check your email and password, then try again.'
    case 'sign-out':
      return 'Unable to sign out right now. Please try again.'
    case 'sign-up':
      return 'Unable to create an account right now. Check the details and try again.'
    case 'magic-link':
      return 'Unable to send a magic link right now. Please try again in a moment.'
    case 'reset-password':
      return 'Unable to send a reset link right now. Please try again in a moment.'
    case 'update-password':
      return 'Unable to update your password right now. Choose a different password and try again.'
    case 'update-profile':
      return 'Unable to save your profile right now. Please try again.'
  }
}

export async function signOut(client: BrrrdleSupabaseClient): Promise<{ readonly ok: true } | { readonly message: string; readonly ok: false }> {
  try {
    const { error } = await client.auth.signOut()
    return error ? { message: classifyAuthError(error, 'sign-out'), ok: false } : { ok: true }
  } catch (error) {
    return { message: classifyAuthError(error, 'sign-out'), ok: false }
  }
}

function getRedirectOrigin(): string | undefined {
  if (typeof window === 'undefined' || !window.location) {
    return undefined
  }
  return window.location.origin
}

function getCurrentOriginRedirectTo(): string | undefined {
  const origin = getRedirectOrigin()
  return origin && origin !== 'null' ? origin : undefined
}

function getPasswordResetRedirectTo(): string | undefined {
  if (typeof window === 'undefined' || !window.location) {
    return undefined
  }

  const url = new URL(window.location.href)
  url.hash = ''
  url.searchParams.set('auth_action', 'reset-password')
  return url.toString()
}

function getHashParams(hash: string): URLSearchParams {
  return new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
}

export interface PasswordResetLocationLike {
  readonly hash?: string
  readonly search?: string
}

export function isPasswordResetUrl(location: PasswordResetLocationLike = typeof window === 'undefined' ? {} : window.location): boolean {
  const query = new URLSearchParams(location.search ?? '')
  if (query.get('auth_action') === 'reset-password') {
    return true
  }

  const hashParams = getHashParams(location.hash ?? '')
  return hashParams.get('type') === 'recovery'
}

export function clearPasswordResetUrlMarker(): void {
  if (typeof window === 'undefined' || !window.history || !window.location) {
    return
  }

  const url = new URL(window.location.href)
  url.searchParams.delete('auth_action')
  url.hash = ''
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}`)
}

/**
 * Sends a Supabase password-reset email. Never surfaces the raw provider
 * error; the returned message is always safe to render directly.
 */
export async function sendPasswordResetEmail(
  client: BrrrdleSupabaseClient,
  email: string,
): Promise<{ readonly ok: true } | { readonly message: string; readonly ok: false }> {
  const normalizedEmail = email.trim().toLocaleLowerCase('en-US')
  if (!normalizedEmail) {
    return { message: 'Enter the email on your account first.', ok: false }
  }
  try {
    const redirectTo = getPasswordResetRedirectTo() ?? getRedirectOrigin()
    const { error } = await client.auth.resetPasswordForEmail(
      normalizedEmail,
      redirectTo ? { redirectTo } : undefined,
    )
    if (error) {
      return { message: classifyAuthError(error, 'reset-password'), ok: false }
    }
    return { ok: true }
  } catch (error) {
    return { message: classifyAuthError(error, 'reset-password'), ok: false }
  }
}

export async function updatePassword(
  client: BrrrdleSupabaseClient,
  password: string,
): Promise<{ readonly ok: true } | { readonly message: string; readonly ok: false }> {
  if (password.length < 8) {
    return { message: 'Password must be at least 8 characters.', ok: false }
  }
  try {
    const { error } = await client.auth.updateUser({ password })
    if (error) {
      return { message: classifyAuthError(error, 'update-password'), ok: false }
    }
    return { ok: true }
  } catch (error) {
    return { message: classifyAuthError(error, 'update-password'), ok: false }
  }
}

export interface ProfileUpdateInput {
  readonly accentColor?: ProfileAccentColor | string
  readonly avatarUrl?: string
  readonly displayName?: string
}

/**
 * Updates the authenticated user's profile via supabase.auth.updateUser.
 * Only validated fields are forwarded; everything else is dropped silently
 * so a buggy caller can never overwrite arbitrary user_metadata.
 */
export async function updateProfile(
  client: BrrrdleSupabaseClient,
  input: ProfileUpdateInput,
): Promise<{ readonly ok: true } | { readonly message: string; readonly ok: false }> {
  const data: Record<string, unknown> = {}

  if (input.displayName !== undefined) {
    const normalized = normalizeDisplayName(input.displayName)
    const validationMessage = getPlayerDisplayNameValidationMessage(input.displayName)
    if (!normalized || validationMessage) {
      return { message: validationMessage ?? 'Player name is not supported.', ok: false }
    }
    data.display_name = normalized
  }

  if (input.accentColor !== undefined) {
    data.accent_color = validateAccentColor(input.accentColor)
  }

  if (input.avatarUrl !== undefined) {
    if (input.avatarUrl === '') {
      data.avatar_url = null
    } else {
      const validated = validateAvatarUrl(input.avatarUrl)
      if (!validated) {
        return { message: 'That avatar image is not supported.', ok: false }
      }
      data.avatar_url = validated
    }
  }

  if (Object.keys(data).length === 0) {
    return { ok: true }
  }

  try {
    const { error } = await client.auth.updateUser({ data })
    if (error) {
      return { message: classifyAuthError(error, 'update-profile'), ok: false }
    }
    return { ok: true }
  } catch (error) {
    return { message: classifyAuthError(error, 'update-profile'), ok: false }
  }
}

/** Re-export for callers that want a typed set of allow-listed accents. */
export { PROFILE_ACCENT_COLORS, PROFILE_DISPLAY_NAME_MAX_LENGTH } from './profile'
export type { ProfileAccentColor, DerivedProfile } from './profile'

/**
 * Phase 15.4 — Optional avatar Storage probe + upload.
 * The bucket `avatars` is checked at runtime; if it doesn't exist the UI
 * silently hides the upload affordance. We never throw to the caller.
 */
export const AVATAR_STORAGE_BUCKET = 'avatars'

export async function hasAvatarStorage(client: BrrrdleSupabaseClient): Promise<boolean> {
  try {
    const storage = (client as unknown as { readonly storage?: { readonly from: (bucket: string) => { readonly list: (path?: string, options?: { readonly limit?: number }) => Promise<{ readonly error: unknown }> } } }).storage
    if (!storage) {
      return false
    }
    const result = await storage.from(AVATAR_STORAGE_BUCKET).list(undefined, { limit: 1 })
    return !result.error
  } catch {
    return false
  }
}

export interface UploadAvatarInput {
  readonly contentType: string
  readonly data: Blob | ArrayBuffer | Uint8Array
  readonly userId: string
}

export async function uploadAvatar(
  client: BrrrdleSupabaseClient,
  input: UploadAvatarInput,
): Promise<{ readonly ok: true; readonly publicUrl: string } | { readonly message: string; readonly ok: false }> {
  try {
    const storage = (client as unknown as {
      readonly storage?: {
        readonly from: (bucket: string) => {
          readonly upload: (path: string, file: unknown, options?: { readonly contentType?: string; readonly upsert?: boolean }) => Promise<{ readonly error: unknown }>
          readonly getPublicUrl: (path: string) => { readonly data: { readonly publicUrl: string } }
        }
      }
    }).storage
    if (!storage) {
      return { message: 'Avatar storage is not configured for this project.', ok: false }
    }
    // Sanitize the path so a hostile id can't escape the user's folder.
    const safeId = input.userId.replace(/[^a-zA-Z0-9_-]/gu, '')
    if (!safeId) {
      return { message: 'Cannot determine your user folder.', ok: false }
    }
    const extension = input.contentType === 'image/png' ? 'png' : input.contentType === 'image/webp' ? 'webp' : 'jpg'
    const path = `${safeId}/avatar.${extension}`
    const bucket = storage.from(AVATAR_STORAGE_BUCKET)
    const { error } = await bucket.upload(path, input.data, { contentType: input.contentType, upsert: true })
    if (error) {
      return { message: classifyAuthError(error, 'update-profile'), ok: false }
    }
    const { data } = bucket.getPublicUrl(path)
    return { ok: true, publicUrl: data.publicUrl }
  } catch (error) {
    return { message: classifyAuthError(error, 'update-profile'), ok: false }
  }
}
