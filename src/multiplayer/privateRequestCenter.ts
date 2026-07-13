import type {
  PrivateMatchProfileSummary,
  PrivateMatchRequestResult,
  PrivateMatchRequestStatus,
} from './multiplayerRepository'

export type PrivateRequestCenterDirection = 'incoming' | 'outgoing'
export type PrivateRequestCenterStatusFilter = 'all' | PrivateMatchRequestStatus

export function getPrivateRequestDirectionAfterAsyncLoad(
  requests: readonly PrivateMatchRequestResult[],
  currentDirection: PrivateRequestCenterDirection,
  previousActiveCount: number,
): PrivateRequestCenterDirection {
  if (previousActiveCount !== 0) return currentDirection
  const firstActive = requests.find((request) => request.requestStatus === 'requested' && !request.expired)
  if (!firstActive) return currentDirection
  return firstActive.viewerRole === 'requester' ? 'outgoing' : 'incoming'
}

export function getPrivateRequestCounterpart(request: PrivateMatchRequestResult): PrivateMatchProfileSummary {
  return request.viewerRole === 'opponent' ? request.requester : request.opponent
}

export function selectPrivateRequestCenterRows(
  requests: readonly PrivateMatchRequestResult[],
  direction: PrivateRequestCenterDirection,
  status: PrivateRequestCenterStatusFilter = 'all',
): readonly PrivateMatchRequestResult[] {
  return requests
    .filter((request) => direction === 'incoming'
      ? request.viewerRole === 'opponent'
      : request.viewerRole === 'requester')
    .filter((request) => status === 'all' || (request.requestStatus === status && (status !== 'requested' || !request.expired)))
    .sort((left, right) => (
      right.updatedAt.localeCompare(left.updatedAt)
      || right.createdAt.localeCompare(left.createdAt)
      || left.requestId.localeCompare(right.requestId)
    ))
}
