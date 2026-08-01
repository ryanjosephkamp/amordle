import { describe, expect, it } from 'vitest';
import {
  definitionCacheSchema,
  normalizeDefinitionWord,
  stripDefinitionMarkup,
} from '@/domain/definitions';

describe('definition lookup contract', () => {
  it('normalizes bounded alphabetic words and rejects unsafe input', () => {
    expect(normalizeDefinitionWord('  Abuse ')).toBe('abuse');
    expect(() => normalizeDefinitionWord('a')).toThrow(/2 to 35/);
    expect(() => normalizeDefinitionWord('two words')).toThrow(/alphabetic/);
    expect(() => normalizeDefinitionWord('<script>')).toThrow(/alphabetic/);
  });

  it('removes upstream markup before presentation', () => {
    expect(stripDefinitionMarkup('A <b>careful</b>  definition.')).toBe('A careful definition.');
    expect(stripDefinitionMarkup('<span>nested <i>markup</i></span>')).toBe('nested markup');
  });

  it('strictly parses cache records and excludes unrelated payload fields', () => {
    const record = {
      schemaVersion: 1,
      word: 'abuse',
      status: 'found',
      source: 'dictionary-api',
      definitions: [{ partOfSpeech: 'verb', definition: 'To use wrongly.' }],
      checkedAt: '2026-08-01T03:00:00.000Z',
      expiresAt: '2026-08-31T03:00:00.000Z',
    } as const;
    expect(definitionCacheSchema.parse(record).definitions).toHaveLength(1);
    expect(definitionCacheSchema.safeParse({ ...record, answer: 'private' }).success).toBe(false);
    expect(
      definitionCacheSchema.safeParse({
        ...record,
        definitions: Array(7).fill(record.definitions[0]),
      }).success,
    ).toBe(false);
  });
});
