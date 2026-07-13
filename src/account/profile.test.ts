import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PROFILE_ACCENT_COLOR,
  PROFILE_ACCENT_COLORS,
  PROFILE_AVATAR_MAX_BYTES,
  PROFILE_DISPLAY_NAME_MAX_LENGTH,
  deriveInitials,
  deriveProfileFromUser,
  getPlayerDisplayNameValidationMessage,
  normalizeDisplayName,
  normalizePlayerDisplayName,
  pickInitialsGradient,
  validateAccentColor,
  validateAvatarUrl,
} from './profile'

describe('deriveInitials', () => {
  it('returns "?" when no source is available', () => {
    expect(deriveInitials({})).toBe('?')
  })

  it('returns first + last initial from a display name with spaces', () => {
    expect(deriveInitials({ displayName: 'Ada Lovelace' })).toBe('AL')
  })

  it('returns a single initial when only one word', () => {
    expect(deriveInitials({ displayName: 'Ada' })).toBe('A')
  })

  it('splits the email local-part on common separators', () => {
    expect(deriveInitials({ email: 'first.last@example.com' })).toBe('FL')
    expect(deriveInitials({ email: 'a_b@example.com' })).toBe('AB')
    expect(deriveInitials({ email: 'plain@example.com' })).toBe('P')
  })

  it('prefers display name over email', () => {
    expect(deriveInitials({ displayName: 'Solo', email: 'first.last@example.com' })).toBe('S')
  })
})

describe('normalizeDisplayName', () => {
  it('returns undefined for non-string and empty values', () => {
    expect(normalizeDisplayName(undefined)).toBeUndefined()
    expect(normalizeDisplayName(42)).toBeUndefined()
    expect(normalizeDisplayName('   ')).toBeUndefined()
  })

  it('trims safe player names', () => {
    expect(normalizePlayerDisplayName('  Ada Lovelace  ')).toBe('Ada Lovelace')
    expect(normalizePlayerDisplayName('Jean-Luc_Picard.2')).toBe('Jean-Luc_Picard.2')
  })

  it('rejects names over the max length', () => {
    const long = 'x'.repeat(PROFILE_DISPLAY_NAME_MAX_LENGTH + 10)
    expect(normalizeDisplayName(long)).toBeUndefined()
  })

  it('rejects unsafe control, emoji, and symbol names', () => {
    expect(normalizeDisplayName('Ada\u0001\u001fLovelace')).toBeUndefined()
    expect(normalizeDisplayName('Ada \u{1f9ca}')).toBeUndefined()
    expect(normalizeDisplayName('!!!')).toBeUndefined()
    expect(normalizeDisplayName('Ada & Bob')).toBeUndefined()
  })

  it('returns clear validation messages for rejected names', () => {
    expect(getPlayerDisplayNameValidationMessage('Ada \u{1f9ca}')).toContain('Emoji')
    expect(getPlayerDisplayNameValidationMessage('Ada Lovelace')).toBeUndefined()
  })
})

describe('validateAccentColor', () => {
  it('accepts every allow-listed color', () => {
    for (const color of PROFILE_ACCENT_COLORS) {
      expect(validateAccentColor(color)).toBe(color)
    }
  })

  it('falls back to the default for unknown values', () => {
    expect(validateAccentColor('chartreuse')).toBe(DEFAULT_PROFILE_ACCENT_COLOR)
    expect(validateAccentColor(42)).toBe(DEFAULT_PROFILE_ACCENT_COLOR)
    expect(validateAccentColor(undefined)).toBe(DEFAULT_PROFILE_ACCENT_COLOR)
  })
})

describe('validateAvatarUrl', () => {
  it('accepts https URLs', () => {
    expect(validateAvatarUrl('https://example.supabase.co/storage/v1/object/public/avatars/u/a.png'))
      .toBe('https://example.supabase.co/storage/v1/object/public/avatars/u/a.png')
  })

  it('accepts small data:image URLs', () => {
    expect(validateAvatarUrl('data:image/png;base64,AAA')).toBe('data:image/png;base64,AAA')
  })

  it('rejects javascript:, http:, relative, and oversized data URLs', () => {
    expect(validateAvatarUrl('javascript:alert(1)')).toBeUndefined()
    expect(validateAvatarUrl('http://example.com/a.png')).toBeUndefined()
    expect(validateAvatarUrl('/a.png')).toBeUndefined()
    const huge = 'data:image/png;base64,' + 'A'.repeat(PROFILE_AVATAR_MAX_BYTES * 3)
    expect(validateAvatarUrl(huge)).toBeUndefined()
  })

  it('rejects non-strings', () => {
    expect(validateAvatarUrl(undefined)).toBeUndefined()
    expect(validateAvatarUrl(null)).toBeUndefined()
    expect(validateAvatarUrl(42)).toBeUndefined()
  })
})

describe('pickInitialsGradient', () => {
  it('returns a stable gradient for the same seed', () => {
    expect(pickInitialsGradient('user-1')).toBe(pickInitialsGradient('user-1'))
  })

  it('handles an empty seed without throwing', () => {
    expect(pickInitialsGradient('')).toMatch(/^from-/)
  })
})

describe('deriveProfileFromUser', () => {
  it('handles a user with no metadata at all', () => {
    const p = deriveProfileFromUser({ id: 'u', email: 'a@b.com' })
    expect(p.displayName).toBeUndefined()
    expect(p.accentColor).toBe(DEFAULT_PROFILE_ACCENT_COLOR)
    expect(p.avatarUrl).toBeUndefined()
    expect(p.initials).toBe('A')
    expect(p.label).toBe('a@b.com')
    expect(p.email).toBe('a@b.com')
    expect(p.gradient).toMatch(/^from-/)
  })

  it('reads display name, accent, and avatar url from user_metadata', () => {
    const p = deriveProfileFromUser({
      id: 'u',
      email: 'a@b.com',
      user_metadata: {
        display_name: 'Ada Lovelace',
        accent_color: 'aurora',
        avatar_url: 'https://example.supabase.co/storage/v1/object/public/avatars/u/a.png',
      },
    })
    expect(p.displayName).toBe('Ada Lovelace')
    expect(p.accentColor).toBe('aurora')
    expect(p.avatarUrl).toBe('https://example.supabase.co/storage/v1/object/public/avatars/u/a.png')
    expect(p.initials).toBe('AL')
    expect(p.label).toBe('Ada Lovelace')
  })

  it('falls back to "Account" when neither name nor email is present', () => {
    const p = deriveProfileFromUser({ id: 'u' })
    expect(p.label).toBe('Account')
  })

  it('treats unsafe avatar metadata as missing', () => {
    const p = deriveProfileFromUser({
      id: 'u',
      email: 'a@b.com',
      user_metadata: { avatar_url: 'javascript:alert(1)' },
    })
    expect(p.avatarUrl).toBeUndefined()
  })

  it('tolerates a null user_metadata field', () => {
    const p = deriveProfileFromUser({ id: 'u', email: 'a@b.com', user_metadata: null })
    expect(p.displayName).toBeUndefined()
  })
})
