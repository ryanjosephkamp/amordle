export interface CombatClockReading {
  remainingMs: number;
  running: boolean;
  expired: boolean;
}

export interface CombatClockInput {
  /** The server's durable budget for this seat, which is its value *as of turn start*. */
  durableRemainingMs: number | null | undefined;
  /** True only for the seat currently on move in a live match. */
  running: boolean;
  /** Server timestamp marking when the current turn began. */
  turnStartedAt?: string | undefined;
  /** Server timestamp marking when this projection was produced. */
  serverNow: string;
  /** Client timestamp for when that projection landed (React Query's `dataUpdatedAt`). */
  observedAtMs: number;
  /** Client timestamp for now. */
  nowMs: number;
}

/*
 * The read RPC is `stable`: it never debits the running turn, so `durableRemainingMs`
 * is what the seat had when the turn began. The time actually burned so far is
 * therefore (serverNow - turnStartedAt), the part the server already knows about,
 * plus (nowMs - observedAtMs), the part that has elapsed locally since the projection
 * landed.
 *
 * The property that makes this correct is that neither subtraction ever crosses
 * clocks: server minus server, then client minus client. The previous implementation
 * computed (Date.now() - Date.parse(serverNow)), mixing the two, which made the
 * reading a function of how far apart the device and the server were — and reset the
 * anchor on every refetch, so returning to a backgrounded tab restored the full budget.
 */
export function readCombatClock(input: CombatClockInput): CombatClockReading {
  const durable = Math.max(0, input.durableRemainingMs ?? 0);
  if (!input.running) return { remainingMs: durable, running: false, expired: durable <= 0 };

  const turnStartedAtMs = input.turnStartedAt ? Date.parse(input.turnStartedAt) : Number.NaN;
  const serverNowMs = Date.parse(input.serverNow);
  const serverElapsedMs =
    Number.isFinite(turnStartedAtMs) && Number.isFinite(serverNowMs)
      ? Math.max(0, serverNowMs - turnStartedAtMs)
      : 0;
  const clientElapsedMs = Math.max(0, input.nowMs - input.observedAtMs);
  const remainingMs = Math.max(0, durable - serverElapsedMs - clientElapsedMs);
  return { remainingMs, running: true, expired: remainingMs <= 0 };
}

/*
 * Only the player who is waiting may offer to claim, and only once the seat on move
 * has visibly run out. The server re-derives expiry from its own clock, so this is a
 * gate on offering the control, never on the outcome — a premature claim is refused
 * with TIMEOUT_PENDING and changes nothing.
 */
export function canClaimTimeout(input: {
  status: string;
  terminal: boolean;
  viewerSeat: 'player-one' | 'player-two';
  currentTurn?: 'player-one' | 'player-two' | undefined;
  opponentClock: CombatClockReading;
}): boolean {
  if (input.terminal || input.status !== 'playing') return false;
  if (!input.currentTurn || input.currentTurn === input.viewerSeat) return false;
  return input.opponentClock.running && input.opponentClock.expired;
}

export function formatClock(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
