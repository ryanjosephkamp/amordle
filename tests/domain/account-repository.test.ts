import { describe, expect, it, vi } from 'vitest';
import type { AmordleSupabaseClient } from '../../src/lib/supabase-browser';
import { AccountRepository } from '../../src/services/account-repository';

const userId = '00000000-0000-4000-8000-000000000101';
const otherUserId = '00000000-0000-4000-8000-000000000202';
const currentAt = '2025-07-22T12:00:00.000Z';
const candidateAt = '2025-07-22T12:01:00.000Z';

function settingsClient(input: {
  current: { settings: Record<string, unknown>; updated_at: string };
  replacement?: { updated_at: string } | null;
}) {
  const readMaybeSingle = vi.fn(async () => ({ data: input.current, error: null }));
  const readOwner = vi.fn(() => ({ maybeSingle: readMaybeSingle }));
  const readSelect = vi.fn(() => ({ eq: readOwner }));

  const replaceMaybeSingle = vi.fn(async () => ({
    data: input.replacement === undefined ? { updated_at: candidateAt } : input.replacement,
    error: null,
  }));
  const replaceSelect = vi.fn(() => ({ maybeSingle: replaceMaybeSingle }));
  const replaceTimestamp = vi.fn(() => ({ select: replaceSelect }));
  const replaceOwner = vi.fn(() => ({ eq: replaceTimestamp }));
  const update = vi.fn(() => ({ eq: replaceOwner }));
  const from = vi.fn(() => ({ select: readSelect, update }));
  return {
    client: { from } as unknown as AmordleSupabaseClient,
    from,
    update,
    readOwner,
    replaceOwner,
    replaceTimestamp,
    replaceMaybeSingle,
  };
}

describe('account persistence boundaries', () => {
  it('merges settings without dropping private account fields and binds replacement to owner and exact timestamp', async () => {
    const fixture = settingsClient({
      current: {
        settings: { notifications: true, serverOwnedFuturePreference: 'retain-me' },
        updated_at: currentAt,
      },
    });
    const result = await new AccountRepository(fixture.client).saveSettings(
      userId,
      { notifications: false, sound: true },
      candidateAt,
    );

    expect(result).toEqual({ status: 'saved', updatedAt: candidateAt });
    expect(fixture.update).toHaveBeenCalledWith({
      settings: {
        notifications: false,
        sound: true,
        serverOwnedFuturePreference: 'retain-me',
      },
      updated_at: candidateAt,
    });
    expect(fixture.readOwner).toHaveBeenCalledWith('user_id', userId);
    expect(fixture.replaceOwner).toHaveBeenCalledWith('user_id', userId);
    expect(fixture.replaceTimestamp).toHaveBeenCalledWith('updated_at', currentAt);
  });

  it('hydrates settings returned with a PostgreSQL UTC offset', async () => {
    const offsetTimestamp = '2026-07-24T12:00:00+00:00';
    const readMaybeSingle = vi.fn(async () => ({
      data: { settings: { sound: true }, updated_at: offsetTimestamp },
      error: null,
    }));
    const readOwner = vi.fn(() => ({ maybeSingle: readMaybeSingle }));
    const readSelect = vi.fn(() => ({ eq: readOwner }));
    const from = vi.fn(() => ({ select: readSelect }));

    await expect(
      new AccountRepository({ from } as unknown as AmordleSupabaseClient).loadSettingsSnapshot(
        userId,
      ),
    ).resolves.toEqual({
      value: { sound: true },
      updatedAt: '2026-07-24T12:00:00.000Z',
    });
  });

  it('never reports a settings save after three lost compare-and-swap races', async () => {
    const fixture = settingsClient({
      current: { settings: { sound: true }, updated_at: currentAt },
      replacement: null,
    });
    await expect(
      new AccountRepository(fixture.client).saveSettings(userId, { sound: false }, candidateAt),
    ).rejects.toMatchObject({ failure: { code: 'conflict', retryable: true } });
    expect(fixture.replaceMaybeSingle).toHaveBeenCalledTimes(3);
  });

  it('preserves unrelated progress sections during an exact progression replacement', async () => {
    const readMaybeSingle = vi.fn(async () => ({
      data: {
        progress: { soloCloudV1: { revision: 4 }, futureSection: { retained: true } },
        updated_at: currentAt,
      },
      error: null,
    }));
    const readOwner = vi.fn(() => ({ maybeSingle: readMaybeSingle }));
    const readSelect = vi.fn(() => ({ eq: readOwner }));
    const replaceMaybeSingle = vi.fn(async () => ({
      data: { updated_at: candidateAt },
      error: null,
    }));
    const replaceSelect = vi.fn(() => ({ maybeSingle: replaceMaybeSingle }));
    const replaceTimestamp = vi.fn(() => ({ select: replaceSelect }));
    const replaceOwner = vi.fn(() => ({ eq: replaceTimestamp }));
    const update = vi.fn(() => ({ eq: replaceOwner }));
    const from = vi.fn(() => ({ select: readSelect, update }));

    await new AccountRepository({ from } as unknown as AmordleSupabaseClient).saveProgression(
      userId,
      { xp: 120, coins: 7 },
      candidateAt,
    );

    expect(update).toHaveBeenCalledWith({
      progress: {
        soloCloudV1: { revision: 4 },
        futureSection: { retained: true },
        progression: { xp: 120, coins: 7 },
      },
      updated_at: candidateAt,
    });
    expect(replaceOwner).toHaveBeenCalledWith('user_id', userId);
    expect(replaceTimestamp).toHaveBeenCalledWith('updated_at', currentAt);
  });

  it('fails closed when an account history response contains another owner', async () => {
    const limit = vi.fn(async () => ({
      data: [
        {
          id: 'history-1',
          user_id: otherUserId,
          completed_at: currentAt,
          entry: { area: 'solo', mode: 'og', scope: 'practice', result: 'won' },
        },
      ],
      error: null,
    }));
    const order = vi.fn(() => ({ limit }));
    const owner = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq: owner }));
    const from = vi.fn(() => ({ select }));

    await expect(
      new AccountRepository({ from } as unknown as AmordleSupabaseClient).listHistory(userId),
    ).rejects.toMatchObject({ failure: { code: 'validation' } });
    expect(owner).toHaveBeenCalledWith('user_id', userId);
  });

  it('rejects invalid identities and non-object private records before issuing a request', async () => {
    const from = vi.fn();
    const repository = new AccountRepository({ from } as unknown as AmordleSupabaseClient);
    await expect(repository.loadSettings('raw-auth-id')).rejects.toMatchObject({
      failure: { code: 'validation' },
    });
    await expect(
      repository.saveHistory({
        id: 'history-1',
        user_id: userId,
        completed_at: currentAt,
        entry: 'not-a-private-record',
      }),
    ).rejects.toMatchObject({ failure: { code: 'validation' } });
    expect(from).not.toHaveBeenCalled();
  });
});
