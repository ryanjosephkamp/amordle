import { describe, expect, it } from 'vitest'
import type { PrivateMatchRequestResult } from './multiplayerRepository'
import {
  getPrivateRequestCounterpart,
  getPrivateRequestDirectionAfterAsyncLoad,
  selectPrivateRequestCenterRows,
} from './privateRequestCenter'

function request(overrides: Partial<PrivateMatchRequestResult> = {}): PrivateMatchRequestResult {
  return {
    created: false, createdAt: '2026-07-10T12:00:00.000Z', expired: false,
    expiresAt: '2026-07-10T12:10:00.000Z', hardMode: false, idempotent: false, mode: 'og',
    opponent: { displayName: 'Opponent', identityAvailable: true, publicProfileId: '22222222-2222-4222-8222-222222222222' },
    requestId: 'request-1',
    requester: { displayName: 'Requester', identityAvailable: true, publicProfileId: '11111111-1111-4111-8111-111111111111' },
    requestStatus: 'requested', updatedAt: '2026-07-10T12:00:00.000Z',
    viewerCanAccept: false, viewerCanCancel: true, viewerCanDecline: false,
    viewerRole: 'requester', wordLength: 5, ...overrides,
  }
}

describe('private request center selectors', () => {
  it('separates incoming and outgoing rows and sorts newest first', () => {
    const incoming = request({ requestId: 'incoming', updatedAt: '2026-07-10T12:02:00.000Z', viewerCanAccept: true, viewerCanCancel: false, viewerCanDecline: true, viewerRole: 'opponent' })
    const olderOutgoing = request({ requestId: 'older', updatedAt: '2026-07-10T12:01:00.000Z' })
    const newestOutgoing = request({ requestId: 'newest', mode: 'go', updatedAt: '2026-07-10T12:03:00.000Z' })
    expect(selectPrivateRequestCenterRows([olderOutgoing, incoming, newestOutgoing], 'incoming')).toEqual([incoming])
    expect(selectPrivateRequestCenterRows([olderOutgoing, incoming, newestOutgoing], 'outgoing')).toEqual([newestOutgoing, olderOutgoing])
  })

  it('keeps terminal history filterable and selects only the counterpart summary', () => {
    const created = request({ createdGameId: 'private-game-1', requestStatus: 'created', respondedAt: '2026-07-10T12:04:00.000Z', updatedAt: '2026-07-10T12:04:00.000Z' })
    const declined = request({ requestId: 'declined', requestStatus: 'declined', viewerCanCancel: false })
    expect(selectPrivateRequestCenterRows([declined, created], 'outgoing', 'created')).toEqual([created])
    expect(getPrivateRequestCounterpart(created)).toEqual(created.opponent)
    expect(getPrivateRequestCounterpart(request({ viewerRole: 'opponent' }))).toEqual(created.requester)
  })

  it('selects the requester lane when the first active row arrives asynchronously without overriding later choices', () => {
    const outgoing = request()
    expect(getPrivateRequestDirectionAfterAsyncLoad([outgoing], 'incoming', 0)).toBe('outgoing')
    expect(getPrivateRequestDirectionAfterAsyncLoad([outgoing], 'incoming', 1)).toBe('incoming')
  })
})
