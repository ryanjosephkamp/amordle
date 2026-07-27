import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { RankedWord } from '@/domain/selectors';

const answerSchema = z
  .object({
    word: z.string().regex(/^[a-z]+$/),
    quality_score: z.number().optional(),
  })
  .passthrough();

const wordBankSchema = z
  .object({
    metadata: z
      .object({
        length: z.number().int().min(2).max(35),
        version: z.string().min(1),
      })
      .passthrough(),
    answers: z.array(answerSchema),
    validGuesses: z.array(z.string().regex(/^[a-z]+$/)),
  })
  .strict();

export interface WordBank {
  length: number;
  revision: string;
  answers: RankedWord[];
  validGuesses: string[];
}

export async function loadWordBank(length: number): Promise<WordBank> {
  if (!Number.isInteger(length) || length < 2 || length > 35) {
    throw new Error('Word length must be an integer from 2 to 35.');
  }
  const file = path.resolve(
    process.cwd(),
    `bootstrap/source-data/word-lists/words_length_${length}.json`,
  );
  const parsed = wordBankSchema.parse(JSON.parse(await readFile(file, 'utf8')));
  if (parsed.metadata.length !== length) {
    throw new Error('Word-list length metadata does not match the request.');
  }
  const answers = parsed.answers.map((entry) => ({
    word: entry.word,
    ...(entry.quality_score === undefined ? {} : { qualityScore: entry.quality_score }),
  }));
  if (new Set(answers.map((entry) => entry.word)).size !== answers.length) {
    throw new Error('Answer list contains duplicate words.');
  }
  if (new Set(parsed.validGuesses).size !== parsed.validGuesses.length) {
    throw new Error('Valid-guess list contains duplicate words.');
  }
  const answerSet = new Set(answers.map((entry) => entry.word));
  const guesses = new Set([...parsed.validGuesses, ...answerSet]);
  if (
    [...guesses].some((word) => word.length !== length) ||
    answers.some((entry) => entry.word.length !== length)
  ) {
    throw new Error('Word-list entries do not match the selected length.');
  }
  return {
    length,
    revision: parsed.metadata.version,
    answers,
    validGuesses: [...guesses],
  };
}
