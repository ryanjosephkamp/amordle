import type { Difficulty } from './game';

export interface RankedWord {
  word: string;
  qualityScore?: number;
}

function hashRank(seed: string, word: string): number {
  // FNV-1a keeps answer selection deterministic in browsers, workers, and Node
  // without importing a server-only crypto implementation into the game domain.
  let hash = 0x811c9dc5;
  for (const character of `${seed}\0${word}`) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  let mixed = hash >>> 0;
  mixed = (mixed ^ (mixed >>> 16)) >>> 0;
  mixed = Math.imul(mixed, 2_246_822_507) >>> 0;
  mixed = (mixed ^ (mixed >>> 13)) >>> 0;
  mixed = Math.imul(mixed, 3_266_489_909) >>> 0;
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

function bySeed(seed: string) {
  return (left: RankedWord, right: RankedWord): number => {
    const difference = hashRank(seed, left.word) - hashRank(seed, right.word);
    return difference || left.word.localeCompare(right.word);
  };
}

export function difficultyPool(
  answers: readonly RankedWord[],
  difficulty: Difficulty,
): RankedWord[] {
  const fraction = difficulty === 'casual' ? 0.35 : difficulty === 'standard' ? 0.7 : 1;
  const count = Math.max(1, Math.ceil(answers.length * fraction));
  return answers.slice(0, count);
}

export function selectPracticeAnswers(input: {
  answers: readonly RankedWord[];
  difficulty: Difficulty;
  count: number;
  ownerNamespace: string;
  mode: string;
  length: number;
  generation: number;
}): string[] {
  const pool = difficultyPool(input.answers, input.difficulty);
  if (pool.length < input.count) {
    throw new Error('The selected word pool is too small.');
  }
  const seed = [
    'practice-v1',
    input.ownerNamespace,
    input.mode,
    input.length,
    input.difficulty,
    input.count,
    input.generation,
  ].join(':');
  return [...pool]
    .sort(bySeed(seed))
    .slice(0, input.count)
    .map((entry) => entry.word);
}

/**
 * First local date whose Daily OG answer comes from the seeded order below. Earlier dates keep
 * the answer they were always served (the catalog walked in list order, one word a day), so a
 * past Daily never changes under a player who has it saved.
 */
export const DAILY_OG_SEEDED_FROM = '2026-11-05';

function seededDailyOgAnswer(catalog: readonly string[], localDate: string): string {
  const seed = `og-daily-v2:solo:daily:unranked:${localDate}`;
  let best = catalog[0] as string;
  let bestRank = hashRank(seed, best);
  for (const word of catalog) {
    const rank = hashRank(seed, word);
    if (rank < bestRank || (rank === bestRank && word.localeCompare(best) < 0)) {
      best = word;
      bestRank = rank;
    }
  }
  return best;
}

export function selectDailyAnswers(input: {
  answers: readonly RankedWord[];
  localDate: string;
  mode: 'og' | 'go';
}): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.localDate)) {
    throw new Error('Daily date must use YYYY-MM-DD.');
  }
  const catalog = [...new Set(input.answers.map((entry) => entry.word))];
  if (!catalog.length) throw new Error('Daily answer catalog is empty.');
  const day = Date.parse(`${input.localDate}T00:00:00.000Z`) / 86_400_000;
  if (!Number.isInteger(day)) throw new Error('Daily date is invalid.');
  const ogIndex = ((day % catalog.length) + catalog.length) % catalog.length;
  if (input.mode === 'og') {
    if (input.localDate < DAILY_OG_SEEDED_FROM) return [catalog[ogIndex] as string];
    return [seededDailyOgAnswer(catalog, input.localDate)];
  }
  if (input.localDate < '2026-07-14') {
    let legacyHash = (Math.trunc(day) ^ 0x9e3779b9) >>> 0;
    legacyHash = Math.imul(legacyHash ^ (legacyHash >>> 16), 0x45d9f3b) >>> 0;
    legacyHash = Math.imul(legacyHash ^ (legacyHash >>> 16), 0x45d9f3b) >>> 0;
    legacyHash = (legacyHash ^ (legacyHash >>> 16)) >>> 0;
    const start =
      catalog.length === 1
        ? ogIndex
        : (ogIndex + 1 + (legacyHash % (catalog.length - 1))) % catalog.length;
    return Array.from(
      { length: 5 },
      (_, offset) => catalog[(start + offset) % catalog.length] as string,
    );
  }
  const seed = `go-chain-v2:solo:daily:unranked:${input.localDate}:5:expert:5`;
  return [...input.answers]
    .sort(bySeed(seed))
    .slice(0, 5)
    .map((entry) => entry.word);
}
