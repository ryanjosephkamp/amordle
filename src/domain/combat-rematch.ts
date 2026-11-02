export type RematchRequestStatus =
  'pending' | 'accepted' | 'created' | 'declined' | 'cancelled' | 'expired';

/*
 * The structural shape the view needs. Declared here rather than imported from the
 * adapter so the domain stays free of transport types.
 */
export interface RematchSnapshot {
  request_status: RematchRequestStatus;
  viewer_can_accept: boolean;
  viewer_can_cancel: boolean;
  created_game_id: string | null;
  expires_at: string;
}

export interface RematchViewState {
  action: 'request' | 'respond' | 'cancel' | 'join';
  joinGameId: string | null;
  lastOutcome: 'declined' | 'cancelled' | 'expired' | null;
}

const OFFER: RematchViewState = { action: 'request', joinGameId: null, lastOutcome: null };

/*
 * A1. The previous logic asked only whether the request was still pending, which
 * collapsed five distinct server states into one "offer a new request" branch. The
 * player who *asked* for the rematch therefore saw REQUEST REMATCH again the moment
 * their opponent accepted — even though the accepted game's id was already sitting on
 * the row they were polling, because only the accepting player's own mutation result
 * ever triggered navigation.
 *
 * Note the server never emits 'pending' or 'accepted': its statuses are requested,
 * created, declined, cancelled and expired, and the adapter renames requested to
 * pending. Both spellings are accepted here so a schema rename cannot silently strand
 * a player again.
 */
export function rematchViewState(
  latest: RematchSnapshot | undefined,
  nowMs: number,
): RematchViewState {
  if (!latest) return OFFER;

  if (
    latest.created_game_id &&
    (latest.request_status === 'created' || latest.request_status === 'accepted')
  ) {
    return { action: 'join', joinGameId: latest.created_game_id, lastOutcome: null };
  }

  if (latest.request_status === 'pending') {
    // Requests expire lazily server-side, so a polled row can outlive its window.
    if (Date.parse(latest.expires_at) <= nowMs) return { ...OFFER, lastOutcome: 'expired' };
    if (latest.viewer_can_accept) return { action: 'respond', joinGameId: null, lastOutcome: null };
    if (latest.viewer_can_cancel) return { action: 'cancel', joinGameId: null, lastOutcome: null };
    return OFFER;
  }

  if (
    latest.request_status === 'declined' ||
    latest.request_status === 'cancelled' ||
    latest.request_status === 'expired'
  ) {
    return { ...OFFER, lastOutcome: latest.request_status };
  }

  // 'created' with no game id: incomplete rather than terminal, so never a dead end.
  return OFFER;
}
