import { z } from 'zod';
import { restoreOgSession, type OgSession } from '../../domain/game';
import { restoreGoSession, type GoSession } from '../../domain/go';
import {
  createVersionedLocalRepository,
  type IdentityScope,
  type StorageLike,
  type VersionedLocalRepository,
} from '../../persistence/local-repository';

export type SoloSession = OgSession | GoSession;

export const soloSessionSchema: z.ZodType<SoloSession> = z.unknown().transform((value, context) => {
  const restored = restoreOgSession(value) ?? restoreGoSession(value);
  if (!restored) {
    context.addIssue({ code: 'custom', message: 'Invalid Solo session' });
    return z.NEVER;
  }
  return restored;
});

const repositories = new Map<string, VersionedLocalRepository<SoloSession>>();

export const guestIdentity: IdentityScope = { kind: 'guest' };

function safeSessionKey(sessionKey: string): string {
  return sessionKey.replace(/[^a-zA-Z0-9:_-]/g, '_').slice(0, 240);
}

export function createSoloSessionRepository(
  sessionKey: string,
  storage: StorageLike | (() => StorageLike | undefined),
): VersionedLocalRepository<SoloSession> {
  return createVersionedLocalRepository<SoloSession>({
    schema: soloSessionSchema,
    storage,
    keyPrefix: `amordle:solo:${safeSessionKey(sessionKey)}`,
  });
}

export function soloSessionRepository(sessionKey: string): VersionedLocalRepository<SoloSession> {
  const safeKey = safeSessionKey(sessionKey);
  const existing = repositories.get(safeKey);
  if (existing) return existing;
  const repository = createSoloSessionRepository(safeKey, () => {
    try {
      return window.localStorage;
    } catch {
      return undefined;
    }
  });
  repositories.set(safeKey, repository);
  return repository;
}
