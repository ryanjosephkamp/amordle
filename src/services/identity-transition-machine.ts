import { z } from 'zod';
import type { IdentityScope } from '../persistence/local-repository';

const userIdSchema = z.string().uuid();

export type AccountHydrationReason = 'restore' | 'sign-in' | 'account-switch';

export type IdentityTransitionState =
  | { readonly status: 'unconfigured'; readonly epoch: number }
  | { readonly status: 'restoring'; readonly epoch: number }
  | {
      readonly status: 'guest';
      readonly epoch: number;
      readonly identity: { readonly kind: 'guest' };
    }
  | {
      readonly status: 'hydrating-account';
      readonly epoch: number;
      readonly target: { readonly kind: 'authenticated'; readonly userId: string };
      readonly reason: AccountHydrationReason;
    }
  | {
      readonly status: 'authenticated';
      readonly epoch: number;
      readonly identity: { readonly kind: 'authenticated'; readonly userId: string };
    }
  | {
      readonly status: 'account-error';
      readonly epoch: number;
      readonly target: { readonly kind: 'authenticated'; readonly userId: string };
      readonly reason: AccountHydrationReason;
    }
  | { readonly status: 'restore-error'; readonly epoch: number };

export type IdentityTransitionEvent =
  | { readonly type: 'configure' }
  | { readonly type: 'unconfigure' }
  | { readonly type: 'session-resolved'; readonly userId: string | null }
  | { readonly type: 'session-changed'; readonly userId: string | null }
  | {
      readonly type: 'account-hydrated';
      readonly userId: string;
      readonly epoch: number;
    }
  | {
      readonly type: 'account-hydration-failed';
      readonly userId: string;
      readonly epoch: number;
    }
  | { readonly type: 'restore-failed' }
  | { readonly type: 'retry' };

export type IdentityTransitionEffect =
  | {
      readonly type: 'hydrate-account';
      readonly identity: { readonly kind: 'authenticated'; readonly userId: string };
      readonly epoch: number;
    }
  | { readonly type: 'clear-account-state' };

export type IdentityTransitionResult = {
  readonly accepted: boolean;
  readonly state: IdentityTransitionState;
  readonly effects: readonly IdentityTransitionEffect[];
};

function authenticatedIdentity(userId: string) {
  return { kind: 'authenticated', userId: userIdSchema.parse(userId) } as const;
}

function hydrationState(
  epoch: number,
  userId: string,
  reason: AccountHydrationReason,
): IdentityTransitionState {
  return {
    status: 'hydrating-account',
    epoch,
    target: authenticatedIdentity(userId),
    reason,
  };
}

function hydrateEffect(state: Extract<IdentityTransitionState, { status: 'hydrating-account' }>) {
  return { type: 'hydrate-account', identity: state.target, epoch: state.epoch } as const;
}

export function settledIdentity(state: IdentityTransitionState): IdentityScope | null {
  if (state.status === 'guest' || state.status === 'authenticated') return state.identity;
  return null;
}

/**
 * Models authentication separately from account-data hydration. During account
 * restore and account switching there is deliberately no settled identity, so
 * consumers cannot render the previous account or reinterpret it as guest data.
 * Async hydration completions are accepted only for their exact epoch and user.
 */
export class IdentityTransitionMachine {
  private current: IdentityTransitionState = { status: 'unconfigured', epoch: 0 };

  get state(): IdentityTransitionState {
    return this.current;
  }

  dispatch(event: IdentityTransitionEvent): IdentityTransitionResult {
    const previous = this.current;
    const ignored = (): IdentityTransitionResult => ({
      accepted: false,
      state: this.current,
      effects: [],
    });
    const accept = (
      state: IdentityTransitionState,
      effects: readonly IdentityTransitionEffect[] = [],
    ): IdentityTransitionResult => {
      this.current = state;
      return { accepted: true, state, effects };
    };

    if (event.type === 'unconfigure') {
      const effects: IdentityTransitionEffect[] =
        previous.status === 'authenticated' ||
        previous.status === 'hydrating-account' ||
        previous.status === 'account-error'
          ? [{ type: 'clear-account-state' }]
          : [];
      return accept({ status: 'unconfigured', epoch: previous.epoch + 1 }, effects);
    }

    if (event.type === 'configure') {
      if (previous.status !== 'unconfigured') return ignored();
      return accept({ status: 'restoring', epoch: previous.epoch + 1 });
    }

    if (event.type === 'restore-failed') {
      if (previous.status !== 'restoring') return ignored();
      return accept({ status: 'restore-error', epoch: previous.epoch });
    }

    if (event.type === 'retry') {
      if (previous.status === 'restore-error') {
        return accept({ status: 'restoring', epoch: previous.epoch + 1 });
      }
      if (previous.status === 'account-error') {
        const next = hydrationState(previous.epoch + 1, previous.target.userId, previous.reason);
        if (next.status !== 'hydrating-account') return ignored();
        return accept(next, [hydrateEffect(next)]);
      }
      return ignored();
    }

    if (event.type === 'session-resolved') {
      if (previous.status !== 'restoring') return ignored();
      if (event.userId === null) {
        return accept({ status: 'guest', epoch: previous.epoch + 1, identity: { kind: 'guest' } });
      }
      const next = hydrationState(previous.epoch + 1, event.userId, 'restore');
      if (next.status !== 'hydrating-account') return ignored();
      return accept(next, [hydrateEffect(next)]);
    }

    if (event.type === 'session-changed') {
      if (previous.status === 'unconfigured') return ignored();
      if (event.userId === null) {
        const effects: IdentityTransitionEffect[] =
          previous.status === 'authenticated' ||
          previous.status === 'hydrating-account' ||
          previous.status === 'account-error'
            ? [{ type: 'clear-account-state' }]
            : [];
        return accept(
          { status: 'guest', epoch: previous.epoch + 1, identity: { kind: 'guest' } },
          effects,
        );
      }
      const target = authenticatedIdentity(event.userId);
      if (previous.status === 'authenticated' && previous.identity.userId === target.userId) {
        return ignored();
      }
      if (previous.status === 'hydrating-account' && previous.target.userId === target.userId) {
        return ignored();
      }
      const reason: AccountHydrationReason =
        previous.status === 'authenticated' ? 'account-switch' : 'sign-in';
      const next = hydrationState(previous.epoch + 1, target.userId, reason);
      if (next.status !== 'hydrating-account') return ignored();
      const effects: IdentityTransitionEffect[] =
        previous.status === 'authenticated' ||
        previous.status === 'hydrating-account' ||
        previous.status === 'account-error'
          ? [{ type: 'clear-account-state' }, hydrateEffect(next)]
          : [hydrateEffect(next)];
      return accept(next, effects);
    }

    if (event.type === 'account-hydrated' || event.type === 'account-hydration-failed') {
      const userId = userIdSchema.parse(event.userId);
      if (
        previous.status !== 'hydrating-account' ||
        previous.epoch !== event.epoch ||
        previous.target.userId !== userId
      ) {
        return ignored();
      }
      if (event.type === 'account-hydration-failed') {
        return accept({
          status: 'account-error',
          epoch: previous.epoch,
          target: previous.target,
          reason: previous.reason,
        });
      }
      return accept({
        status: 'authenticated',
        epoch: previous.epoch,
        identity: previous.target,
      });
    }

    return ignored();
  }
}
