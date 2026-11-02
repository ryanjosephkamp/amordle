import { z } from 'zod';

export const definitionEntrySchema = z
  .object({
    definition: z.string().trim().min(1).max(1200),
    partOfSpeech: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

export const definitionCacheSchema = z
  .object({
    schemaVersion: z.literal(1),
    word: z.string().regex(/^[a-z]{2,35}$/),
    status: z.enum(['found', 'not-found']),
    source: z.enum(['dictionary-api', 'wiktionary']).optional(),
    definitions: z.array(definitionEntrySchema).max(6),
    checkedAt: z.iso.datetime({ offset: true }),
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export type DefinitionEntry = z.infer<typeof definitionEntrySchema>;
export type DefinitionCacheRecord = z.infer<typeof definitionCacheSchema>;

export type DefinitionLookupResult = DefinitionCacheRecord & {
  cached: boolean;
  stale: boolean;
};

export function normalizeDefinitionWord(word: string): string {
  const normalized = word.trim().toLocaleLowerCase('en-US');
  if (!/^[a-z]{2,35}$/.test(normalized)) {
    throw new Error('Definitions require one alphabetic word from 2 to 35 letters.');
  }
  return normalized;
}

export function stripDefinitionMarkup(value: string): string {
  let text = '';
  let insideTag = false;
  let previousWasWhitespace = false;
  for (const character of value) {
    if (character === '<') {
      insideTag = true;
      continue;
    }
    if (character === '>') {
      insideTag = false;
      continue;
    }
    if (insideTag) continue;
    if (/\s/.test(character)) {
      if (!previousWasWhitespace) text += ' ';
      previousWasWhitespace = true;
      continue;
    }
    text += character;
    previousWasWhitespace = false;
  }
  return text.trim();
}
