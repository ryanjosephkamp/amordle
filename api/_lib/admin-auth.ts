import { readServerSupabaseConfig } from './server-env.js';

export type AdminVerification = 'admin' | 'non-admin' | 'invalid' | 'unavailable';

export interface AdminVerifier {
  verify(token: string): Promise<AdminVerification>;
}

export class SupabaseAdminVerifier implements AdminVerifier {
  async verify(token: string): Promise<AdminVerification> {
    const config = readServerSupabaseConfig();
    if (!config) return 'unavailable';
    try {
      const response = await fetch(`${config.url}/auth/v1/user`, {
        headers: { apikey: config.anonKey, Authorization: `Bearer ${token}` },
      });
      if (response.status === 401 || response.status === 403) return 'invalid';
      if (!response.ok) return 'unavailable';
      const user: unknown = await response.json();
      if (typeof user !== 'object' || user === null || !('app_metadata' in user)) return 'invalid';
      const metadata = user.app_metadata;
      return typeof metadata === 'object' && metadata !== null && 'role' in metadata
        ? metadata.role === 'admin'
          ? 'admin'
          : 'non-admin'
        : 'non-admin';
    } catch {
      return 'unavailable';
    }
  }
}
