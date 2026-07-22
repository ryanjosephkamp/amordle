import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AmordleSupabaseClient } from '../../src/lib/supabase-browser';
import { AuthService } from '../../src/services/auth-service';

afterEach(() => {
  vi.unstubAllGlobals();
});

function authClient() {
  const session = { access_token: 'opaque-session' };
  const user = { id: '00000000-0000-4000-8000-000000000101' };
  const auth = {
    getSession: vi.fn(async () => ({ data: { session }, error: null })),
    getUser: vi.fn(async () => ({ data: { user }, error: null })),
    signUp: vi.fn(async () => ({ data: { session }, error: null })),
    signInWithPassword: vi.fn(async () => ({ data: { session }, error: null })),
    resetPasswordForEmail: vi.fn(async () => ({ error: null })),
    updateUser: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => ({ error: null })),
  };
  return {
    auth,
    client: { auth } as unknown as AmordleSupabaseClient,
    session,
    user,
  };
}

describe('account authentication service', () => {
  it('covers restore, create, sign-in, reset, recovery update, and local sign-out with bounded inputs', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://preview.amordle.test' } });
    const fixture = authClient();
    const service = new AuthService(fixture.client);

    await expect(service.session()).resolves.toBe(fixture.session);
    await expect(service.user()).resolves.toBe(fixture.user);
    await expect(service.signUp('  PLAYER@Example.Test ', 'long-enough-password')).resolves.toBe(
      fixture.session,
    );
    await expect(service.signIn('player@example.test', 'long-enough-password')).resolves.toBe(
      fixture.session,
    );
    await service.requestPasswordReset('player@example.test');
    await service.updatePassword('new-long-enough-password');
    await service.signOut();

    expect(fixture.auth.signUp).toHaveBeenCalledWith({
      email: 'player@example.test',
      password: 'long-enough-password',
    });
    expect(fixture.auth.resetPasswordForEmail).toHaveBeenCalledWith('player@example.test', {
      redirectTo: 'https://preview.amordle.test/auth/callback?recovery=1',
    });
    expect(fixture.auth.updateUser).toHaveBeenCalledWith({
      password: 'new-long-enough-password',
    });
    expect(fixture.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('rejects cross-origin recovery redirects before contacting authentication authority', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://preview.amordle.test' } });
    const fixture = authClient();
    await expect(
      new AuthService(fixture.client).requestPasswordReset(
        'player@example.test',
        'https://attacker.example/reset',
      ),
    ).rejects.toMatchObject({ failure: { code: 'validation' } });
    expect(fixture.auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('surfaces a typed authentication failure when sign-in returns no session', async () => {
    const fixture = authClient();
    fixture.auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: null as unknown as typeof fixture.session },
      error: null,
    });
    await expect(
      new AuthService(fixture.client).signIn('player@example.test', 'long-enough-password'),
    ).rejects.toMatchObject({ failure: { code: 'authentication', retryable: false } });
  });

  it('validates account credentials before making an external auth request', async () => {
    const fixture = authClient();
    await expect(new AuthService(fixture.client).signIn('not-an-email', 'short')).rejects.toThrow();
    expect(fixture.auth.signInWithPassword).not.toHaveBeenCalled();
  });
});
