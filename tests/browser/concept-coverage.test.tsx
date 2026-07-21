import { describe, expect, it } from 'vitest';

import { conceptCoverage, coveredConceptIds } from '../../src/app/conceptCoverage';

describe('locked concept coverage', () => {
  it('maps every L01–L64 concept exactly once', () => {
    expect(conceptCoverage).toHaveLength(32);
    expect(coveredConceptIds.size).toBe(64);
    for (let index = 1; index <= 64; index += 1) {
      expect(coveredConceptIds.has(`L${String(index).padStart(2, '0')}`)).toBe(true);
    }
  });

  it('records at least five comparison dimensions per state', () => {
    const compositionNotes = new Set<string>();
    for (const entry of conceptCoverage) {
      expect(entry.comparison.length).toBeGreaterThanOrEqual(5);
      expect(entry.comparison.some((note) => note.startsWith('interaction state:'))).toBe(true);
      expect(entry.comparison.every((note) => note.length > 48)).toBe(true);
      compositionNotes.add(entry.comparison[0]);
    }
    expect(compositionNotes.size).toBe(conceptCoverage.length);
  });
});
