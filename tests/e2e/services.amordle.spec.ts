import { expect, test } from '@playwright/test';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_TABLES, RealServiceHarness } from '../server/real-service-harness';

const enabled = process.env.AMORDLE_ENABLE_REAL_SERVICE_E2E === '1';

async function signOut(client: SupabaseClient): Promise<void> {
  await client.removeAllChannels();
  await client.auth.signOut();
}

async function waitForSubscription(channel: RealtimeChannel): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Realtime subscription readiness timed out.')),
      10_000,
    );
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timer);
        resolve();
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timer);
        reject(new Error('Realtime subscription failed.'));
      }
    });
  });
}

test.describe('Amordle real-service authority', () => {
  test.skip(
    !enabled,
    'Requires explicit real-service authorization and private Node-only credentials.',
  );
  test.describe.configure({ mode: 'serial' });

  test('denies anonymous row visibility across all 24 public tables and the private schema', async () => {
    const harness = await RealServiceHarness.create();
    const anonymous = harness.browserClient();
    try {
      for (const table of PUBLIC_TABLES) {
        const { count, error } = await anonymous
          .from(table)
          .select('*', { count: 'exact', head: true })
          .limit(1);
        expect(
          error !== null || count === 0,
          `Anonymous browser role unexpectedly counted rows in public.${table}.`,
        ).toBe(true);
      }

      const privateProbe = await anonymous
        .schema('brrrdle_private')
        .from('ranked_daily_game_authority')
        .select('*', { count: 'exact', head: true })
        .limit(1);
      expect(privateProbe.error).not.toBeNull();
    } finally {
      await signOut(anonymous);
      await harness.cleanup();
    }
  });

  test('isolates account progress and denies authenticated private ranked Daily authority', async () => {
    const harness = await RealServiceHarness.create();
    const clientOne = harness.browserClient();
    const clientTwo = harness.browserClient();
    try {
      const playerOne = await harness.createTemporaryUser('isolation-one');
      const playerTwo = await harness.createTemporaryUser('isolation-two');
      expect((await clientOne.auth.signInWithPassword(playerOne)).error).toBeNull();
      expect((await clientTwo.auth.signInWithPassword(playerTwo)).error).toBeNull();

      await harness.registerRow('progress_snapshots', { user_id: playerOne.userId });
      await harness.registerRow('progress_snapshots', { user_id: playerTwo.userId });
      expect(
        (
          await clientOne.from('progress_snapshots').insert({
            user_id: playerOne.userId,
            progress: { testRun: harness.runId },
          })
        ).error,
      ).toBeNull();
      expect(
        (
          await clientTwo.from('progress_snapshots').insert({
            user_id: playerTwo.userId,
            progress: { testRun: harness.runId },
          })
        ).error,
      ).toBeNull();

      const crossAccount = await clientOne
        .from('progress_snapshots')
        .select('user_id')
        .eq('user_id', playerTwo.userId);
      expect(crossAccount.error).toBeNull();
      expect(crossAccount.data).toEqual([]);

      const privateProbe = await clientOne
        .schema('brrrdle_private')
        .from('ranked_daily_game_authority')
        .select('*', { count: 'exact', head: true })
        .limit(1);
      expect(privateProbe.error).not.toBeNull();
    } finally {
      await Promise.allSettled([signOut(clientOne), signOut(clientTwo)]);
      await harness.cleanup();
    }
  });

  test('applies an economy operation once for a disposable user', async () => {
    const harness = await RealServiceHarness.create();
    const client = harness.browserClient();
    try {
      const player = await harness.createTemporaryUser('economy');
      expect((await client.auth.signInWithPassword(player)).error).toBeNull();
      const operationId = `${harness.runId}:economy-credit`;
      await harness.registerRow('player_economy_operations', {
        user_id: player.userId,
        operation_id: operationId,
      });
      await harness.registerRow('player_economy_state', { user_id: player.userId });

      const first = await client.rpc('credit_player_economy_coins', {
        p_amount: 10,
        p_operation_id: operationId,
      });
      expect(first.error).toBeNull();
      expect(first.data?.[0]?.applied).toBe(true);
      const second = await client.rpc('credit_player_economy_coins', {
        p_amount: 10,
        p_operation_id: operationId,
      });
      expect(second.error).toBeNull();
      expect(second.data?.[0]?.applied).toBe(false);
      expect(second.data?.[0]?.coins).toBe(first.data?.[0]?.coins);
      expect(second.data?.[0]?.revision).toBe(first.data?.[0]?.revision);
    } finally {
      await signOut(client);
      await harness.cleanup();
    }
  });

  test('converges a two-client Practice game through durable authority with Realtime acceleration or polling fallback', async () => {
    const harness = await RealServiceHarness.create();
    const hostClient = harness.browserClient();
    const joinClient = harness.browserClient();
    let channel: RealtimeChannel | null = null;
    try {
      const host = await harness.createTemporaryUser('combat-host');
      const joiner = await harness.createTemporaryUser('combat-joiner');
      expect((await hostClient.auth.signInWithPassword(host)).error).toBeNull();
      expect((await joinClient.auth.signInWithPassword(joiner)).error).toBeNull();
      const gameId = `async-game-${harness.runId}`;
      await harness.registerRow('async_multiplayer_games', { id: gameId });

      const inserted = await hostClient.from('async_multiplayer_games').insert({
        id: gameId,
        scope: 'practice',
        mode: 'og',
        status: 'waiting',
        current_turn: 'player-one',
        word_length: 5,
        difficulty: 'expert',
        host_user_id: host.userId,
        player_one_user_id: host.userId,
        player_two_user_id: null,
        ranked: false,
        projection: { version: 1, moves: [], state: 'waiting', testRun: harness.runId },
      });
      expect(inserted.error).toBeNull();

      let resolveUpdate: (() => void) | null = null;
      const realtimeUpdate = new Promise<void>((resolve) => {
        resolveUpdate = resolve;
      });
      channel = hostClient.channel(`e2e-game-${harness.runId}`).on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'async_multiplayer_games',
          filter: `id=eq.${gameId}`,
        },
        () => resolveUpdate?.(),
      );
      await waitForSubscription(channel);

      const joined = await joinClient
        .from('async_multiplayer_games')
        .update({
          status: 'playing',
          player_two_user_id: joiner.userId,
          projection: { version: 2, moves: [], state: 'playing', testRun: harness.runId },
        })
        .eq('id', gameId)
        .eq('status', 'waiting')
        .select('id');
      expect(joined.error).toBeNull();
      expect(joined.data).toEqual([{ id: gameId }]);

      const delivery = await Promise.race([
        realtimeUpdate.then(() => 'realtime' as const),
        new Promise<'poll-fallback'>((resolve) =>
          setTimeout(() => resolve('poll-fallback'), 5_000),
        ),
      ]);
      expect(['realtime', 'poll-fallback']).toContain(delivery);

      const durable = await hostClient
        .from('async_multiplayer_games')
        .select('id,status,player_one_user_id,player_two_user_id,projection')
        .eq('id', gameId)
        .single();
      expect(durable.error).toBeNull();
      expect(durable.data).toMatchObject({
        id: gameId,
        status: 'playing',
        player_one_user_id: host.userId,
        player_two_user_id: joiner.userId,
        projection: { version: 2, state: 'playing', testRun: harness.runId },
      });
      // Realtime is deliberately non-authoritative. A missed event must still
      // converge through the same bounded durable read used by application polling.
    } finally {
      if (channel) await hostClient.removeChannel(channel);
      await Promise.allSettled([signOut(hostClient), signOut(joinClient)]);
      await harness.cleanup();
    }
  });
});
