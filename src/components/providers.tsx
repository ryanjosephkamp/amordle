'use client';

import type { Session, User } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { myProfileQueryKey } from '@/application/query-keys';
import {
  invalidateAccountProjections,
  isAccountProjectionRoute,
} from '@/application/account-query-freshness';
import { getBrowserSupabase } from '@/adapters/supabase/browser';
import { getMyPublicProfile } from '@/adapters/supabase/public';
import { accentCssVariableMap, defaultAccentName } from '@/domain/profile';
import { FeedbackPreferencesProvider } from './feedback-preferences';

interface AuthContextValue {
  status: 'loading' | 'signed-out' | 'signed-in' | 'unavailable' | 'error';
  user: User | null;
  session: Session | null;
  message: string | null;
  /** Resolves true only when a session was established (ANNOT-10 redirect gate). */
  signIn(email: string, password: string): Promise<boolean>;
  /** Resolves true only when registration produced an immediate session. */
  register(email: string, password: string): Promise<boolean>;
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
          return false;
        }
        const epoch = coordinator.current.begin(data.user.id);
        settleSession(data.session, epoch);
        return Boolean(data.session);
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
          return false;
        }
        const epoch = coordinator.current.begin(data.user?.id ?? null);
        settleSession(data.session, epoch);
        if (!data.session) {
          setMessage('Check your email to finish creating your account.');
        }
        return Boolean(data.session);
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
        <FeedbackPreferencesProvider>
          <ProfileAccentBridge />
          <CompletionReconciler />
          {children}
        </FeedbackPreferencesProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function ProfileAccentBridge() {
  const auth = useAuth();
  const userId = auth.user?.id ?? '';
  const profile = useQuery({
    queryKey: myProfileQueryKey(userId),
    queryFn: getMyPublicProfile,
    enabled: auth.status === 'signed-in' && Boolean(userId),
    staleTime: 30_000,
  });

  useEffect(() => {
    const root = document.documentElement;
    const customVariables = accentCssVariableMap(profile.data?.accent_hex ?? '');
    const hasCustomAccent =
      auth.status === 'signed-in' &&
      Boolean(profile.data?.active_accent_preset_id) &&
      Boolean(customVariables);

    for (const property of Object.keys(accentCssVariableMap('#32BFA2') ?? {})) {
      root.style.removeProperty(property);
    }

    if (hasCustomAccent && customVariables) {
      root.dataset.accent = 'custom';
      for (const [property, value] of Object.entries(customVariables)) {
        root.style.setProperty(property, value);
      }
    } else {
      root.dataset.accent =
        auth.status === 'signed-in'
          ? (profile.data?.accent_color ?? defaultAccentName)
          : defaultAccentName;
    }
  }, [
    auth.status,
    profile.data?.accent_color,
    profile.data?.accent_hex,
    profile.data?.active_accent_preset_id,
    userId,
  ]);

  return null;
}

function CompletionReconciler() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const userId = auth.user?.id;
  const previousUserId = useRef<string | undefined>(undefined);

  const reconcile = useCallback(async () => {
    if (!userId) return;
    const result = await reconcileCompletionOutbox(userId);
    if (result.synced > 0) {
      await invalidateAccountProjections(queryClient, userId, { includeRanked: true });
    }
  }, [queryClient, userId]);

  useEffect(() => {
    if (!userId) return;
    const previous = previousUserId.current;
    previousUserId.current = userId;
    if (previous && previous !== userId) {
      void queryClient.cancelQueries();
      queryClient.removeQueries({
        predicate: (query) => query.queryKey.some((part) => part === previous),
      });
    }
    void reconcile()
      .then(() => {
        if (isAccountProjectionRoute(pathname)) {
          return invalidateAccountProjections(queryClient, userId, {
            includeRanked: pathname === '/leaderboards' || pathname === '/stats',
          });
        }
      })
      .catch(() => undefined);
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
  }, [pathname, queryClient, reconcile, userId]);

  return null;
}
