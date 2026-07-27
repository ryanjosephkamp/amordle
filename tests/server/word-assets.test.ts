import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const bankSchema = z
  .object({
    metadata: z
      .object({
        length: z.number().int(),
        source: z.string(),
        version: z.string(),
        generatedAt: z.iso.datetime(),
        curation: z
          .object({
            method: z.string(),
            seed: z.number().int(),
            target_sample_size: z.number().int().positive(),
            curation_date: z.iso.datetime(),
            note: z.string(),
          })
          .strict(),
      })
      .strict(),
    answers: z.array(z.object({ word: z.string() }).strict()),
    validGuesses: z.array(z.string()),
  })
  .strict();

describe('versioned word assets', () => {
  it('validates every selected-length source independently', async () => {
    const versions = new Set<string>();
    for (let length = 2; length <= 35; length += 1) {
      const file = path.resolve(
        process.cwd(),
        `bootstrap/source-data/word-lists/words_length_${length}.json`,
      );
      const raw = await readFile(file, 'utf8');
      const bank = bankSchema.parse(JSON.parse(raw));
      versions.add(bank.metadata.version);
      expect(bank.metadata.length).toBe(length);
      expect(bank.answers.length).toBeGreaterThan(0);
      expect(bank.validGuesses.length).toBeGreaterThan(0);
      expect(new Set(bank.answers.map((entry) => entry.word)).size).toBe(bank.answers.length);
      expect(new Set(bank.validGuesses).size).toBe(bank.validGuesses.length);
      expect(
        bank.answers.every((entry) => entry.word.length === length && /^[a-z]+$/.test(entry.word)),
      ).toBe(true);
      expect(
        bank.validGuesses.every((word) => word.length === length && /^[a-z]+$/.test(word)),
      ).toBe(true);
      expect(createHash('sha256').update(raw).digest('hex')).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(versions.size).toBe(1);
  });
});
