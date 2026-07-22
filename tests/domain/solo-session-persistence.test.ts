import { describe, expect, it } from 'vitest';

import { createOgSession } from '../../src/domain/game';
import { createGoSession, submitGoGuess } from '../../src/domain/go';
import { createMemoryStorage } from '../../src/persistence/local-repository';
import { createSoloSessionRepository } from '../../src/features/play/solo-session-repository';

const at = '2026-07-22T12:00:00.000Z';
const guest = { kind: 'guest' } as const;
const account = {
  kind: 'authenticated',
  userId: '00000000-0000-4000-8000-000000000001',
} as const;

describe('Solo session persistence', () => {
  it('keeps guest and authenticated lanes in separate owner namespaces', () => {
    const storage = createMemoryStorage();
    const repository = createSoloSessionRepository('practice:og', storage);
    const guestSession = createOgSession({
      id: 'guest-session',
      answer: 'apple',
      scope: 'practice',
      now: at,
    });
    const accountSession = createOgSession({
      id: 'account-session',
      answer: 'baker',
      scope: 'practice',
      now: at,
    });
    expect(repository.save(guest, guestSession)).toMatchObject({ ok: true });
    expect(repository.save(account, accountSession)).toMatchObject({ ok: true });
    expect(repository.load(guest)).toMatchObject({
      status: 'ok',
      envelope: { payload: { id: 'guest-session' } },
    });
    expect(repository.load(account)).toMatchObject({
      status: 'ok',
      envelope: { payload: { id: 'account-session' } },
    });
  });

  it('fails closed on corrupt state and leaves the exact bytes untouched', () => {
    const storage = createMemoryStorage();
    const repository = createSoloSessionRepository('practice:corrupt', storage);
    const key = repository.storageKey(guest);
    storage.setItem(key, '{broken-json');
    expect(repository.load(guest)).toEqual({ status: 'corrupt', reason: 'invalid_json' });
    expect(
      repository.save(
        guest,
        createOgSession({ id: 'replacement', answer: 'apple', scope: 'practice', now: at }),
        { expectedRevision: 0, replaceCorrupt: false },
      ),
    ).toEqual({ ok: false, reason: 'corrupt' });
    expect(storage.getItem(key)).toBe('{broken-json');
  });

  it('normalizes the legacy GO solvedAt hold while loading its versioned envelope', () => {
    const answers = ['apple', 'baker', 'cider', 'delta', 'ember'];
    const created = createGoSession({ id: 'legacy-go', answers, scope: 'practice', now: at });
    const submitted = submitGoGuess(created, 'apple', new Set(answers), at);
    if (!submitted.ok) throw new Error('GO persistence fixture failed.');
    const legacy = structuredClone(submitted.session) as unknown as {
      pendingAdvance: Record<string, unknown>;
    };
    legacy.pendingAdvance = { solvedPuzzleIndex: 0, nextPuzzleIndex: 1, solvedAt: at };

    const storage = createMemoryStorage();
    const repository = createSoloSessionRepository('practice:go', storage);
    storage.setItem(
      repository.storageKey(guest),
      JSON.stringify({
        schemaVersion: 1,
        owner: guest,
        revision: 7,
        updatedAt: at,
        payload: legacy,
      }),
    );
    expect(repository.load(guest)).toMatchObject({
      status: 'ok',
      envelope: {
        revision: 7,
        payload: {
          pendingAdvance: {
            solvedPuzzleIndex: 0,
            nextPuzzleIndex: 1,
            holdStartedAt: at,
            autoAdvanceAt: '2026-07-22T12:00:02.000Z',
          },
        },
      },
    });
  });

  it('reports unavailable storage distinctly from an empty lane', () => {
    const repository = createSoloSessionRepository('practice:unavailable', () => undefined);
    expect(repository.load(guest)).toMatchObject({ status: 'unavailable' });
  });
});
