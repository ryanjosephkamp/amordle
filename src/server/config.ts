import 'server-only';

import { z } from 'zod';

const publicSupabaseSchema = z
  .object({
    url: z.url(),
    anonKey: z.string().min(20),
  })
  .strict();
const publicUrlSchema = z.url();
const publicKeySchema = z.string().min(20);

export function getPublicSupabaseConfig(): { url: string; anonKey: string } | null {
  const browserUrl = publicUrlSchema.safeParse(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const browserKey = publicKeySchema.safeParse(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const parsed = publicSupabaseSchema.safeParse({
    url: browserUrl.success ? browserUrl.data : process.env.SUPABASE_URL,
    anonKey: browserKey.success ? browserKey.data : process.env.SUPABASE_ANON_KEY,
  });
  if (!parsed.success) return null;
  return parsed.data;
}

export function getCronSecret(): string | null {
  const secret = process.env.CRON_SECRET;
  return secret && secret.length >= 20 ? secret : null;
}
