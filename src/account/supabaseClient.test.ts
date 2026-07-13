import { describe, expect, it } from 'vitest'
import { createBrrrdleSupabaseClient, getSupabaseRuntimeConfig } from './supabaseClient'

describe('supabase client config', () => {
  it('requires both public URL and anon key', () => {
    expect(getSupabaseRuntimeConfig({}).isConfigured).toBe(false)
    expect(getSupabaseRuntimeConfig({ VITE_SUPABASE_URL: 'https://example.supabase.co' }).isConfigured).toBe(false)
    expect(getSupabaseRuntimeConfig({ VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon' })).toEqual({
      anonKey: 'anon',
      isConfigured: true,
      url: 'https://example.supabase.co',
    })
  })

  it('reuses the same client for repeated calls with the same config', () => {
    const config = getSupabaseRuntimeConfig({
      VITE_SUPABASE_ANON_KEY: 'anon-key',
      VITE_SUPABASE_URL: 'https://example.supabase.co',
    })

    expect(createBrrrdleSupabaseClient(config)).toBe(createBrrrdleSupabaseClient(config))
  })
})
