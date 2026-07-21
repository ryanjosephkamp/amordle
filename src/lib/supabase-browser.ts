import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '../types/database';

const browserConfigSchema = z.object({
  url: z
    .string()
    .url()
    .refine((value) => value.startsWith('https://'), 'Supabase URL must use HTTPS.'),
  anonKey: z.string().min(20),
});

export type BrowserSupabaseConfig = z.infer<typeof browserConfigSchema>;
export type AmordleSupabaseClient = SupabaseClient<Database>;

let singleton: AmordleSupabaseClient | null = null;

export function readBrowserSupabaseConfig(): BrowserSupabaseConfig | null {
  const candidate = {
    url: import.meta.env.VITE_SUPABASE_URL,
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  };
  const parsed = browserConfigSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export function createBrowserSupabaseClient(config: BrowserSupabaseConfig): AmordleSupabaseClient {
  const parsed = browserConfigSchema.parse(config);
  return createClient<Database>(parsed.url, parsed.anonKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
    realtime: { params: { eventsPerSecond: 10 } },
  });
}

export function getBrowserSupabaseClient(): AmordleSupabaseClient | null {
  if (singleton) return singleton;
  const config = readBrowserSupabaseConfig();
  if (!config) return null;
  singleton = createBrowserSupabaseClient(config);
  return singleton;
}
