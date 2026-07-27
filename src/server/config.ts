import 'server-only';

import { z } from 'zod';

const publicSupabaseSchema = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  })
  .strict();

export function getPublicSupabaseConfig(): { url: string; anonKey: string } | null {
  const parsed = publicSupabaseSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!parsed.success) return null;
  return {
    url: parsed.data.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: parsed.data.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

export function getBlobToken(): string | null {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  return token && token.length >= 20 ? token : null;
}

export function getCronSecret(): string | null {
  const secret = process.env.CRON_SECRET;
  return secret && secret.length >= 20 ? secret : null;
}
