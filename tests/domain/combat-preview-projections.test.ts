import { describe, expect, it } from 'vitest';
import {
  assertNoPrivateCombatFields,
  combatSessionDraftKey,
  parseCombatProjection,
  parseLegacyCombatSummary,
  parsePrivateRequestProjection,
  parseRankedDailyQueueProjection,
  parseRematchProjection,
} from '../../src/services/combat-preview-projections';

const playerOne = '00000000-0000-4000-8000-000000000101';
const playerTwo = '00000000-0000-4000-8000-000000000202';
const publicOne = '00000000-0000-4000-8000-000000000301';
const publicTwo = '00000000-0000-4000-8000-000000000302';
const createdAt = '2026-07-22T12:00:00.000Z';
const updatedAt = '2026-07-22T12:01:00.000Z';

function waitingProjection() {
  return {
    id: 'practice-waiting-1',
    scope: 'practice',
    mode: 'og',
    ranked: false,
    ratingBucket: null,
    wordLength: 5,
    difficulty: 'medium',
    hardMode: false,
    timeLimitMs: null,
    customGameCode: null,
    dailyDateKey: null,
    goPuzzleCount: null,
    playerUserIds: { 'player-one': playerOne, 'player-two': null },
    matchmakingRequestId: null,
    status: 'waiting',
    currentTurn: 'player-one',
    moves: [],
    createdAt,
    updatedAt,
    deadlineAt: null,
  };
}

function participantProjection() {
  return {
    ...waitingProjection(),
    id: 'practice-playing-1',
    playerUserIds: { 'player-one': playerOne, 'player-two': playerTwo },
    status: 'playing',
    moves: [
      {
        id: 'move-1',
        createdAt: updatedAt,
        guess: 'crane',
        playerId: 'player-one',
        puzzleIndex: 0,
        tiles: [
          { letter: 'c', state: 'absent' },
          { letter: 'r', state: 'present' },
          { letter: 'a', state: 'absent' },
          { letter: 'n', state: 'correct' },
          { letter: 'e', state: 'correct' },
        ],
      },
    ],
  };
}

function rankedDailyProjection() {
  return {
    ...participantProjection(),
    id: 'ranked-daily-1',
    scope: 'daily',
    mode: 'go',
    ranked: true,
    ratingBucket: 'multiplayer:go:daily:v1',
    difficulty: 'expert',
    dailyDateKey: '2026-07-22',
    goPuzzleCount: 5,
    authorityVersion: 1,
    matchmakingRequestId: 'ranked-request-1',
    deadlineAt: '2026-07-23T00:00:00.000Z',
  };
}

describe('strict COMBAT preview projection boundaries', () => {
  it('parses an answerless waiting projection and derives join/participant capabilities', () => {
    const host = parseCombatProjection(waitingProjection(), playerOne);
    const outsider = parseCombatProjection(
      waitingProjection(),
      '00000000-0000-4000-8000-000000000999',
    );

    expect(host).toMatchObject({
      kind: 'waiting',
      viewerSeat: 'player-one',
      capabilities: { canCancel: true, canJoin: false, canSubmit: false },
    });
    expect(outsider).toMatchObject({
      viewerSeat: null,
      capabilities: { canJoin: true, readOnly: false },
    });
    expect(JSON.stringify(host)).not.toContain(playerOne);
  });

  it('parses cooperative participant evidence without exposing raw auth identifiers', () => {
    const projection = parseCombatProjection(participantProjection(), playerTwo);
    expect(projection).toMatchObject({
      kind: 'participant',
      viewerSeat: 'player-two',
      status: 'playing',
      capabilities: { canSubmit: false, canForfeit: true },
    });
    expect(projection.moves[0]?.tiles).toHaveLength(5);
    expect(JSON.stringify(projection)).not.toContain(playerOne);
    expect(JSON.stringify(projection)).not.toContain(playerTwo);
  });

  it('enforces fixed five-letter Ranked Daily projections and strips participant UUIDs', () => {
    const projection = parseCombatProjection(rankedDailyProjection(), playerOne);
    expect(projection).toMatchObject({
      kind: 'ranked-daily',
      scope: 'daily',
      mode: 'go',
      wordLength: 5,
      goPuzzleCount: 5,
      authorityVersion: 1,
    });
    expect(JSON.stringify(projection)).not.toContain(playerOne);

    expect(() =>
      parseCombatProjection({ ...rankedDailyProjection(), wordLength: 7 }, playerOne),
    ).toThrow(/Ranked Daily projection settings/);
  });

  it('rejects private answer, session, identity, and secret fields at any depth', () => {
    for (const forbidden of [
      { answer: 'crane' },
      { nested: { answers: ['crane'] } },
      { nested: [{ serializedSession: {} }] },
      { email: 'player@example.com' },
      { metadata: { access_token: 'secret' } },
    ]) {
      expect(() => assertNoPrivateCombatFields(forbidden)).toThrow(/forbidden private field/);
    }
    expect(() =>
      parseCombatProjection({ ...participantProjection(), private: { seed: 3 } }, playerOne),
    ).toThrow();
  });

  it('parses only the narrow legacy read-only metadata projection', () => {
    const summary = parseLegacyCombatSummary({
      id: 'legacy-1',
      scope: 'practice',
      mode: 'og',
      daily_date_key: null,
      status: 'lost',
      current_turn: 'player-two',
      word_length: 5,
      difficulty: 'medium',
      go_puzzle_count: null,
      ranked: false,
      rating_bucket: null,
      custom_game_code: null,
      deadline_at: null,
      ended_at: updatedAt,
      winner_player_id: 'player-two',
      created_at: createdAt,
      updated_at: updatedAt,
    });
    expect(summary).toMatchObject({
      kind: 'legacy-read-only',
      winnerId: 'player-two',
      capabilities: { readOnly: true },
    });
    expect(() =>
      parseLegacyCombatSummary({
        ...summary,
        answer: 'crane',
      }),
    ).toThrow();
  });
});

describe('COMBAT request and queue parsing boundaries', () => {
  it('derives private-request capabilities and exposes sanctioned public profiles only', () => {
    const request = parsePrivateRequestProjection({
      request_id: 'private-1',
      request_status: 'requested',
      viewer_role: 'opponent',
      viewer_can_accept: true,
      viewer_can_cancel: false,
      viewer_can_decline: true,
      mode: 'go',
      word_length: 5,
      hard_mode: true,
      time_limit_ms: 300_000,
      go_puzzle_count: 5,
      created_game_id: null,
      created_at: createdAt,
      expires_at: '2026-07-22T12:10:00.000Z',
      responded_at: null,
      updated_at: updatedAt,
      created: false,
      idempotent: false,
      requester_identity_available: true,
      requester_public_profile_id: publicOne,
      requester_display_name: 'Ember',
      requester_accent_color: 'amber',
      requester_flair_key: 'none',
      requester_avatar_url: null,
      requester_profile_updated_at: updatedAt,
      opponent_identity_available: true,
      opponent_public_profile_id: publicTwo,
      opponent_display_name: 'Frost',
      opponent_accent_color: 'ice',
      opponent_flair_key: 'none',
      opponent_avatar_url: null,
      opponent_profile_updated_at: updatedAt,
    });
    expect(request.capabilities).toEqual({
      canAccept: true,
      canCancel: false,
      canDecline: true,
    });
    expect(JSON.stringify(request)).not.toContain(playerOne);
  });

  it('derives rematch capabilities from status, viewer role, and server eligibility', () => {
    const rematch = parseRematchProjection({
      request_id: 'rematch-1',
      source_game_id: 'practice-finished-1',
      request_status: 'requested',
      requester_seat: 'player-one',
      opponent_seat: 'player-two',
      viewer_role: 'requester',
      viewer_can_accept: false,
      viewer_can_cancel: true,
      mode: 'og',
      word_length: 7,
      hard_mode: false,
      time_limit_ms: null,
      go_puzzle_count: null,
      created_game_id: null,
      created_at: createdAt,
      expires_at: '2026-07-22T12:10:00.000Z',
      responded_at: null,
      updated_at: updatedAt,
      created: false,
      idempotent: false,
    });
    expect(rematch.capabilities).toEqual({ canAccept: false, canCancel: true });
  });

  it('maps Ranked Daily queue buckets and discards raw participant identifiers', () => {
    const queue = parseRankedDailyQueueProjection({
      request_id: 'queue-1',
      request_status: 'matched',
      matched_game_id: 'ranked-daily-1',
      opponent_request_id: 'queue-2',
      viewer_seat: 'player-one',
      player_one_user_id: playerOne,
      player_two_user_id: playerTwo,
      mode: 'og',
      scope: 'daily',
      daily_date_key: '2026-07-22',
      rating_bucket: 'async:og:daily:v1',
      word_length: 5,
      hard_mode: false,
      time_limit_ms: null,
      queued_at: createdAt,
      matched_at: updatedAt,
    });
    expect(queue.ratingBucket).toBe('multiplayer:og:daily:v1');
    expect(JSON.stringify(queue)).not.toContain(playerOne);
    expect(JSON.stringify(queue)).not.toContain(playerTwo);
  });

  it('creates collision-resistant owner/game/seat draft keys', () => {
    const left = combatSessionDraftKey({
      ownerNamespace: 'account:one',
      gameId: 'game/one',
      seat: 'player-one',
    });
    const right = combatSessionDraftKey({
      ownerNamespace: 'account:one',
      gameId: 'game/one',
      seat: 'player-two',
    });
    const otherOwner = combatSessionDraftKey({
      ownerNamespace: 'account:two',
      gameId: 'game/one',
      seat: 'player-one',
    });
    expect(new Set([left, right, otherOwner])).toHaveLength(3);
    expect(left).toBe('amordle:combat-draft:v1:account%3Aone:game%2Fone:player-one');
  });
});
