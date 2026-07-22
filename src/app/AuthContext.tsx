import type { User } from '@supabase/supabase-js';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '../components/Button';
import { getBrowserSupabaseClient } from '../lib/supabase-browser';
import { AccountRepository } from '../services/account-repository';
import { AuthService } from '../services/auth-service';
import {
  IdentityTransitionMachine,
  settledIdentity,
  type IdentityTransitionEffect,
  type IdentityTransitionResult,
  type IdentityTransitionState,
} from '../services/identity-transition-machine';
import { AuthContext, type AuthContextValue, type AuthStatus } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => getBrowserSupabaseClient(), []);
  const service = useMemo(() => (client ? new AuthService(client) : null), [client]);
  const accountRepository = useMemo(
    () => (client ? new AccountRepository(client) : null),
    [client],
  );
  const machine = useRef(new IdentityTransitionMachine());
  const [transition, setTransition] = useState<IdentityTransitionState>({
    status: 'unconfigured',
    epoch: 0,
  });
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!service || !accountRepository) {
      const result = machine.current.dispatch({ type: 'unconfigure' });
      if (result.accepted) setTransition(result.state);
      setUser(null);
      return;
    }
    let active = true;

    const runEffects = (effects: readonly IdentityTransitionEffect[]) => {
      for (const effect of effects) {
        if (effect.type !== 'hydrate-account') continue;
        void Promise.all([
          accountRepository.loadProgress(effect.identity.userId),
          accountRepository.loadSettings(effect.identity.userId),
        ])
          .then(() => {
            if (!active) return;
            apply(
              machine.current.dispatch({
                type: 'account-hydrated',
                userId: effect.identity.userId,
                epoch: effect.epoch,
              }),
            );
          })
          .catch(() => {
            if (!active) return;
            apply(
              machine.current.dispatch({
                type: 'account-hydration-failed',
                userId: effect.identity.userId,
                epoch: effect.epoch,
              }),
            );
          });
      }
    };
    const apply = (result: IdentityTransitionResult) => {
      if (!result.accepted || !active) return;
      setTransition(result.state);
      runEffects(result.effects);
    };

    apply(machine.current.dispatch({ type: 'configure' }));
    void service
      .session()
      .then((session) => {
        if (!active) return;
        setUser(session?.user ?? null);
        apply(
          machine.current.dispatch({
            type: 'session-resolved',
            userId: session?.user.id ?? null,
          }),
        );
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
        apply(machine.current.dispatch({ type: 'restore-failed' }));
      });
    const subscription = service.onChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      apply(
        machine.current.dispatch({
          type: 'session-changed',
          userId: session?.user.id ?? null,
        }),
      );
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [accountRepository, service]);

  const hydrateForRetry = (
    effect: Extract<IdentityTransitionEffect, { type: 'hydrate-account' }>,
  ) => {
    if (!accountRepository) return;
    void Promise.all([
      accountRepository.loadProgress(effect.identity.userId),
      accountRepository.loadSettings(effect.identity.userId),
    ]).then(
      () => {
        const completed = machine.current.dispatch({
          type: 'account-hydrated',
          userId: effect.identity.userId,
          epoch: effect.epoch,
        });
        if (completed.accepted) setTransition(completed.state);
      },
      () => {
        const failed = machine.current.dispatch({
          type: 'account-hydration-failed',
          userId: effect.identity.userId,
          epoch: effect.epoch,
        });
        if (failed.accepted) setTransition(failed.state);
      },
    );
  };

  const retry = () => {
    const retryingRestore = transition.status === 'restore-error';
    const result = machine.current.dispatch({ type: 'retry' });
    if (!result.accepted) return;
    setTransition(result.state);
    const effect = result.effects.find((item) => item.type === 'hydrate-account');
    if (retryingRestore && service) {
      void service.session().then(
        (session) => {
          setUser(session?.user ?? null);
          const restored = machine.current.dispatch({
            type: 'session-resolved',
            userId: session?.user.id ?? null,
          });
          if (restored.accepted) {
            setTransition(restored.state);
            const hydration = restored.effects.find((item) => item.type === 'hydrate-account');
            if (hydration) hydrateForRetry(hydration);
          }
        },
        () => {
          const failed = machine.current.dispatch({ type: 'restore-failed' });
          if (failed.accepted) setTransition(failed.state);
        },
      );
      return;
    }
    if (!effect || !accountRepository) return;
    hydrateForRetry(effect);
  };

  const value = useMemo<AuthContextValue>(() => {
    const identity = settledIdentity(transition);
    const status: AuthStatus = !service
      ? 'unconfigured'
      : !identity
        ? 'loading'
        : identity.kind === 'authenticated'
          ? 'authenticated'
          : 'guest';
    return {
      client,
      service,
      user,
      status,
      identity: identity ?? { kind: 'guest' },
    };
  }, [client, service, transition, user]);

  if (service && !settledIdentity(transition)) {
    const failed = transition.status === 'account-error' || transition.status === 'restore-error';
    return (
      <main className="route-loading" aria-live="polite" aria-busy={!failed}>
        <span aria-hidden="true" />
        <p>{failed ? 'Account hydration could not be verified.' : 'Restoring account scope…'}</p>
        <small>
          {failed
            ? 'No guest or previous-account data has been substituted.'
            : 'Saved account data is validated before the application becomes interactive.'}
        </small>
        {failed ? <Button onClick={retry}>Retry account restore</Button> : null}
      </main>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
