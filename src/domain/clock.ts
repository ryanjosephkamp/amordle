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
  /*
   * W1. An untimed lane has no budget at all — the server emits the field as null and
   * `jsonb_strip_nulls` removes it, so it arrives as `undefined`. Folding that absence
   * into `0` made `expired` true for every seat of every untimed match, which is what
   * put CLAIM WIN ON TIME onto matches with no clocks beside either player. `ClockValue`
   * hid the symptom because it is gated on `timeRemainingMs != null`; nothing gated the
   * claim. A seat with no budget has not run out of time — it has no time to run out of.
   *
   * Note that `running` cannot be relied on to catch this: it is computed in
   * `useCombatClockReading` purely from turn ownership, with no reference to whether the
   * lane is timed, so the seat on move in an untimed match really does read as running.
   */
  if (input.durableRemainingMs == null) {
    return { remainingMs: 0, running: false, expired: false };
  }
  const durable = Math.max(0, input.durableRemainingMs);
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
 * W1. Running out of time IS the loss — there is no claim, no discussion and no button.
 * But the server only materialises a timeout inside `save_amordle_combat_command_v2`,
 * when some command arrives, and no scheduled job exists anywhere; so a match whose
 * player walked away would sit at 0:00 forever unless a client sends one. This is the
 * predicate for sending it automatically.
 *
 * It is deliberately symmetric — it asks whether the seat ON MOVE has run out, not
 * whether the opponent has. Whichever client is watching settles it, including the
 * client of the player who lost. That is the owner's rule applied honestly, and it
 * settles sooner than waiting for the other seat to notice. It costs nothing in
 * fairness: the server reaches the same outcome the moment the late player submits
 * anything at all, because clock materialisation runs ahead of the turn check.
 *
 * This gates when to ASK, never the outcome. The server re-derives expiry from its own
 * clock and refuses a premature request with TIMEOUT_PENDING, changing nothing.
 */
export function shouldAutoSettleTimeout(input: {
  status: string;
  terminal: boolean;
  currentTurn?: 'player-one' | 'player-two' | undefined;
  activeClock: CombatClockReading;
}): boolean {
  if (input.terminal || input.status !== 'playing') return false;
  if (!input.currentTurn) return false;
  return input.activeClock.running && input.activeClock.expired;
}

export function formatClock(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
