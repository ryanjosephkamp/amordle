import { describe, expect, it } from 'vitest';
import { difficultyPool, selectDailyAnswers, selectPracticeAnswers } from '@/domain/selectors';

const words = Array.from({ length: 20 }, (_, index) => ({
  word: `w${String(index).padStart(2, '0')}`,
}));

describe('answer selectors', () => {
  it('uses nested difficulty pools', () => {
    const casual = difficultyPool(words, 'casual');
    const standard = difficultyPool(words, 'standard');
    const expert = difficultyPool(words, 'expert');
    expect(casual.every((word) => standard.includes(word))).toBe(true);
    expect(standard.every((word) => expert.includes(word))).toBe(true);
  });

  it('is stable per Practice generation and changes with generation', () => {
    const input = {
      answers: words,
      difficulty: 'expert' as const,
      count: 5,
      ownerNamespace: 'guest',
      mode: 'go',
      length: 3,
      generation: 0,
    };
    expect(selectPracticeAnswers(input)).toEqual(selectPracticeAnswers(input));
    expect(selectPracticeAnswers(input)).not.toEqual(
      selectPracticeAnswers({ ...input, generation: 1 }),
    );
  });

  it('preserves historical Daily selection around the GO cutoff', () => {
    expect(
      selectDailyAnswers({ answers: words, localDate: '2026-07-13', mode: 'go' }),
    ).toHaveLength(5);
    expect(
      selectDailyAnswers({ answers: words, localDate: '2026-07-14', mode: 'go' }),
    ).toHaveLength(5);
    expect(
      selectDailyAnswers({ answers: words, localDate: '2026-07-14', mode: 'og' }),
    ).toHaveLength(1);
  });
});
