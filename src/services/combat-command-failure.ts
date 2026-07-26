import { ServiceError } from './service-error';

export type CombatCommandFailureCode =
  | 'invalid-word'
  | 'invalid-length'
  | 'hard-mode'
  | 'not-your-turn'
  | 'hold-active'
  | 'state-conflict'
  | 'terminal'
  | 'network'
  | 'unknown';

export interface CombatCommandFailure {
  readonly code: CombatCommandFailureCode;
  readonly message: string;
  readonly reread: boolean;
}

function diagnosticText(error: unknown): string {
  if (!(error instanceof Error)) return '';
  const cause =
    error instanceof ServiceError && error.cause && typeof error.cause === 'object'
      ? JSON.stringify(error.cause)
      : '';
  return `${error.message} ${cause}`.toUpperCase();
}

export function combatCommandFailure(error: unknown): CombatCommandFailure {
  const diagnostic = diagnosticText(error);
  if (diagnostic.includes('INVALID_GUESS_WORD')) {
    return {
      code: 'invalid-word',
      message: 'That word is not in the game list.',
      reread: false,
    };
  }
  if (diagnostic.includes('INVALID_GUESS_LENGTH') || diagnostic.includes('INVALID_GUESS')) {
    return {
      code: 'invalid-length',
      message: 'Your guess does not have the required number of letters.',
      reread: false,
    };
  }
  if (diagnostic.includes('HARD_MODE_VIOLATION')) {
    return {
      code: 'hard-mode',
      message: 'That guess does not use all of the clues required by Hard Mode.',
      reread: false,
    };
  }
  if (diagnostic.includes('NOT_YOUR_TURN')) {
    return {
      code: 'not-your-turn',
      message: 'It is not your turn yet.',
      reread: true,
    };
  }
  if (diagnostic.includes('HOLD_ACTIVE')) {
    return {
      code: 'hold-active',
      message: 'The next puzzle is still being prepared.',
      reread: true,
    };
  }
  if (diagnostic.includes('STATE_CONFLICT') || diagnostic.includes('40001')) {
    return {
      code: 'state-conflict',
      message: 'The game changed. Review the latest turn and try again.',
      reread: true,
    };
  }
  if (diagnostic.includes('TERMINAL') || diagnostic.includes('NO_ATTEMPTS')) {
    return {
      code: 'terminal',
      message: 'This game has already ended.',
      reread: true,
    };
  }
  if (
    (error instanceof ServiceError && error.failure.code === 'network') ||
    diagnostic.includes('NETWORK') ||
    diagnostic.includes('FETCH')
  ) {
    return {
      code: 'network',
      message: 'Your guess was not submitted. Try again.',
      reread: false,
    };
  }
  return {
    code: 'unknown',
    message: 'Your action could not be completed. Try again.',
    reread: false,
  };
}
