'use client';

import type { Session, User } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PropsWithChildren } from 'react';
import { AuthTransitionCoordinator } from '@/application/auth-transition';
import { reconcileCompletionOutbox } from '@/application/completion-outbox';
import { getBrowserSupabase } from '@/adapters/supabase/browser';

interface AuthContextValue {
  status: 'loading' | 'signed-out' | 'signed-in' | 'unavailable' | 'error';
  user: User | null;
  session: Session | null;
  message: string | null;
  signIn(email: string, password: string): Promise<void>;
  register(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  requestRecovery(email: string): Promise<void>;
  retry(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function AuthProvider({ children }: PropsWithChildren) {
  const supabase = useMemo(() => getBrowserSupabase(), []);
  const coordinator = useRef(new AuthTransitionCoordinator());
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthContextValue['status']>('loading');
  const [message, setMessage] = useState<string | null>(null);

  const settleSession = useCallback(
    (nextSession: Session | null, epoch: ReturnType<AuthTransitionCoordinator['begin']>) => {
      if (!coordinator.current.isCurrent(epoch)) return;
      setSession(nextSession);
      setStatus(nextSession ? 'signed-in' : 'signed-out');
      setMessage(null);
    },
    [],
  );

  const restore = useCallback(async () => {
    if (!supabase) {
      setStatus('unavailable');
      setMessage('Account services are not configured in this environment.');
      return;
    }
    const epoch = coordinator.current.begin(null);
    setStatus('loading');
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      if (coordinator.current.isCurrent(epoch)) {
        setStatus('error');
        setMessage('Your account is still signed in, but its saved state could not load.');
      }
      return;
    }
    const guarded = coordinator.current.begin(data.session?.user.id ?? null);
    settleSession(data.session, guarded);
  }, [settleSession, supabase]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void restore();
    });
    if (!supabase) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const epoch = coordinator.current.begin(nextSession?.user.id ?? null);
      settleSession(nextSession, epoch);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [restore, settleSession, supabase]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: session?.user ?? null,
      session,
      message,
      async signIn(email, password) {
        if (!supabase) throw new Error('Account services are unavailable.');
        setStatus('loading');
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          setStatus('signed-out');
          setMessage('We could not sign you in. Check your email and password.');
          return;
        }
        const epoch = coordinator.current.begin(data.user.id);
        settleSession(data.session, epoch);
      },
      async register(email, password) {
        if (!supabase) throw new Error('Account services are unavailable.');
        setStatus('loading');
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (error) {
          setStatus('signed-out');
          setMessage('We could not create that account.');
          return;
        }
        const epoch = coordinator.current.begin(data.user?.id ?? null);
        settleSession(data.session, epoch);
        if (!data.session) {
          setMessage('Check your email to finish creating your account.');
        }
      },
      async signOut() {
        if (!supabase) return;
        coordinator.current.begin(null);
        await supabase.auth.signOut();
        setSession(null);
        setStatus('signed-out');
      },
      async requestRecovery(email) {
        if (!supabase) throw new Error('Account services are unavailable.');
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/recovery`,
        });
        setMessage(
          error
            ? 'We could not send a recovery link.'
            : 'If that account exists, a recovery link is on its way.',
        );
      },
      retry: restore,
    }),
    [message, restore, session, settleSession, status, supabase],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AppProviders.');
  return value;
}

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5_000,
            refetchOnWindowFocus: true,
            retry: 1,
          },
          mutations: { retry: 0 },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CompletionReconciler />
        {children}
      </AuthProvider>
    </QueryClientProvider>
  );
}

function CompletionReconciler() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const userId = auth.user?.id;

  const reconcile = useCallback(async () => {
    if (!userId) return;
    const result = await reconcileCompletionOutbox(userId);
    if (result.synced > 0) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['completion-outbox', userId] }),
        queryClient.invalidateQueries({ queryKey: ['history', userId] }),
        queryClient.invalidateQueries({ queryKey: ['progress', userId] }),
        queryClient.invalidateQueries({ queryKey: ['economy'] }),
      ]);
    }
  }, [queryClient, userId]);

  useEffect(() => {
    if (!userId) return;
    void reconcile().catch(() => undefined);
    const onOnline = () => void reconcile().catch(() => undefined);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void reconcile().catch(() => undefined);
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [pathname, reconcile, userId]);

  return null;
}
