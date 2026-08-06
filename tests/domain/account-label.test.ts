import { describe, expect, it } from 'vitest';
import {
  emailFallbackLength,
  guestAccountLabel,
  resolveAccountLabel,
  unknownAccountLabel,
} from '@/domain/account-label';

describe('ANNOT-11 account trigger label', () => {
  it('shows the configured player name when one exists', () => {
    expect(
      resolveAccountLabel({
        status: 'signed-in',
        displayName: 'ragnar',
        email: 'ragnargrandalf@example.com',
        profileResolved: true,
      }),
    ).toEqual({
      text: 'ragnar',
      accessibleName: 'Account menu for ragnar',
      source: 'player-name',
    });
  });

  it('falls back to a bounded email prefix only after the profile settles', () => {
    const pending = resolveAccountLabel({
      status: 'signed-in',
      displayName: null,
      email: 'ragnargrandalf@example.com',
      profileResolved: false,
    });
    // A pending lookup must not imply "this account has no player name".
    expect(pending.source).toBe('pending');
    expect(pending.text).toBe(unknownAccountLabel);

    const settled = resolveAccountLabel({
      status: 'signed-in',
      displayName: null,
      email: 'ragnargrandalf@example.com',
      profileResolved: true,
    });
    expect(settled.source).toBe('email');
    expect(settled.text).toBe('ragnargran…');
    // Never leaks the domain, and stays inside the toolbar budget.
    expect(settled.text).not.toContain('@');
    expect(settled.text.replace('…', '').length).toBeLessThanOrEqual(emailFallbackLength);
  });

  it('does not truncate a short local part', () => {
    expect(
      resolveAccountLabel({
        status: 'signed-in',
        displayName: '',
        email: 'ryan@example.com',
        profileResolved: true,
      }).text,
    ).toBe('ryan');
  });

  it('shows guest when signed out and keeps the sign-in affordance accessible', () => {
    const label = resolveAccountLabel({ status: 'signed-out' });
    expect(label.text).toBe(guestAccountLabel);
    expect(label.source).toBe('guest');
    expect(label.accessibleName).toMatch(/sign in/i);
  });

  it('shows a neutral label while an account transition is in flight', () => {
    // Guards against flashing the previous account's name during a switch.
    const label = resolveAccountLabel({
      status: 'loading',
      displayName: 'previous-account',
      email: 'previous@example.com',
      profileResolved: true,
    });
    expect(label.text).toBe(unknownAccountLabel);
    expect(label.source).toBe('pending');
  });

  it('never guesses when the profile lookup failed and no email is available', () => {
    expect(
      resolveAccountLabel({
        status: 'signed-in',
        displayName: null,
        email: null,
        profileResolved: true,
      }).text,
    ).toBe(unknownAccountLabel);
  });

  it('treats unavailable and error account services as guest, not signed in', () => {
    for (const status of ['unavailable', 'error'] as const) {
      expect(resolveAccountLabel({ status }).text).toBe(guestAccountLabel);
    }
  });
});
