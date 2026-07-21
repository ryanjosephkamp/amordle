import type { AuthChangeEvent, Session, Subscription, User } from '@supabase/supabase-js';
import { z } from 'zod';
import type { AmordleSupabaseClient } from '../lib/supabase-browser';
import { ServiceError, throwIfServiceError } from './service-error';

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const passwordSchema = z.string().min(8).max(256);

function sameOriginUrl(path: string): string {
  const url = new URL(path, window.location.origin);
  if (url.origin !== window.location.origin) {
    throw new ServiceError('validation', 'Authentication redirect must remain on this origin.');
  }
  return url.toString();
}

export class AuthService {
  constructor(private readonly client: AmordleSupabaseClient) {}

  async session(): Promise<Session | null> {
    const { data, error } = await this.client.auth.getSession();
    throwIfServiceError(error, 'Restore session');
    return data.session;
  }

  async user(): Promise<User | null> {
    const { data, error } = await this.client.auth.getUser();
    throwIfServiceError(error, 'Load account');
    return data.user;
  }

  async signUp(email: string, password: string): Promise<Session | null> {
    const { data, error } = await this.client.auth.signUp({
      email: emailSchema.parse(email),
      password: passwordSchema.parse(password),
    });
    throwIfServiceError(error, 'Create account');
    return data.session;
  }

  async signIn(email: string, password: string): Promise<Session> {
    const { data, error } = await this.client.auth.signInWithPassword({
      email: emailSchema.parse(email),
      password: passwordSchema.parse(password),
    });
    throwIfServiceError(error, 'Sign in');
    if (!data.session)
      throw new ServiceError('authentication', 'Sign in did not create a session.');
    return data.session;
  }

  async requestPasswordReset(
    email: string,
    callbackPath = '/auth/callback?recovery=1',
  ): Promise<void> {
    const { error } = await this.client.auth.resetPasswordForEmail(emailSchema.parse(email), {
      redirectTo: sameOriginUrl(callbackPath),
    });
    throwIfServiceError(error, 'Request password recovery');
  }

  async updatePassword(password: string): Promise<void> {
    const { error } = await this.client.auth.updateUser({
      password: passwordSchema.parse(password),
    });
    throwIfServiceError(error, 'Update password');
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut({ scope: 'local' });
    throwIfServiceError(error, 'Sign out');
  }

  onChange(callback: (event: AuthChangeEvent, session: Session | null) => void): Subscription {
    return this.client.auth.onAuthStateChange(callback).data.subscription;
  }
}
