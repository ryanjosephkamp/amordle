import { describe, expect, it, vi } from 'vitest';
import { AccountHydrationError, hydrateAccountScope } from '../../src/services/account-hydration';

const userId = '00000000-0000-4000-8000-000000000101';

describe('account-scope hydration coordinator', () => {
  it('treats absent first-use documents as a valid empty account scope', async () => {
    const repository = {
      loadProgressSnapshot: vi.fn(async () => null),
      loadSettingsSnapshot: vi.fn(async () => null),
    };

    await expect(hydrateAccountScope(repository, userId)).resolves.toEqual({
      progress: null,
      settings: null,
    });
  });

  it('reports the exact failed stage without substituting another scope', async () => {
    const repository = {
      loadProgressSnapshot: vi.fn(async () => ({
        progress: { xp: 20 },
        updatedAt: '2026-07-24T12:00:00.000Z',
      })),
      loadSettingsSnapshot: vi.fn(async () => {
        throw new Error('private database detail');
      }),
    };

    await expect(hydrateAccountScope(repository, userId)).rejects.toMatchObject({
      name: 'AccountHydrationError',
      stage: 'settings',
      message: 'Account settings could not be restored.',
    });
    expect(repository.loadProgressSnapshot).toHaveBeenCalledWith(userId);
    expect(repository.loadSettingsSnapshot).toHaveBeenCalledWith(userId);
  });

  it('uses a privacy-safe coordinator error type', () => {
    const error = new AccountHydrationError('progress', new Error('row contents'));
    expect(error.message).toBe('Account progress could not be restored.');
    expect(error.failure.code).toBe('persistence');
  });
});
