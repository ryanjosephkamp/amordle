import { describe, expect, it } from 'vitest';
import {
  DAILY_OG_SEEDED_FROM,
  difficultyPool,
  selectDailyAnswers,
  selectPracticeAnswers,
} from '@/domain/selectors';

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

  it('keeps every GO Daily exactly as it was served', () => {
    const go = (localDate: string) => selectDailyAnswers({ answers: words, localDate, mode: 'go' });
    expect(go('2026-07-13')).toEqual(['w04', 'w05', 'w06', 'w07', 'w08']);
    expect(go('2026-07-14')).toEqual(['w17', 'w09', 'w13', 'w07', 'w08']);
    expect(go('2026-11-04')).toEqual(['w16', 'w07', 'w08', 'w13', 'w14']);
    expect(go('2026-11-05')).toEqual(['w04', 'w16', 'w03', 'w15', 'w12']);
  });
});

describe('Daily OG order', () => {
  const catalog = Array.from({ length: 2175 }, (_, index) => ({
    word: `w${String(index).padStart(4, '0')}`,
  }));
  const SEEDED_DAY = '2026-12-01';
  const og = (localDate: string, answers = catalog) =>
    selectDailyAnswers({ answers, localDate, mode: 'og' })[0] as string;
  const dayAfter = (localDate: string, offset: number) =>
    new Date(Date.parse(`${localDate}T00:00:00.000Z`) + offset * 86_400_000)
      .toISOString()
      .slice(0, 10);

  it('keeps past Dailies on the list-order answer they were served', () => {
    const small = Array.from({ length: 20 }, (_, index) => ({
      word: `w${String(index).padStart(2, '0')}`,
    }));
    expect(og('2026-11-04', small)).toBe('w01');
    expect(og(dayAfter(DAILY_OG_SEEDED_FROM, -1), small)).toBe('w01');
    expect(og('2026-07-20', small)).toBe(og('2026-07-20', small));
  });

  it('stops walking the list from the cutover on', () => {
    const index = new Map(catalog.map((entry, position) => [entry.word, position]));
    let adjacent = 0;
    for (let offset = 0; offset < 60; offset += 1) {
      const today = index.get(og(dayAfter(SEEDED_DAY, offset))) as number;
      const tomorrow = index.get(og(dayAfter(SEEDED_DAY, offset + 1))) as number;
      if (Math.abs(today - tomorrow) <= 1) adjacent += 1;
    }
    expect(adjacent).toBeLessThanOrEqual(1);
  });

  it('is deterministic and independent of the order of the list', () => {
    const reversed = [...catalog].reverse();
    for (let offset = 0; offset < 30; offset += 1) {
      const date = dayAfter(SEEDED_DAY, offset);
      expect(og(date, reversed)).toBe(og(date));
      expect(og(date)).toBe(og(date));
    }
  });

  it('always returns a word from the list and varies across days', () => {
    const words = new Set(catalog.map((entry) => entry.word));
    const seen = new Set<string>();
    for (let offset = 0; offset < 100; offset += 1) {
      const answer = og(dayAfter(SEEDED_DAY, offset));
      expect(words.has(answer)).toBe(true);
      seen.add(answer);
    }
    expect(seen.size).toBeGreaterThan(95);
  });
});
