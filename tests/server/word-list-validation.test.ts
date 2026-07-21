import { describe, expect, it } from 'vitest';
import { RefreshError } from '../../api/_lib/safe-error';
import { validateWordListPayload } from '../../api/_lib/word-list-refresh';

describe('word-list validation', () => {
  it('normalizes a complete supported payload', () => {
    expect(
      validateWordListPayload(
        {
          metadata: {
            length: 2,
            source: 'fixture',
            version: 'fixture-v1',
            generatedAt: '2026-07-21T00:00:00.000Z',
          },
          answers: [{ word: 'Ab' }],
          validGuesses: ['AB', 'cd'],
        },
        2,
      ),
    ).toEqual({
      metadata: {
        length: 2,
        source: 'fixture',
        version: 'fixture-v1',
        generatedAt: '2026-07-21T00:00:00.000Z',
      },
      answers: [{ word: 'ab' }],
      validGuesses: ['ab', 'cd'],
    });
  });

  it.each([
    [{ answers: [], validGuesses: ['ab'] }, 2],
    [{ answers: ['ab'], validGuesses: [] }, 2],
    [{ answers: ['abc'], validGuesses: ['abc'] }, 2],
    [{ answers: ['a1'], validGuesses: ['a1'] }, 2],
    [{ answers: ['ab', 'AB'], validGuesses: ['ab'] }, 2],
    [{ answers: ['ab'], validGuesses: ['cd'] }, 2],
    [{ words: ['ab'] }, 2],
  ])('rejects an incomplete or unsafe payload %#', (payload, length) => {
    expect(() => validateWordListPayload(payload, length)).toThrow(RefreshError);
  });

  it.each([1, 36, 2.5])('rejects unsupported length %s', (length) => {
    expect(() => validateWordListPayload(['ab'], length)).toThrow('unsupported');
  });
});
