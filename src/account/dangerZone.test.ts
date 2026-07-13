import { describe, expect, it } from 'vitest'
import { DELETE_ACCOUNT_CONFIRMATION, RESET_PROGRESS_CONFIRMATION, isConfirmationMatch } from './dangerZone'

describe('danger zone confirmations', () => {
  it('requires exact typed confirmations for destructive actions', () => {
    expect(isConfirmationMatch(` ${RESET_PROGRESS_CONFIRMATION} `, RESET_PROGRESS_CONFIRMATION)).toBe(true)
    expect(isConfirmationMatch('reset awordle progress', RESET_PROGRESS_CONFIRMATION)).toBe(false)
    expect(isConfirmationMatch(DELETE_ACCOUNT_CONFIRMATION, DELETE_ACCOUNT_CONFIRMATION)).toBe(true)
  })
})
