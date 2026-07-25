import { expect, test } from '@playwright/test';
import { z } from 'zod';

import type { AmordleSupabaseClient } from '../../src/lib/supabase-browser';
import {
  assertNoSensitiveCombatProjection,
  AuthoritativeCombatRepository,
} from '../../src/services/authoritative-combat-repository';
import { CombatLiveRepository } from '../../src/services/combat-live-repository';
import { RealServiceHarness } from '../server/real-service-harness';

const enabled = process.env.AMORDLE_ENABLE_REAL_SERVICE_E2E === '1';

const inspectionSchema = z
  .object({
    gameId: z.string().min(1),
    answers: z.array(z.string().regex(/^[a-z]{2,35}$/)).min(1),
    status: z.string().min(1),
    version: z.number().int().min(0),
    moveCount: z.number().int().min(0),
  })
  .strict();

function authoritativeRepository(client: ReturnType<RealServiceHarness['browserClient']>) {
  return new AuthoritativeCombatRepository(client as unknown as AmordleSupabaseClient);
}

function liveRepository(client: ReturnType<RealServiceHarness['browserClient']>) {
  return new CombatLiveRepository(client as unknown as AmordleSupabaseClient);
}

async function close(client: ReturnType<RealServiceHarness['browserClient']>): Promise<void> {
  await client.removeAllChannels();
  await client.auth.signOut();
}

test.describe('authoritative Amordle COMBAT v2', () => {
  test.skip(!enabled, 'Requires the protected real-service gate and exact cleanup authority.');
  test.describe.configure({ mode: 'serial' });

  test('matches, finalizes, validates, settles, spectates, and cleans Ranked Practice', async () => {
    const harness = await RealServiceHarness.create();
    const playerOneClient = harness.browserClient();
    const playerTwoClient = harness.browserClient();
    const anonymousClient = harness.browserClient();
    const playerOneRepository = authoritativeRepository(playerOneClient);
    const playerTwoRepository = authoritativeRepository(playerTwoClient);
    try {
      const playerOne = await harness.createTemporaryUser('v2-ranked-one');
      const playerTwo = await harness.createTemporaryUser('v2-ranked-two');
      await harness.registerAuthoritativeCombat({
        userIds: [playerOne.userId, playerTwo.userId],
      });
      expect((await playerOneClient.auth.signInWithPassword(playerOne)).error).toBeNull();
      expect((await playerTwoClient.auth.signInWithPassword(playerTwo)).error).toBeNull();

      const first = await playerOneRepository.createRankedPracticeRequest({
        mode: 'og',
        wordLength: 2,
        difficulty: 'casual',
        hardMode: false,
        goPuzzleCount: 5,
        timeLimitMs: null,
        creationKey: `${harness.runId}:ranked:create-one`,
      });
      const second = await playerTwoRepository.createRankedPracticeRequest({
        mode: 'og',
        wordLength: 2,
        difficulty: 'casual',
        hardMode: false,
        goPuzzleCount: 5,
        timeLimitMs: null,
        creationKey: `${harness.runId}:ranked:create-two`,
      });
      await harness.registerAuthoritativeCombat({
        requestIds: [first.requestId, second.requestId],
        userIds: [playerOne.userId, playerTwo.userId],
      });

      const claim = await playerOneRepository.claimRankedPractice({
        requestId: first.requestId,
        actionId: `${harness.runId}:ranked:claim`,
      });
      expect(claim.status).toBe('matched');
      expect(claim.matchedGameId).toBeTruthy();
      const gameId = claim.matchedGameId!;
      await harness.registerAuthoritativeCombat({
        gameIds: [gameId],
        requestIds: [first.requestId, second.requestId],
        userIds: [playerOne.userId, playerTwo.userId],
      });

      await expect(
        playerTwoRepository.getRankedPracticeStatus(second.requestId),
      ).resolves.toMatchObject({ status: 'matched', matchedGameId: gameId });

      const [playerOneProjection, playerTwoProjection] = await Promise.all([
        playerOneRepository.finalizeRankedPractice({
          requestId: first.requestId,
          gameId,
          actionId: `${harness.runId}:ranked:finalize-one`,
        }),
        playerTwoRepository.finalizeRankedPractice({
          requestId: second.requestId,
          gameId,
          actionId: `${harness.runId}:ranked:finalize-two`,
        }),
      ]);
      assertNoSensitiveCombatProjection(playerOneProjection);
      assertNoSensitiveCombatProjection(playerTwoProjection);
      expect(playerOneProjection.viewerSeat).not.toBe(playerTwoProjection.viewerSeat);
      expect(JSON.stringify(playerOneProjection)).not.toContain(playerOne.userId);
      expect(JSON.stringify(playerOneProjection)).not.toContain(playerTwo.userId);

      const directRow = await playerOneClient
        .from('async_multiplayer_games')
        .select('id,projection')
        .eq('id', gameId);
      expect(directRow.error).toBeNull();
      expect(directRow.data).toEqual([]);

      await expect(
        playerOneRepository.saveCommand({
          gameId,
          actionId: `${harness.runId}:ranked:invalid`,
          expectedVersion: playerOneProjection.version,
          expectedMoveCount: playerOneProjection.moveCount,
          command: 'guess',
          guess: 'zzz',
        }),
      ).rejects.toThrow();
      await expect(playerOneRepository.getGame(gameId)).resolves.toMatchObject({
        version: playerOneProjection.version,
        moveCount: playerOneProjection.moveCount,
        status: 'playing',
      });

      const liveBeforeSolve = await liveRepository(anonymousClient).get({
        authenticated: false,
        gameId,
      });
      expect(liveBeforeSolve).not.toBeNull();
      expect(liveBeforeSolve?.capabilities.canMutate).toBe(false);
      expect(JSON.stringify(liveBeforeSolve)).not.toMatch(/answer|seed|email/i);

      const inspected = await harness.admin.rpc('inspect_amordle_combat_e2e_v2', {
        p_run_id: harness.runId,
        p_game_id: gameId,
        p_user_ids: [playerOne.userId, playerTwo.userId],
      });
      expect(inspected.error).toBeNull();
      const answer = inspectionSchema.parse(inspected.data).answers[0]!;
      const completed = await playerOneRepository.saveCommand({
        gameId,
        actionId: `${harness.runId}:ranked:solve`,
        expectedVersion: playerOneProjection.version,
        expectedMoveCount: playerOneProjection.moveCount,
        command: 'guess',
        guess: answer,
      });
      expect(completed.status).toBe('completed');
      expect(completed.revealedAnswers).toEqual([answer]);

      const settlement = await playerOneRepository.settleRankedPractice({
        gameId,
        actionId: `${harness.runId}:ranked:settle`,
      });
      expect(settlement.newRating).toBe(settlement.oldRating + settlement.ratingDelta);
      const idempotentSettlement = await playerOneRepository.settleRankedPractice({
        gameId,
        actionId: `${harness.runId}:ranked:settle`,
      });
      expect(idempotentSettlement).toMatchObject({
        matchResultId: settlement.matchResultId,
        idempotent: true,
      });
    } finally {
      await Promise.allSettled([
        close(playerOneClient),
        close(playerTwoClient),
        close(anonymousClient),
      ]);
      await harness.cleanup();
    }
  });

  test('keeps unranked Daily fixed-five, owner-bound, answerless, and absent from Live', async () => {
    const harness = await RealServiceHarness.create();
    const ownerClient = harness.browserClient();
    const joinerClient = harness.browserClient();
    const anonymousClient = harness.browserClient();
    const ownerRepository = authoritativeRepository(ownerClient);
    const joinerRepository = authoritativeRepository(joinerClient);
    try {
      const owner = await harness.createTemporaryUser('v2-daily-owner');
      const joiner = await harness.createTemporaryUser('v2-daily-joiner');
      await harness.registerAuthoritativeCombat({ userIds: [owner.userId, joiner.userId] });
      expect((await ownerClient.auth.signInWithPassword(owner)).error).toBeNull();
      expect((await joinerClient.auth.signInWithPassword(joiner)).error).toBeNull();

      const waiting = await ownerRepository.createUnrankedDailyLobby({
        mode: 'og',
        hardMode: false,
        creationKey: `${harness.runId}:daily:create`,
      });
      await harness.registerAuthoritativeCombat({
        gameIds: [waiting.id],
        userIds: [owner.userId, joiner.userId],
      });
      assertNoSensitiveCombatProjection(waiting);
      expect(waiting).toMatchObject({
        scope: 'daily',
        wordLength: 5,
        difficulty: 'expert',
        ranked: false,
        status: 'waiting',
      });
      expect(JSON.stringify(waiting)).not.toContain(owner.userId);

      const lobbies = await joinerRepository.listUnrankedDailyLobbies({ mode: 'og' });
      const visible = lobbies.find((lobby) => lobby.id === waiting.id);
      expect(visible).toMatchObject({
        viewerSeat: null,
        capabilities: { canJoin: true, canCancel: false },
      });
      expect(JSON.stringify(visible)).not.toContain(owner.userId);

      await expect(
        joinerRepository.cancelUnrankedDailyLobby({
          gameId: waiting.id,
          actionId: `${harness.runId}:daily:unauthorized-cancel`,
          expectedVersion: waiting.version,
        }),
      ).rejects.toThrow();
      const joined = await joinerRepository.joinUnrankedDailyLobby({
        gameId: waiting.id,
        actionId: `${harness.runId}:daily:join`,
        expectedVersion: waiting.version,
      });
      expect(joined.status).toBe('playing');
      assertNoSensitiveCombatProjection(joined);

      await expect(
        liveRepository(anonymousClient).get({
          authenticated: false,
          gameId: waiting.id,
        }),
      ).resolves.toBeNull();
    } finally {
      await Promise.allSettled([close(ownerClient), close(joinerClient), close(anonymousClient)]);
      await harness.cleanup();
    }
  });
});
