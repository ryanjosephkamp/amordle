import { describe, expect, it } from 'vitest';
import {
  IdentityTransitionMachine,
  settledIdentity,
} from '../../src/services/identity-transition-machine';

const accountA = '00000000-0000-4000-8000-000000000001';
const accountB = '00000000-0000-4000-8000-000000000002';

describe('IdentityTransitionMachine', () => {
  it('restores guest without creating an account transfer', () => {
    const machine = new IdentityTransitionMachine();
    expect(machine.dispatch({ type: 'configure' }).state.status).toBe('restoring');
    const result = machine.dispatch({ type: 'session-resolved', userId: null });
    expect(result).toMatchObject({
      accepted: true,
      state: { status: 'guest', identity: { kind: 'guest' } },
      effects: [],
    });
    expect(settledIdentity(machine.state)).toEqual({ kind: 'guest' });
  });

  it('does not expose an account until its exact hydration completes', () => {
    const machine = new IdentityTransitionMachine();
    machine.dispatch({ type: 'configure' });
    const pending = machine.dispatch({ type: 'session-resolved', userId: accountA });
    expect(pending.state).toMatchObject({
      status: 'hydrating-account',
      target: { userId: accountA },
      reason: 'restore',
    });
    expect(settledIdentity(machine.state)).toBeNull();
    expect(pending.effects).toEqual([
      {
        type: 'hydrate-account',
        identity: { kind: 'authenticated', userId: accountA },
        epoch: pending.state.epoch,
      },
    ]);

    machine.dispatch({ type: 'account-hydrated', userId: accountA, epoch: pending.state.epoch });
    expect(settledIdentity(machine.state)).toEqual({ kind: 'authenticated', userId: accountA });
  });

  it('clears the previous account before switching and ignores stale hydration', () => {
    const machine = new IdentityTransitionMachine();
    machine.dispatch({ type: 'configure' });
    const first = machine.dispatch({ type: 'session-resolved', userId: accountA });
    machine.dispatch({ type: 'account-hydrated', userId: accountA, epoch: first.state.epoch });

    const switching = machine.dispatch({ type: 'session-changed', userId: accountB });
    expect(switching.state).toMatchObject({
      status: 'hydrating-account',
      reason: 'account-switch',
      target: { userId: accountB },
    });
    expect(switching.effects.map(({ type }) => type)).toEqual([
      'clear-account-state',
      'hydrate-account',
    ]);
    expect(settledIdentity(machine.state)).toBeNull();

    const stale = machine.dispatch({
      type: 'account-hydrated',
      userId: accountA,
      epoch: first.state.epoch,
    });
    expect(stale.accepted).toBe(false);
    expect(machine.state).toBe(switching.state);

    machine.dispatch({
      type: 'account-hydrated',
      userId: accountB,
      epoch: switching.state.epoch,
    });
    expect(settledIdentity(machine.state)).toEqual({ kind: 'authenticated', userId: accountB });
  });

  it('signs out to the untouched guest namespace and clears account state', () => {
    const machine = new IdentityTransitionMachine();
    machine.dispatch({ type: 'configure' });
    const pending = machine.dispatch({ type: 'session-resolved', userId: accountA });
    machine.dispatch({ type: 'account-hydrated', userId: accountA, epoch: pending.state.epoch });
    const signedOut = machine.dispatch({ type: 'session-changed', userId: null });
    expect(signedOut).toMatchObject({
      state: { status: 'guest', identity: { kind: 'guest' } },
      effects: [{ type: 'clear-account-state' }],
    });
  });

  it('keeps hydration failures unsettled and retries with a new epoch', () => {
    const machine = new IdentityTransitionMachine();
    machine.dispatch({ type: 'configure' });
    const pending = machine.dispatch({ type: 'session-resolved', userId: accountA });
    machine.dispatch({
      type: 'account-hydration-failed',
      userId: accountA,
      epoch: pending.state.epoch,
    });
    expect(machine.state.status).toBe('account-error');
    expect(settledIdentity(machine.state)).toBeNull();

    const retry = machine.dispatch({ type: 'retry' });
    expect(retry.state.status).toBe('hydrating-account');
    expect(retry.state.epoch).toBeGreaterThan(pending.state.epoch);
    expect(retry.effects[0]?.type).toBe('hydrate-account');
  });
});
