import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AVATAR_STORAGE_BUCKET,
  classifyAuthError,
  hasAvatarStorage,
  isPasswordResetUrl,
  sendPasswordResetEmail,
  updatePassword,
  updateProfile,
  uploadAvatar,
} from './auth'
import type { BrrrdleSupabaseClient } from './supabaseClient'

function client(overrides: Record<string, unknown> = {}, storage?: unknown): BrrrdleSupabaseClient {
  return {
    auth: {
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
      updateUser: vi.fn().mockResolvedValue({ error: null }),
      ...overrides,
    },
    storage,
  } as unknown as BrrrdleSupabaseClient
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('classifyAuthError', () => {
  const cases: Array<[string, Parameters<typeof classifyAuthError>[1], string]> = [
    ['rate limited please slow down', 'magic-link', 'Too many attempts — please wait a minute and try again.'],
    ['Failed to fetch', 'sign-in', 'Network unavailable — please try again.'],
    ['User already registered', 'sign-up', 'That email is already registered. Try signing in instead.'],
    ['Email not confirmed', 'sign-in', 'Please confirm your email before signing in.'],
    ['Invalid login credentials', 'sign-in', 'Email or password is incorrect.'],
    ['password is too short', 'sign-up', 'Password must be at least 8 characters.'],
    ['weak password detected', 'sign-up', 'Please choose a stronger password.'],
    ['New password should be different from old password', 'update-password', 'Choose a new password that is different from your current password.'],
    ['Invalid email address', 'sign-up', 'That email address does not look valid.'],
  ]
  for (const [raw, action, expected] of cases) {
    it(`maps ${JSON.stringify(raw)} (${action}) to ${JSON.stringify(expected)}`, () => {
      expect(classifyAuthError(new Error(raw), action)).toBe(expected)
    })
  }
  it('falls back to a per-action generic when nothing matches', () => {
    expect(classifyAuthError(new Error('???'), 'sign-in')).toMatch(/Unable to sign in/)
    expect(classifyAuthError(new Error('???'), 'sign-up')).toMatch(/Unable to create an account/)
    expect(classifyAuthError(new Error('???'), 'magic-link')).toMatch(/magic link/)
    expect(classifyAuthError(new Error('???'), 'reset-password')).toMatch(/reset link/)
    expect(classifyAuthError(new Error('???'), 'update-password')).toBe('Unable to update your password right now. Choose a different password and try again.')
    expect(classifyAuthError(new Error('???'), 'update-profile')).toMatch(/save your profile/)
  })
  it('tolerates non-error inputs', () => {
    expect(classifyAuthError(undefined, 'sign-in')).toMatch(/Unable to sign in/)
    expect(classifyAuthError('garbage', 'sign-up')).toMatch(/Unable to create an account/)
  })
})

describe('sendPasswordResetEmail', () => {
  it('rejects an empty email without calling supabase', async () => {
    const reset = vi.fn().mockResolvedValue({ error: null })
    const c = client({ resetPasswordForEmail: reset })
    const result = await sendPasswordResetEmail(c, '   ')
    expect(reset).not.toHaveBeenCalled()
    expect('ok' in result && result.ok).toBe(false)
  })

  it('lowercases the email and forwards to supabase', async () => {
    vi.stubGlobal('window', {
      location: {
        href: 'https://brrrdle.app/settings',
        origin: 'https://brrrdle.app',
      },
    })
    const reset = vi.fn().mockResolvedValue({ error: null })
    const c = client({ resetPasswordForEmail: reset })
    const result = await sendPasswordResetEmail(c, 'Foo@Bar.com')
    expect(reset).toHaveBeenCalled()
    expect(reset.mock.calls[0]![0]).toBe('foo@bar.com')
    expect(reset.mock.calls[0]![1]).toEqual({
      redirectTo: expect.stringContaining('auth_action=reset-password'),
    })
    expect(result).toEqual({ ok: true })
  })

  it('returns a sanitized message on supabase error', async () => {
    const reset = vi.fn().mockResolvedValue({ error: { message: 'raw provider detail' } })
    const c = client({ resetPasswordForEmail: reset })
    const result = await sendPasswordResetEmail(c, 'a@b.com')
    expect('ok' in result && result.ok).toBe(false)
    expect('message' in result && result.message).toMatch(/reset link/)
  })

  it('catches thrown errors', async () => {
    const reset = vi.fn().mockRejectedValue(new Error('boom'))
    const c = client({ resetPasswordForEmail: reset })
    const result = await sendPasswordResetEmail(c, 'a@b.com')
    expect('ok' in result && result.ok).toBe(false)
  })
})

describe('password recovery helpers', () => {
  it('detects explicit reset URLs and Supabase recovery hash URLs', () => {
    expect(isPasswordResetUrl({ search: '?auth_action=reset-password' })).toBe(true)
    expect(isPasswordResetUrl({ hash: '#access_token=abc&type=recovery' })).toBe(true)
    expect(isPasswordResetUrl({ search: '?auth_action=magic-link', hash: '#type=magiclink' })).toBe(false)
  })

  it('updates the current recovery-session password', async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null })
    const c = client({ updateUser })
    const result = await updatePassword(c, 'new-password')
    expect(updateUser).toHaveBeenCalledWith({ password: 'new-password' })
    expect(result).toEqual({ ok: true })
  })

  it('rejects short password updates without calling supabase', async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null })
    const c = client({ updateUser })
    const result = await updatePassword(c, 'short')
    expect(updateUser).not.toHaveBeenCalled()
    expect('ok' in result && result.ok).toBe(false)
  })

  it('uses password-update copy rather than reset-link copy on update failures', async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: { message: 'raw provider detail' } })
    const c = client({ updateUser })
    const result = await updatePassword(c, 'new-password')
    expect('ok' in result && result.ok).toBe(false)
    expect('message' in result && result.message).toBe('Unable to update your password right now. Choose a different password and try again.')
    expect('message' in result && result.message).not.toMatch(/reset link/)
  })

  it('uses same-current-password copy when the provider identifies the no-op update', async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: { message: 'New password should be different from old password' } })
    const c = client({ updateUser })
    const result = await updatePassword(c, 'current-password')
    expect('ok' in result && result.ok).toBe(false)
    expect('message' in result && result.message).toBe('Choose a new password that is different from your current password.')
  })
})

describe('updateProfile', () => {
  it('returns ok with no supabase call when nothing valid is supplied', async () => {
    const update = vi.fn().mockResolvedValue({ error: null })
    const c = client({ updateUser: update })
    const result = await updateProfile(c, {})
    expect(update).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: true })
  })

  it('forwards a display name update', async () => {
    const update = vi.fn().mockResolvedValue({ error: null })
    const c = client({ updateUser: update })
    const result = await updateProfile(c, { displayName: '  Ada Lovelace  ' })
    expect(update).toHaveBeenCalledWith({ data: { display_name: 'Ada Lovelace' } })
    expect(result).toEqual({ ok: true })
  })

  it('rejects an empty display name without touching Supabase', async () => {
    const update = vi.fn().mockResolvedValue({ error: null })
    const c = client({ updateUser: update })
    const result = await updateProfile(c, { displayName: '' })
    expect(update).not.toHaveBeenCalled()
    expect('ok' in result && result.ok).toBe(false)
  })

  it('rejects emoji and unsafe symbols in display names before touching Supabase', async () => {
    const update = vi.fn().mockResolvedValue({ error: null })
    const c = client({ updateUser: update })
    const result = await updateProfile(c, { displayName: 'Ada \u{1f9ca}' })
    expect(update).not.toHaveBeenCalled()
    expect('ok' in result && result.ok).toBe(false)
  })

  it('falls back to default accent for unknown values', async () => {
    const update = vi.fn().mockResolvedValue({ error: null })
    const c = client({ updateUser: update })
    await updateProfile(c, { accentColor: 'chartreuse' })
    expect(update).toHaveBeenCalledWith({ data: { accent_color: 'ice' } })
  })

  it('rejects unsafe avatar URLs without touching supabase', async () => {
    const update = vi.fn().mockResolvedValue({ error: null })
    const c = client({ updateUser: update })
    const result = await updateProfile(c, { avatarUrl: 'javascript:alert(1)' })
    expect(update).not.toHaveBeenCalled()
    expect('ok' in result && result.ok).toBe(false)
  })

  it('passes through a valid https avatar URL', async () => {
    const update = vi.fn().mockResolvedValue({ error: null })
    const c = client({ updateUser: update })
    await updateProfile(c, { avatarUrl: 'https://example.supabase.co/a.png' })
    expect(update).toHaveBeenCalledWith({ data: { avatar_url: 'https://example.supabase.co/a.png' } })
  })

  it('returns a friendly message on supabase error', async () => {
    const update = vi.fn().mockResolvedValue({ error: { message: 'nope' } })
    const c = client({ updateUser: update })
    const result = await updateProfile(c, { displayName: 'Ada' })
    expect('ok' in result && result.ok).toBe(false)
  })
})

describe('hasAvatarStorage / uploadAvatar', () => {
  it('returns false when no storage namespace is present', async () => {
    const c = client({})
    expect(await hasAvatarStorage(c)).toBe(false)
  })

  it('returns true when storage.from(avatars).list resolves without error', async () => {
    const list = vi.fn().mockResolvedValue({ error: null })
    const from = vi.fn().mockReturnValue({ list })
    const c = client({}, { from })
    expect(await hasAvatarStorage(c)).toBe(true)
    expect(from).toHaveBeenCalledWith(AVATAR_STORAGE_BUCKET)
  })

  it('returns false when list returns an error or throws', async () => {
    expect(await hasAvatarStorage(client({}, { from: () => ({ list: () => Promise.resolve({ error: { message: 'no' } }) }) }))).toBe(false)
    expect(await hasAvatarStorage(client({}, { from: () => { throw new Error('x') } }))).toBe(false)
  })

  it('uploads to the user-scoped path and returns the public URL', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null })
    const getPublicUrl = vi.fn().mockReturnValue({ data: { publicUrl: 'https://x/u/avatar.png' } })
    const from = vi.fn().mockReturnValue({ upload, getPublicUrl })
    const c = client({}, { from })
    const blob = new Uint8Array([1, 2, 3])
    const result = await uploadAvatar(c, { contentType: 'image/png', data: blob, userId: 'user-1' })
    expect(upload).toHaveBeenCalledWith('user-1/avatar.png', blob, { contentType: 'image/png', upsert: true })
    expect(getPublicUrl).toHaveBeenCalledWith('user-1/avatar.png')
    expect(result).toEqual({ ok: true, publicUrl: 'https://x/u/avatar.png' })
  })

  it('refuses an empty/sanitized user id', async () => {
    const from = vi.fn()
    const c = client({}, { from })
    const result = await uploadAvatar(c, { contentType: 'image/png', data: new Uint8Array(), userId: '!!!' })
    expect('ok' in result && result.ok).toBe(false)
    expect(from).not.toHaveBeenCalled()
  })

  it('returns a friendly message on upload error', async () => {
    const upload = vi.fn().mockResolvedValue({ error: { message: 'nope' } })
    const getPublicUrl = vi.fn()
    const from = vi.fn().mockReturnValue({ upload, getPublicUrl })
    const c = client({}, { from })
    const result = await uploadAvatar(c, { contentType: 'image/jpeg', data: new Uint8Array(), userId: 'u' })
    expect('ok' in result && result.ok).toBe(false)
  })
})
