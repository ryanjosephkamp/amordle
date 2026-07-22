import { describe, expect, it, vi } from 'vitest';

import {
  answerPoolForDifficulty,
  assertWordLength,
  createCachedWordListProvider,
  createWordList,
  dailyAnswerIndex,
  normalizeWord,
  normalizeBundledWordPayload,
  partitionAnswerPools,
  scoreWordsByQuality,
  selectDailyOgAnswer,
  WordListValidationError,
} from '../../src/domain/words';

describe('word-list authority', () => {
  it('normalizes values and keeps difficulty subsets separate from valid guesses', () => {
    const list = createWordList({
      revision: 'revision-1',
      wordLength: 5,
      answers: {
        casual: [' Apple '],
        standard: ['APPLE', 'Baker'],
        expert: ['apple', 'baker', 'cider'],
      },
      validGuesses: ['allee', 'APPLE'],
      definitions: { apple: [{ text: ' A fruit. ', partOfSpeech: ' noun ' }] },
    });
    expect(answerPoolForDifficulty(list, 'casual')).toEqual(['apple']);
    expect(answerPoolForDifficulty(list, 'expert')).toEqual(['apple', 'baker', 'cider']);
    expect(list.validGuesses).toEqual(['allee', 'apple', 'baker', 'cider']);
    expect(list.definitions?.apple).toEqual([{ text: 'A fruit.', partOfSpeech: 'noun' }]);
    expect(normalizeWord('  APPLE  ')).toBe('apple');
  });

  it('accepts every supported length and rejects unsupported substitution', () => {
    for (let length = 2; length <= 35; length += 1) expect(assertWordLength(length)).toBe(length);
    expect(() => assertWordLength(1)).toThrow(RangeError);
    expect(() => assertWordLength(36)).toThrow(RangeError);
    expect(() =>
      createWordList({
        revision: 'bad',
        wordLength: 5,
        answers: { casual: ['apple'], standard: ['apple'], expert: ['apple'] },
        validGuesses: ['four'],
      }),
    ).toThrow(WordListValidationError);
  });

  it('deduplicates concurrent loads, caches success, and permits retry after failure', async () => {
    const list = createWordList({
      revision: 'revision-1',
      wordLength: 2,
      answers: { casual: ['am'], standard: ['am'], expert: ['am'] },
      validGuesses: ['am'],
    });
    const load = vi.fn().mockResolvedValue(list);
    const provider = createCachedWordListProvider({ load });
    const [left, right] = await Promise.all([provider.load(2), provider.load(2)]);
    expect(left).toBe(list);
    expect(right).toBe(list);
    expect(load).toHaveBeenCalledTimes(1);
    await provider.load(2);
    expect(load).toHaveBeenCalledTimes(1);
    provider.clear();
    await provider.load(2);
    expect(load).toHaveBeenCalledTimes(2);

    const retryLoad = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(list);
    const retryProvider = createCachedWordListProvider({ load: retryLoad });
    await expect(retryProvider.load(2)).rejects.toThrow('offline');
    await expect(retryProvider.load(2)).resolves.toBe(list);
    expect(retryLoad).toHaveBeenCalledTimes(2);
  });

  it('normalizes the portable answer-record payload without inventing difficulty authority', () => {
    expect(
      normalizeBundledWordPayload({
        metadata: {
          length: 5,
          version: 'revision-1',
          source: 'english-openlist',
          generatedAt: '2026-07-20T00:29:14.000Z',
        },
        answers: [{ word: 'APPLE' }, { word: 'baker' }],
        validGuesses: ['allee'],
      }),
    ).toEqual({
      revision: 'revision-1',
      wordLength: 5,
      answers: ['apple', 'baker'],
      validGuesses: ['allee'],
      source: 'english-openlist',
      generatedAt: '2026-07-20T00:29:14.000Z',
    });
  });

  it('derives deterministic quality-ranked 35/70/100 answer pools without reordering members', () => {
    const catalog = [
      'abbes',
      'abets',
      'apple',
      'baker',
      'cider',
      'delta',
      'ember',
      'fable',
      'grape',
      'hotel',
      'ivory',
      'joker',
      'karma',
      'lemon',
      'mango',
      'noble',
      'ocean',
      'piano',
      'queen',
      'river',
    ];
    const pools = partitionAnswerPools(catalog);
    expect(pools.casual).toHaveLength(7);
    expect(pools.standard).toHaveLength(14);
    expect(pools.expert).toEqual(catalog);
    expect(pools.casual.every((word) => pools.standard.includes(word))).toBe(true);
    expect(pools.standard.every((word) => pools.expert.includes(word))).toBe(true);
    expect(pools.casual.map((word) => catalog.indexOf(word))).toEqual(
      [...pools.casual.map((word) => catalog.indexOf(word))].sort((left, right) => left - right),
    );
    expect(scoreWordsByQuality(catalog)).toEqual(scoreWordsByQuality([...catalog].reverse()));
    // Quality selection is not the former alphabetical-prefix slice.
    expect(pools.casual).not.toEqual(catalog.slice(0, 7));
  });

  it('keeps quality pools nested and correctly sized for every supported length', () => {
    for (let length = 2; length <= 35; length += 1) {
      const catalog = 'abcdefghijklmnopqrst'
        .split('')
        .map((letter) => `${letter}${'a'.repeat(length - 1)}`);
      const pools = partitionAnswerPools(catalog);
      expect(pools.casual).toHaveLength(7);
      expect(pools.standard).toHaveLength(14);
      expect(pools.expert).toHaveLength(20);
      expect(pools.casual.every((word) => pools.standard.includes(word))).toBe(true);
      expect(pools.standard.every((word) => pools.expert.includes(word))).toBe(true);
    }
  });

  it('preserves the retained OG date-index selector', () => {
    expect(dailyAnswerIndex('2026-05-26', 3)).toBe(1);
    expect(selectDailyOgAnswer(['crane', 'slate', 'brisk'], '2026-05-26')).toBe('slate');
    expect(() => dailyAnswerIndex('2026-02-30', 3)).toThrow(RangeError);
  });
});
