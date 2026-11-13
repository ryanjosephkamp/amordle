import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);

const bankSchema = z
  .object({
    schemaVersion: z.literal(2),
    length: z.number().int().min(2).max(35),
    curation: z
      .object({
        method: z.literal('stratified_quality_score_v1'),
        targetSampleSize: z.number().int().positive(),
      })
      .strict(),
    answers: z.array(z.string().regex(/^[a-z]+$/)).min(1),
    validGuesses: z.array(z.string().regex(/^[a-z]+$/)).min(1),
  })
  .strict();

const entrySchema = z
  .object({
    length: z.number().int().min(2).max(35),
    answers: z.number().int().positive(),
    validGuesses: z.number().int().positive(),
    bytes: z.number().int().positive(),
    sha256: hashSchema,
    url: z.string(),
  })
  .strict();

const manifestSchema = z
  .object({
    schemaVersion: z.literal(2),
    revision: hashSchema,
    generatedAt: z.iso.datetime(),
    source: z
      .object({
        dataset: z.literal('ryanjosephkamp/english-openlist'),
        upstreamCommit: z.string().regex(/^[a-f0-9]{40}$/),
        upstreamManifestSha256: hashSchema,
        releaseDate: z.iso.date(),
        license: z.literal('other'),
        generatorVersion: z.literal('2.1.0'),
      })
      .strict(),
    entries: z.array(entrySchema).length(34),
  })
  .strict();

describe('deployment-bundled word authority', () => {
  it('validates every selected-length asset against the content-addressed manifest', async () => {
    const root = path.resolve(process.cwd(), 'data/word-lists');
    const manifest = manifestSchema.parse(
      JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8')),
    );
    expect(manifest.entries.map((entry) => entry.length)).toEqual(
      Array.from({ length: 34 }, (_, index) => index + 2),
    );

    for (const entry of manifest.entries) {
      const raw = await readFile(path.join(root, `words_length_${entry.length}.json`), 'utf8');
      const bank = bankSchema.parse(JSON.parse(raw));
      const answers = new Set(bank.answers);
      const validGuesses = new Set(bank.validGuesses);

      expect(bank.length).toBe(entry.length);
      expect(bank.curation).not.toHaveProperty('seed');
      expect(bank.answers.length).toBe(entry.answers);
      expect(bank.validGuesses.length).toBe(entry.validGuesses);
      expect(answers.size).toBe(bank.answers.length);
      expect(validGuesses.size).toBe(bank.validGuesses.length);
      expect(bank.answers.every((word) => word.length === entry.length)).toBe(true);
      expect(bank.validGuesses.every((word) => word.length === entry.length)).toBe(true);
      expect(bank.answers.every((word) => validGuesses.has(word))).toBe(true);
      expect(Buffer.byteLength(raw)).toBe(entry.bytes);
      expect(createHash('sha256').update(raw).digest('hex')).toBe(entry.sha256);
      expect(entry.url).toBe(
        `/word-lists/${manifest.revision}/${entry.length}-${entry.sha256}.json`,
      );
    }
  });
});
