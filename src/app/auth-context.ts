import type { User } from '@supabase/supabase-js';
import { createContext, useContext } from 'react';
import type { AmordleSupabaseClient } from '../lib/supabase-browser';
import type { IdentityScope } from '../persistence/local-repository';
import type { AuthService } from '../services/auth-service';

export type AuthStatus = 'unconfigured' | 'loading' | 'guest' | 'authenticated';

export type AuthContextValue = {
  client: AmordleSupabaseClient | null;
  service: AuthService | null;
  user: User | null;
  status: AuthStatus;
  identity: IdentityScope;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
