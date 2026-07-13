import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface SupabaseRuntimeConfig {
  readonly anonKey?: string
  readonly isConfigured: boolean
  readonly url?: string
}

interface EnvLike {
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_SUPABASE_URL?: string
}

export type BrrrdleSupabaseClient = SupabaseClient

let cachedClient: BrrrdleSupabaseClient | undefined
let cachedClientKey: string | undefined

export function getSupabaseRuntimeConfig(env: EnvLike = import.meta.env as EnvLike): SupabaseRuntimeConfig {
  const url = env.VITE_SUPABASE_URL?.trim()
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim()
  return {
    anonKey,
    isConfigured: Boolean(url && anonKey),
    url,
  }
}

export function createBrrrdleSupabaseClient(config: SupabaseRuntimeConfig = getSupabaseRuntimeConfig()): BrrrdleSupabaseClient | undefined {
  if (!config.isConfigured || !config.url || !config.anonKey) {
    return undefined
  }

  const clientKey = `${config.url}\n${config.anonKey}`
  if (cachedClient && cachedClientKey === clientKey) {
    return cachedClient
  }

  cachedClientKey = clientKey
  cachedClient = createClient(config.url, config.anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
    },
  })
  return cachedClient
}
