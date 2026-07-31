import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { RankedWord } from '@/domain/selectors';

const wordBankSchema = z
  .object({
    schemaVersion: z.literal(2),
    length: z.number().int().min(2).max(35),
    curation: z
      .object({
        method: z.literal('stratified_quality_score_v1'),
        seed: z.number().int(),
        targetSampleSize: z.number().int().positive(),
      })
      .strict(),
    answers: z.array(z.string().regex(/^[a-z]+$/)),
    validGuesses: z.array(z.string().regex(/^[a-z]+$/)),
  })
  .strict();

const manifestSchema = z
  .object({
    schemaVersion: z.literal(2),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .passthrough();

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
  const root = path.resolve(process.cwd(), 'data/word-lists');
  const [manifest, parsed] = await Promise.all([
    readFile(path.join(root, 'manifest.json'), 'utf8').then((raw) =>
      manifestSchema.parse(JSON.parse(raw)),
    ),
    readFile(path.join(root, `words_length_${length}.json`), 'utf8').then((raw) =>
      wordBankSchema.parse(JSON.parse(raw)),
    ),
  ]);
  if (parsed.length !== length || parsed.curation.seed !== 42 + length) {
    throw new Error('Word-list length metadata does not match the request.');
  }
  const answers = parsed.answers.map((word) => ({ word }));
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
    revision: manifest.revision,
    answers,
    validGuesses: [...guesses],
  };
}
