import { z } from 'zod';

const supabaseSchema = z.object({
  url: z
    .string()
    .url()
    .refine((value) => new URL(value).hostname === 'squqdstdvbsvhagfuzgj.supabase.co'),
  anonKey: z.string().min(20),
});

export function readServerSupabaseConfig(): z.infer<typeof supabaseSchema> | null {
  const result = supabaseSchema.safeParse({
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
  });
  return result.success ? result.data : null;
}

export function readCronSecret(): string | null {
  const value = process.env.CRON_SECRET;
  return value && value.length >= 24 ? value : null;
}

export function readBlobToken(): string | null {
  const value = process.env.BLOB_READ_WRITE_TOKEN;
  return value && value.length >= 20 ? value : null;
}
