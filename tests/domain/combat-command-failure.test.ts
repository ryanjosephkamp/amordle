import { describe, expect, it } from 'vitest';

import { combatCommandFailure } from '../../src/services/combat-command-failure';
import { ServiceError } from '../../src/services/service-error';

describe('COMBAT command failure mapping', () => {
  it.each([
    ['INVALID_GUESS_WORD', 'invalid-word', false],
    ['INVALID_GUESS_LENGTH', 'invalid-length', false],
    ['HARD_MODE_VIOLATION', 'hard-mode', false],
    ['NOT_YOUR_TURN', 'not-your-turn', true],
    ['HOLD_ACTIVE', 'hold-active', true],
    ['STATE_CONFLICT', 'state-conflict', true],
    ['TERMINAL', 'terminal', true],
  ] as const)('maps %s to %s', (detail, code, reread) => {
    const failure = combatCommandFailure(
      new ServiceError('persistence', 'Command failed.', { cause: { details: detail } }),
    );
    expect(failure.code).toBe(code);
    expect(failure.reread).toBe(reread);
  });

  it('does not reread durable state for an ambiguous network failure', () => {
    expect(combatCommandFailure(new ServiceError('network', 'Fetch failed.'))).toMatchObject({
      code: 'network',
      reread: false,
    });
  });
});
