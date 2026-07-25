import { describe, expect, it, vi } from 'vitest';

import { createWordList, type WordListProvider } from '../../src/domain/words';
import { normalizeSoloLaunch, prepareSoloLaunch } from '../../src/features/play/solo-launch';

describe('Solo launch contract', () => {
  it('fixes Daily length and GO count while reporting canonical tamper removal', () => {
    expect(
      normalizeSoloLaunch({
        scope: 'daily',
        mode: 'go',
        wordLength: '35',
        goPuzzleCount: '10',
        difficulty: 'standard',
        hardMode: '1',
      }),
    ).toEqual({
      ok: true,
      spec: {
        scope: 'daily',
        mode: 'go',
        wordLength: 5,
        goPuzzleCount: 5,
        difficulty: 'standard',
        hardMode: true,
      },
      normalization: {
        changed: true,
        reasons: ['daily_word_length_removed', 'daily_go_count_removed'],
        canonical: {
          wordLength: 5,
          goPuzzleCount: 5,
          difficulty: 'standard',
          hardMode: true,
        },
      },
    });
    expect(normalizeSoloLaunch({ scope: 'daily', mode: 'og' })).toMatchObject({
      ok: true,
      spec: { scope: 'daily', mode: 'og', wordLength: 5 },
      normalization: { changed: false },
    });
  });

  it('accepts every Practice length from 2 through 35', () => {
    for (let wordLength = 2; wordLength <= 35; wordLength += 1) {
      expect(normalizeSoloLaunch({ scope: 'practice', mode: 'og', wordLength })).toMatchObject({
        ok: true,
        spec: { scope: 'practice', mode: 'og', wordLength },
      });
    }
  });

  it.each([5, 7, 10])('accepts Practice GO count %i', (goPuzzleCount) => {
    expect(
      normalizeSoloLaunch({ scope: 'practice', mode: 'go', wordLength: 8, goPuzzleCount }),
    ).toMatchObject({
      ok: true,
      spec: { scope: 'practice', mode: 'go', wordLength: 8, goPuzzleCount },
    });
  });

  it.each([1, 36, 5.5, '5.5', 'nope'])('fails invalid Practice length %s', (wordLength) => {
    expect(normalizeSoloLaunch({ scope: 'practice', mode: 'og', wordLength })).toEqual({
      ok: false,
      code: 'invalid_word_length',
      field: 'wordLength',
      message: 'Practice word length must be an integer from 2 through 35.',
    });
  });

  it.each([2, 6, 8, 11, 7.5, '7.5'])('fails invalid Practice GO count %s', (goPuzzleCount) => {
    expect(
      normalizeSoloLaunch({ scope: 'practice', mode: 'go', wordLength: 5, goPuzzleCount }),
    ).toMatchObject({ ok: false, code: 'invalid_go_puzzle_count' });
  });

  it('fails invalid Practice input before requesting a word list', async () => {
    const load = vi.fn();
    const provider: WordListProvider = { load };
    await expect(
      prepareSoloLaunch({ scope: 'practice', mode: 'go', wordLength: '35.1' }, provider),
    ).resolves.toMatchObject({ ok: false, code: 'invalid_word_length' });
    expect(load).not.toHaveBeenCalled();
  });

  it('loads only the normalized word length after successful validation', async () => {
    const list = createWordList({
      revision: 'launch-test',
      wordLength: 5,
      answers: { casual: ['apple'], standard: ['apple'], expert: ['apple'] },
      validGuesses: ['apple'],
    });
    const load = vi.fn().mockResolvedValue(list);
    const prepared = await prepareSoloLaunch(
      { scope: 'daily', mode: 'go', wordLength: 35, goPuzzleCount: 10 },
      { load },
    );
    expect(load).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledWith(5, undefined);
    expect(prepared).toMatchObject({ ok: true, spec: { wordLength: 5, goPuzzleCount: 5 } });
  });
});
