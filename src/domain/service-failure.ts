export type ServiceFailureKind =
  'auth' | 'not-found' | 'forbidden' | 'offline' | 'unavailable' | 'unsupported' | 'unknown';

/*
 * A3. The client already knows why a load failed — the authority raises distinct
 * SQLSTATEs for "you are not signed in", "no such match", and "you are not one of its
 * two players", and the adapter carries the code through on ServiceError. The match
 * view discarded all of it and read only `isError`, so a deliberate cancellation, a
 * broken link, someone else's private match and a dropped connection all produced the
 * same sentence and the same retry button — one of which could never succeed.
 *
 * Takes a plain code rather than the error object so the domain stays free of
 * transport types.
 */
export function classifyServiceFailure(input: {
  code?: string | null | undefined;
  online?: boolean | undefined;
}): ServiceFailureKind {
  if (input.online === false) return 'offline';
  switch (input.code) {
    case '28000':
    case 'AUTH_REQUIRED':
      return 'auth';
    case 'P0002':
    case 'PGRST116':
    case 'NOT_FOUND':
      return 'not-found';
    case '42501':
    case 'FORBIDDEN':
      return 'forbidden';
    case 'UNAVAILABLE':
      return 'unavailable';
    case 'INVALID_RESPONSE':
      return 'unsupported';
    default:
      return 'unknown';
  }
}

/** Retrying only makes sense where the same request could plausibly succeed later. */
export function serviceFailureIsRetryable(kind: ServiceFailureKind): boolean {
  return (
    kind === 'offline' || kind === 'unavailable' || kind === 'unsupported' || kind === 'unknown'
  );
}
