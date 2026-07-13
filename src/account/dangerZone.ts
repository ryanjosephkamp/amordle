import type { BrrrdleSupabaseClient } from './supabaseClient'

export const DELETE_ACCOUNT_CONFIRMATION = 'DELETE AWORDLE ACCOUNT'
export const RESET_PROGRESS_CONFIRMATION = 'RESET AWORDLE PROGRESS'

export function isConfirmationMatch(value: string, expected: string): boolean {
  return value.trim() === expected
}

export async function requestPasswordReset(client: BrrrdleSupabaseClient, email: string): Promise<{ readonly ok: true } | { readonly message: string; readonly ok: false }> {
  const { error } = await client.auth.resetPasswordForEmail(email.trim().toLocaleLowerCase('en-US'))
  return error ? { message: error.message, ok: false } : { ok: true }
}

export async function requestEmailChange(client: BrrrdleSupabaseClient, email: string): Promise<{ readonly ok: true } | { readonly message: string; readonly ok: false }> {
  const { error } = await client.auth.updateUser({ email: email.trim().toLocaleLowerCase('en-US') })
  return error ? { message: error.message, ok: false } : { ok: true }
}
