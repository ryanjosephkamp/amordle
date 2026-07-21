import type { User } from '@supabase/supabase-js';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { getBrowserSupabaseClient } from '../lib/supabase-browser';
import { AuthService } from '../services/auth-service';
import { AuthContext, type AuthContextValue, type AuthStatus } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => getBrowserSupabaseClient(), []);
  const service = useMemo(() => (client ? new AuthService(client) : null), [client]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(Boolean(service));

  useEffect(() => {
    if (!service) return;
    let active = true;
    void service
      .session()
      .then((session) => {
        if (active) setUser(session?.user ?? null);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const subscription = service.onChange((_event, session) => {
      if (active) {
        setUser(session?.user ?? null);
        setLoading(false);
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [service]);

  const value = useMemo<AuthContextValue>(() => {
    const status: AuthStatus = !service
      ? 'unconfigured'
      : loading
        ? 'loading'
        : user
          ? 'authenticated'
          : 'guest';
    return {
      client,
      service,
      user,
      status,
      identity: user ? { kind: 'authenticated', userId: user.id } : { kind: 'guest' },
    };
  }, [client, loading, service, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
