import type { AuthState } from '../account/auth'

export interface AdminAccessResult {
  readonly allowed: boolean
  readonly reason?: 'missing-authentication' | 'missing-admin-role' | 'unconfigured'
}

export function evaluateAdminAccess(authState: AuthState): AdminAccessResult {
  if (authState.status === 'unconfigured') {
    return { allowed: false, reason: 'unconfigured' }
  }

  if (authState.status !== 'authenticated' || !authState.user) {
    return { allowed: false, reason: 'missing-authentication' }
  }

  return authState.user.roles.includes('admin') ? { allowed: true } : { allowed: false, reason: 'missing-admin-role' }
}
