import { describe, expect, it, vi } from 'vitest';

import type { AmordleSupabaseClient } from '../../src/lib/supabase-browser';
import { CombatLiveRepository } from '../../src/services/combat-live-repository';

const safeRow = {
  id: 'practice-live-1',
  scope: 'practice',
  mode: 'og',
  status: 'playing',
  word_length: 5,
  go_puzzle_count: null,
  hard_mode: false,
  ranked: false,
  current_turn_seat: 'player-two',
  created_at: '2026-07-24T12:00:00+00:00',
  updated_at: '2026-07-24T12:01:00+00:00',
  terminal_at: null,
  players: [
    { seat: 'player-one', label: 'EMBER', profile: { displayName: 'Ember' } },
    { seat: 'player-two', label: 'FROST', profile: { displayName: 'Frost' } },
  ],
  moves: [
    {
      seat: 'player-one',
      puzzleIndex: 0,
      guess: 'CRANE',
      tiles: [
        { letter: 'C', state: 'absent' },
        { letter: 'R', state: 'present' },
        { letter: 'A', state: 'absent' },
        { letter: 'N', state: 'correct' },
        { letter: 'E', state: 'correct' },
      ],
      createdAt: '2026-07-24T12:01:00Z',
    },
  ],
  progress: {
    moveCount: 1,
    currentPuzzleIndex: 0,
    solvedPuzzleCount: 0,
    latestMoveAt: '2026-07-24T12:01:00Z',
  },
  outcome: {
    terminal: false,
    status: 'playing',
    label: 'Playing',
  },
  spectator_capabilities: {
    canSubmitGuess: false,
    canForfeit: false,
    canCancel: false,
    canJoin: false,
    canMutate: false,
    canClaimDaily: false,
    canQueue: false,
    canSettleRating: false,
    canNotify: false,
  },
} as const;

describe('privacy-safe COMBAT Live repository', () => {
  it('loads the exact public projection and canonicalizes database timestamps', async () => {
    const rpc = vi.fn(async () => ({ data: [safeRow], error: null }));
    const result = await new CombatLiveRepository({
      rpc,
    } as unknown as AmordleSupabaseClient).get({
      authenticated: false,
      gameId: 'practice-live-1',
    });

    expect(rpc).toHaveBeenCalledWith('get_public_live_v1_spectator_games_v2', {
      p_limit: 1,
      p_terminal_window_seconds: 15,
      p_game_id: 'practice-live-1',
    });
    expect(result).toMatchObject({
      id: 'practice-live-1',
      updatedAt: '2026-07-24T12:01:00.000Z',
      capabilities: { canMutate: false, canSubmitGuess: false },
    });
  });

  it('rejects unexpected private fields and inconsistent move evidence', async () => {
    const privateRpc = vi.fn(async () => ({
      data: [{ ...safeRow, email: 'private@example.com' }],
      error: null,
    }));
    await expect(
      new CombatLiveRepository({
        rpc: privateRpc,
      } as unknown as AmordleSupabaseClient).list({ authenticated: true }),
    ).rejects.toThrow();

    const inconsistentRpc = vi.fn(async () => ({
      data: [
        {
          ...safeRow,
          progress: { ...safeRow.progress, moveCount: 2 },
        },
      ],
      error: null,
    }));
    await expect(
      new CombatLiveRepository({
        rpc: inconsistentRpc,
      } as unknown as AmordleSupabaseClient).list({ authenticated: false }),
    ).rejects.toThrow(/inconsistent/i);
  });
});
