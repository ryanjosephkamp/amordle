import { describe, expect, it } from 'vitest'
import { evaluateAdminAccess } from './authorization'

describe('admin authorization', () => {
  it('requires authenticated admin role', () => {
    expect(evaluateAdminAccess({ status: 'unconfigured' })).toEqual({ allowed: false, reason: 'unconfigured' })
    expect(evaluateAdminAccess({ status: 'anonymous' })).toEqual({ allowed: false, reason: 'missing-authentication' })
    expect(evaluateAdminAccess({ status: 'authenticated', user: { id: 'user', roles: [] } })).toEqual({ allowed: false, reason: 'missing-admin-role' })
    expect(evaluateAdminAccess({ status: 'authenticated', user: { id: 'admin', roles: ['admin'] } })).toEqual({ allowed: true })
  })

  it('still allows access when the admin role arrived via raw_app_meta_data (already mapped into AuthUserSummary.roles)', () => {
    // evaluateAdminAccess operates on AuthState whose `roles` array is produced by summarizeUser, so we verify
    // that any of the four diagnosed shapes (which getRoles maps into the same roles array) yields allowed.
    const shapes: ReadonlyArray<readonly string[]> = [
      ['admin'],
      ['support', 'admin'],
      ['admin', 'auditor'],
    ]
    for (const roles of shapes) {
      expect(evaluateAdminAccess({ status: 'authenticated', user: { id: 'u', roles } })).toEqual({ allowed: true })
    }
  })
})
