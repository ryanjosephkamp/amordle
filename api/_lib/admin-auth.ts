import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';
import { readServerSupabaseConfig } from './server-env';

export type AdminVerification = 'admin' | 'non-admin' | 'invalid' | 'unavailable';

export interface AdminVerifier {
  verify(token: string): Promise<AdminVerification>;
}

export class SupabaseAdminVerifier implements AdminVerifier {
  async verify(token: string): Promise<AdminVerification> {
    const config = readServerSupabaseConfig();
    if (!config) return 'unavailable';
    try {
      const client = createClient<Database>(config.url, config.anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data, error } = await client.auth.getUser(token);
      if (error || !data.user) return 'invalid';
      return data.user.app_metadata.role === 'admin' ? 'admin' : 'non-admin';
    } catch {
      return 'unavailable';
    }
  }
}
