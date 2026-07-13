import { describe, expect, it } from 'vitest'
import type { OwnerPublicProfile } from './publicProfile'
import {
  createPrivatePracticeRequestIdempotencyKey,
  getPrivateMatchRequestErrorMessage,
  getPrivatePracticeRequestSettingsLabel,
  isOwnerPublicProfileEligibleForPrivateMatch,
  normalizePrivatePracticeRequestSettings,
  PRIVATE_MATCH_REQUESTER_PUBLIC_PROFILE_REQUIRED_MESSAGE,
  PRIVATE_PRACTICE_REQUEST_IDEMPOTENCY_PREFIX,
} from './publicProfilePrivateMatch'

const ACTIVE_OWNER_PROFILE: OwnerPublicProfile = {
  accentColor: 'aurora',
  createdAt: '2026-07-04T00:00:00.000Z',
  displayName: 'Public Player',
  flairKey: 'none',
  moderationStatus: 'active',
  publicProfileId: '11111111-1111-4111-8111-111111111111',
  updatedAt: '2026-07-04T00:01:00.000Z',
  visibility: 'public',
}

describe('private Practice public-profile eligibility', () => {
  it('allows active public profiles without requiring ranked rating metadata', () => {
    expect(isOwnerPublicProfileEligibleForPrivateMatch(ACTIVE_OWNER_PROFILE)).toBe(true)
  })

  it('denies missing, private, hidden, suspended, or unnamed requester profiles', () => {
    expect(isOwnerPublicProfileEligibleForPrivateMatch(undefined)).toBe(false)
    expect(isOwnerPublicProfileEligibleForPrivateMatch({ ...ACTIVE_OWNER_PROFILE, visibility: 'private' })).toBe(false)
    expect(isOwnerPublicProfileEligibleForPrivateMatch({ ...ACTIVE_OWNER_PROFILE, moderationStatus: 'hidden' })).toBe(false)
    expect(isOwnerPublicProfileEligibleForPrivateMatch({ ...ACTIVE_OWNER_PROFILE, moderationStatus: 'suspended' })).toBe(false)
    expect(isOwnerPublicProfileEligibleForPrivateMatch({ ...ACTIVE_OWNER_PROFILE, displayName: undefined })).toBe(false)
  })

  it('normalizes requester profile RPC failures away from ranked Elo confusion', () => {
    expect(getPrivateMatchRequestErrorMessage(new Error('Unable to create private match request: Requester must have an active public profile.'))).toBe(PRIVATE_MATCH_REQUESTER_PUBLIC_PROFILE_REQUIRED_MESSAGE)
    expect(PRIVATE_MATCH_REQUESTER_PUBLIC_PROFILE_REQUIRED_MESSAGE).toContain('Ranked Elo is not required')
  })
})

describe('private Practice request settings', () => {
  it('normalizes the default profile-card request as unranked OG Practice', () => {
    expect(normalizePrivatePracticeRequestSettings({})).toEqual({
      ok: true,
      settings: {
        goPuzzleCount: undefined,
        hardMode: false,
        mode: 'og',
        timeLimitMs: null,
        wordLength: 5,
      },
    })
  })

  it('keeps selected GO, Hard Mode, word-length, and time-control settings together', () => {
    const result = normalizePrivatePracticeRequestSettings({
      hardMode: true,
      mode: 'go',
      timeLimitMs: '300000',
      wordLength: '7',
    })

    expect(result).toEqual({
      ok: true,
      settings: {
        goPuzzleCount: 5,
        hardMode: true,
        mode: 'go',
        timeLimitMs: 300_000,
        wordLength: 7,
      },
    })
    if (result.ok) {
      expect(getPrivatePracticeRequestSettingsLabel(result.settings)).toBe('GO, 7 letters, 5 puzzles, Hard Mode on, 5:00 per side')
      expect(createPrivatePracticeRequestIdempotencyKey(
        '22222222-2222-4222-8222-222222222222',
        result.settings,
        'nonce',
      )).toBe(`${PRIVATE_PRACTICE_REQUEST_IDEMPOTENCY_PREFIX}:go:7:hard:300000:5:22222222-2222-4222-8222-222222222222:nonce`)
    }
  })

  it('rejects unsupported private Practice request settings before RPC submission', () => {
    expect(normalizePrivatePracticeRequestSettings({ mode: 'daily' })).toMatchObject({ ok: false })
    expect(normalizePrivatePracticeRequestSettings({ wordLength: 36 })).toMatchObject({ ok: false })
    expect(normalizePrivatePracticeRequestSettings({ timeLimitMs: 45_000 })).toMatchObject({ ok: false })
  })
})
