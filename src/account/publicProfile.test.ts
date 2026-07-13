import { describe, expect, it, vi } from 'vitest'
import {
  createSupabasePublicProfileRepository,
  normalizePublicProfileId,
  normalizePublicProfileAvatarUrl,
  normalizePublicProfileBio,
  normalizePublicProfileDisplayName,
  normalizePublicProfileUpdateInput,
  parseOwnerPublicProfileDto,
  parsePublicPlayerProfileDto,
} from './publicProfile'
import type { BrrrdleSupabaseClient } from './supabaseClient'

const PUBLIC_PROFILE_ID = '123e4567-e89b-42d3-a456-426614174000'
const OWNER_ROW = {
  accent_color: 'cyan',
  avatar_url: null,
  bio: 'Hello',
  created_at: '2026-06-21T00:00:00.000Z',
  display_name: 'Ada',
  flair_key: 'none',
  moderation_status: 'active',
  public_profile_id: PUBLIC_PROFILE_ID,
  updated_at: '2026-06-21T00:01:00.000Z',
  visibility: 'public',
}

function client(rpc: ReturnType<typeof vi.fn>): BrrrdleSupabaseClient {
  return { rpc } as unknown as BrrrdleSupabaseClient
}

describe('public profile text normalization', () => {
  it('normalizes only opaque public profile ids', () => {
    expect(normalizePublicProfileId(` ${PUBLIC_PROFILE_ID} `)).toBe(PUBLIC_PROFILE_ID)
    expect(normalizePublicProfileId('raw-auth-id')).toBeUndefined()
    expect(normalizePublicProfileId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa@example.test')).toBeUndefined()
  })

  it('normalizes public display name and bio as bounded plain text', () => {
    expect(normalizePublicProfileDisplayName('  Ada Lovelace  ')).toBe('Ada Lovelace')
    expect(normalizePublicProfileDisplayName('Ada\u0001Lovelace')).toBeUndefined()
    expect(normalizePublicProfileDisplayName('Ada \u{1f9ca}')).toBeUndefined()
    expect(normalizePublicProfileDisplayName('Ada & Bob')).toBeUndefined()
    expect(normalizePublicProfileDisplayName('x'.repeat(51))).toBeUndefined()
    expect(normalizePublicProfileBio('  ranked word nerd  ')).toBe('ranked word nerd')
    expect(normalizePublicProfileBio('x'.repeat(161))).toBeUndefined()
  })

  it('requires a display name before public visibility', () => {
    expect(normalizePublicProfileUpdateInput({ visibility: 'public' })).toEqual({
      message: 'Add a Player name before saving your player profile.',
      ok: false,
    })
    expect(normalizePublicProfileUpdateInput({ displayName: 'Ada', visibility: 'public' })).toMatchObject({
      ok: true,
      value: {
        displayName: 'Ada',
        visibility: 'public',
      },
    })
    expect(normalizePublicProfileUpdateInput({ displayName: 'Ada \u{1f9ca}', visibility: 'public' })).toEqual({
      message: 'Player name must be 1-50 characters using letters, numbers, spaces, apostrophes, periods, underscores, or hyphens. Emoji, control characters, and symbols are not supported.',
      ok: false,
    })
  })

  it('keeps public avatars stricter than private account avatars', () => {
    const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    expect(normalizePublicProfileAvatarUrl('data:image/png;base64,AAA', userId)).toBeUndefined()
    expect(normalizePublicProfileAvatarUrl(`https://example.invalid/${userId}/avatar.png`, userId)).toBeUndefined()
    expect(normalizePublicProfileAvatarUrl('https://example.invalid/public/avatar.png', userId)).toBe('https://example.invalid/public/avatar.png')
  })
})

describe('public profile DTO parsing', () => {
  it('parses owner DTOs without raw identity fields', () => {
    expect(parseOwnerPublicProfileDto(OWNER_ROW)).toEqual({
      accentColor: 'cyan',
      bio: 'Hello',
      createdAt: '2026-06-21T00:00:00.000Z',
      displayName: 'Ada',
      flairKey: 'none',
      moderationStatus: 'active',
      publicProfileId: PUBLIC_PROFILE_ID,
      updatedAt: '2026-06-21T00:01:00.000Z',
      visibility: 'public',
    })
  })

  it('rejects owner DTOs with forbidden private fields', () => {
    expect(parseOwnerPublicProfileDto({ ...OWNER_ROW, user_id: 'raw-user-id' })).toBeUndefined()
    expect(parseOwnerPublicProfileDto({ ...OWNER_ROW, email: 'ada@example.com' })).toBeUndefined()
    expect(parseOwnerPublicProfileDto({ ...OWNER_ROW, rating: 1200 })).toBeUndefined()
  })

  it('parses public DTOs only when display fields are safe and public allow-listed', () => {
    expect(parsePublicPlayerProfileDto(OWNER_ROW)).toEqual({
      accentColor: 'cyan',
      bio: 'Hello',
      createdAt: '2026-06-21T00:00:00.000Z',
      displayName: 'Ada',
      flairKey: 'none',
      publicProfileId: PUBLIC_PROFILE_ID,
      updatedAt: '2026-06-21T00:01:00.000Z',
    })
    expect(parsePublicPlayerProfileDto({ ...OWNER_ROW, display_name: null })).toBeUndefined()
    expect(parsePublicPlayerProfileDto({ ...OWNER_ROW, raw_user_meta_data: {} })).toBeUndefined()
  })
})

describe('createSupabasePublicProfileRepository', () => {
  it('loads the current owner profile through the owner RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [OWNER_ROW], error: null })
    const repository = createSupabasePublicProfileRepository(client(rpc))
    await expect(repository.loadMine()).resolves.toMatchObject({ publicProfileId: PUBLIC_PROFILE_ID })
    expect(rpc).toHaveBeenCalledWith('get_my_public_player_profile')
  })

  it('saves a normalized owner profile without raw account fields', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [OWNER_ROW], error: null })
    const repository = createSupabasePublicProfileRepository(client(rpc))
    await expect(repository.saveMine({
      accentColor: 'rose',
      avatarUrl: 'https://example.invalid/public.png',
      bio: '  hello  ',
      displayName: '  Ada  ',
      visibility: 'public',
    }, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).resolves.toMatchObject({ publicProfileId: PUBLIC_PROFILE_ID })
    expect(rpc).toHaveBeenCalledWith('upsert_my_public_player_profile', {
      p_accent_color: 'rose',
      p_avatar_url: 'https://example.invalid/public.png',
      p_bio: 'hello',
      p_display_name: 'Ada',
      p_flair_key: 'none',
      p_visibility: 'public',
    })
  })

  it('refuses to save invalid public profile input before calling Supabase', async () => {
    const rpc = vi.fn()
    const repository = createSupabasePublicProfileRepository(client(rpc))
    await expect(repository.saveMine({ avatarUrl: 'data:image/png;base64,AAA' })).rejects.toThrow(/Public avatar URL/)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('loads public profiles through allow-listed public RPCs', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [OWNER_ROW], error: null })
    const repository = createSupabasePublicProfileRepository(client(rpc))
    await expect(repository.loadPublicProfile(PUBLIC_PROFILE_ID)).resolves.toMatchObject({ publicProfileId: PUBLIC_PROFILE_ID })
    expect(rpc).toHaveBeenCalledWith('get_public_player_profile', { p_public_profile_id: PUBLIC_PROFILE_ID })
  })

  it('deduplicates and caps batch public profile ids', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [OWNER_ROW], error: null })
    const repository = createSupabasePublicProfileRepository(client(rpc))
    const ids = [PUBLIC_PROFILE_ID, 'bad-id', PUBLIC_PROFILE_ID]
    await expect(repository.loadPublicProfiles(ids)).resolves.toHaveLength(1)
    expect(rpc).toHaveBeenCalledWith('get_public_player_profiles', {
      p_public_profile_ids: [PUBLIC_PROFILE_ID],
    })
  })
})
