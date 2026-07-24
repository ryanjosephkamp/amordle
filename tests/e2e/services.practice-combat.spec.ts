import { expect, test } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  createPracticeCombatPreview,
  reducePracticeCombatPreview,
} from '../../src/domain/practice-combat-preview';
import {
  buildCooperativePracticeProjection,
  buildWaitingPracticeProjection,
  parsePracticeTransportProjection,
} from '../../src/services/practice-combat-transport';
import type { Json } from '../../src/types/database';
import { RealServiceHarness } from '../server/real-service-harness';

const enabled = process.env.AMORDLE_ENABLE_REAL_SERVICE_E2E === '1';

async function close(client: SupabaseClient): Promise<void> {
  await client.removeAllChannels();
  await client.auth.signOut();
}

test.describe('existing-backend Practice cooperative preview', () => {
  test.skip(!enabled, 'Requires explicit real-service authorization and cleanup authority.');
  test.describe.configure({ mode: 'serial' });

  test('creates an answerless lobby, joins two accounts, converges one move, denies outsiders, and cleans exactly', async () => {
    const harness = await RealServiceHarness.create();
    const hostClient = harness.browserClient();
    const joinClient = harness.browserClient();
    const outsiderClient = harness.browserClient();
    try {
      const host = await harness.createTemporaryUser('practice-host');
      const joiner = await harness.createTemporaryUser('practice-joiner');
      const outsider = await harness.createTemporaryUser('practice-outsider');
      expect((await hostClient.auth.signInWithPassword(host)).error).toBeNull();
      expect((await joinClient.auth.signInWithPassword(joiner)).error).toBeNull();
      expect((await outsiderClient.auth.signInWithPassword(outsider)).error).toBeNull();

      const gameId = `amordle-practice-${harness.runId}`;
      await harness.registerRow('async_multiplayer_games', { id: gameId });
      const createdAt = new Date().toISOString();
      const config = {
        mode: 'og' as const,
        wordLength: 2,
        difficulty: 'expert' as const,
        hardMode: false,
        puzzleCount: 1 as const,
        timeLimitMs: null,
      };
      const waiting = buildWaitingPracticeProjection({
        id: gameId,
        hostUserId: host.userId,
        config,
        now: createdAt,
      });
      expect(JSON.stringify(waiting)).not.toMatch(/answer|seed|email/i);
      const inserted = await hostClient.from('async_multiplayer_games').insert({
        id: gameId,
        scope: 'practice',
        mode: 'og',
        status: 'waiting',
        current_turn: 'player-one',
        word_length: 2,
        difficulty: 'expert',
        go_puzzle_count: null,
        host_user_id: host.userId,
        player_one_user_id: host.userId,
        player_two_user_id: null,
        ranked: false,
        projection: waiting as unknown as Json,
        created_at: createdAt,
        updated_at: createdAt,
      });
      expect(inserted.error).toBeNull();

      const startedAt = new Date(Date.parse(createdAt) + 1).toISOString();
      const initialState = createPracticeCombatPreview({
        id: gameId,
        config,
        players: [{ displayName: 'Player One' }, { displayName: 'Player Two' }],
        answers: ['aa'],
        now: startedAt,
      });
      const cooperative = buildCooperativePracticeProjection({
        sourceKind: 'public-lobby',
        playerOneUserId: host.userId,
        playerTwoUserId: joiner.userId,
        wordRevision: 'e2e-two-letter-v1',
        state: initialState,
      });
      const joined = await joinClient
        .from('async_multiplayer_games')
        .update({
          status: 'playing',
          current_turn: 'player-one',
          player_two_user_id: joiner.userId,
          projection: cooperative as unknown as Json,
          updated_at: startedAt,
        })
        .eq('id', gameId)
        .eq('status', 'waiting')
        .eq('updated_at', createdAt)
        .is('player_two_user_id', null)
        .select('id,projection')
        .single();
      expect(joined.error).toBeNull();
      expect(
        parsePracticeTransportProjection(joined.data?.projection, joiner.userId),
      ).toMatchObject({
        kind: 'cooperative-participant',
        viewerSeat: 'player-two',
      });

      const movedAt = new Date(Date.parse(startedAt) + 1).toISOString();
      const reduced = reducePracticeCombatPreview(
        initialState,
        {
          type: 'submit',
          actor: 'left',
          guess: 'bb',
          actionId: `${harness.runId}:move-1`,
          expectedRevision: 0,
          expectedMoveCount: 0,
          now: movedAt,
        },
        { validGuesses: new Set(['aa', 'bb']) },
      );
      expect(reduced.ok).toBe(true);
      if (!reduced.ok) throw new Error(reduced.message);
      const movedProjection = buildCooperativePracticeProjection({
        sourceKind: 'public-lobby',
        playerOneUserId: host.userId,
        playerTwoUserId: joiner.userId,
        wordRevision: 'e2e-two-letter-v1',
        state: reduced.state,
      });
      const saved = await hostClient
        .from('async_multiplayer_games')
        .update({
          current_turn: 'player-two',
          projection: movedProjection as unknown as Json,
          updated_at: movedAt,
        })
        .eq('id', gameId)
        .eq('status', 'playing')
        .eq('current_turn', 'player-one')
        .eq('updated_at', startedAt)
        .select('projection')
        .single();
      expect(saved.error).toBeNull();
      expect(parsePracticeTransportProjection(saved.data?.projection, host.userId)).toMatchObject({
        kind: 'cooperative-participant',
        state: { revision: 1, moves: [{ actor: 'left', guess: 'bb' }] },
      });

      const joinerRead = await joinClient
        .from('async_multiplayer_games')
        .select('projection')
        .eq('id', gameId)
        .single();
      expect(joinerRead.error).toBeNull();
      expect(
        parsePracticeTransportProjection(joinerRead.data?.projection, joiner.userId),
      ).toMatchObject({ state: { revision: 1 } });

      const outsiderRead = await outsiderClient
        .from('async_multiplayer_games')
        .select('id')
        .eq('id', gameId);
      expect(outsiderRead.error).toBeNull();
      expect(outsiderRead.data).toEqual([]);
    } finally {
      await Promise.allSettled([close(hostClient), close(joinClient), close(outsiderClient)]);
      await harness.cleanup();
    }
  });
});
