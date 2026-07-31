import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '@/types/database';
import { getPublicSupabaseConfig } from './config';

const profileSchema = z
  .object({
    role: z.string(),
  })
  .strict();

export type BearerIdentity =
  | { status: 'unavailable' }
  | { status: 'unauthorized' }
  | { status: 'authenticated'; userId: string; role: string };

export async function authenticateBearer(request: Request): Promise<BearerIdentity> {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return { status: 'unauthorized' };
  const token = authorization.slice('Bearer '.length).trim();
  if (!token) return { status: 'unauthorized' };
  const config = getPublicSupabaseConfig();
  if (!config) return { status: 'unavailable' };

  const client = createClient<Database>(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return { status: 'unauthorized' };
  const result = await client.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
  const parsed = profileSchema.safeParse(result.data);
  return {
    status: 'authenticated',
    userId: data.user.id,
    role: parsed.success ? parsed.data.role : 'player',
  };
}
