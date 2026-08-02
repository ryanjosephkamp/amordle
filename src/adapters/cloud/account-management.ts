'use client';

import {
  accountLifecycleReceiptSchema,
  dangerChallengeSchema,
  type AccountDangerAction,
} from '@/domain/account-lifecycle';
import { getBrowserSupabase } from './browser';
import { ServiceError } from './shared';

function client() {
  const value = getBrowserSupabase();
  if (!value) throw new ServiceError('Account services are unavailable.', 'UNAVAILABLE');
  return value;
}

function readableAuthError(error: { message?: string } | null, fallback: string): Error {
  if (!error) return new Error(fallback);
  const message = error.message?.toLowerCase() ?? '';
  if (message.includes('invalid login credentials'))
    return new Error('The current password is incorrect.');
  if (message.includes('password'))
    return new Error('That password does not meet the account requirements.');
  if (message.includes('email')) return new Error('That email address could not be used.');
  return new Error(fallback);
}

async function throwFunctionServiceError(error: unknown): Promise<never> {
  const candidate = error as { context?: unknown; message?: unknown };
  if (candidate.context instanceof Response) {
    try {
      const payload = (await candidate.context.clone().json()) as { error?: unknown };
      if (typeof payload.error === 'string' && payload.error.trim()) {
        throw new ServiceError(payload.error, 'ACCOUNT_LIFECYCLE');
      }
    } catch (parseError) {
      if (parseError instanceof ServiceError) throw parseError;
    }
  }
  throw new ServiceError(
    typeof candidate.message === 'string' && candidate.message.trim()
      ? candidate.message
      : 'Account services are temporarily unavailable.',
    'ACCOUNT_LIFECYCLE',
  );
}

export async function reauthenticateCurrentUser(email: string, password: string) {
  const { error } = await client().auth.signInWithPassword({ email, password });
  if (error) throw readableAuthError(error, 'We could not verify the current password.');
}

export async function changeAccountEmail(input: {
  currentEmail: string;
  currentPassword: string;
  newEmail: string;
}) {
  await reauthenticateCurrentUser(input.currentEmail, input.currentPassword);
  const { data, error } = await client().auth.updateUser(
    { email: input.newEmail },
    { emailRedirectTo: `${window.location.origin}/auth/callback` },
  );
  if (error) throw readableAuthError(error, 'We could not request that email change.');
  return {
    verificationPending: data.user.email?.toLowerCase() !== input.newEmail.toLowerCase(),
    email: data.user.email ?? input.currentEmail,
  };
}

export async function changeAccountPassword(input: {
  currentEmail: string;
  currentPassword: string;
  newPassword: string;
}) {
  await reauthenticateCurrentUser(input.currentEmail, input.currentPassword);
  const { error } = await client().auth.updateUser({ password: input.newPassword });
  if (error) throw readableAuthError(error, 'We could not change that password.');
}

export async function prepareAccountDangerAction(action: AccountDangerAction, password: string) {
  const { data, error } = await client().functions.invoke('account-lifecycle-v1', {
    body: { operation: 'prepare', action, password },
  });
  if (error) await throwFunctionServiceError(error);
  return dangerChallengeSchema.parse(data);
}

export async function confirmAccountDangerAction(input: {
  action: AccountDangerAction;
  confirmationToken: string;
}) {
  const { data, error } = await client().functions.invoke('account-lifecycle-v1', {
    body: {
      operation: 'confirm',
      action: input.action,
      confirmationToken: input.confirmationToken,
    },
  });
  if (error) await throwFunctionServiceError(error);
  return accountLifecycleReceiptSchema.parse(data);
}
