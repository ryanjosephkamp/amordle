import { z } from 'zod';
import { restoreOgSession, type OgSession } from '../../domain/game';
import { restoreGoSession, type GoSession } from '../../domain/go';
import {
  createVersionedLocalRepository,
  type IdentityScope,
  type VersionedLocalRepository,
} from '../../persistence/local-repository';

export type SoloSession = OgSession | GoSession;

const soloSessionSchema = z.custom<SoloSession>(
  (value) => restoreOgSession(value) !== undefined || restoreGoSession(value) !== undefined,
  'Invalid Solo session',
);

const repositories = new Map<string, VersionedLocalRepository<SoloSession>>();

export const guestIdentity: IdentityScope = { kind: 'guest' };

export function soloSessionRepository(sessionKey: string): VersionedLocalRepository<SoloSession> {
  const safeKey = sessionKey.replace(/[^a-zA-Z0-9:_-]/g, '_').slice(0, 240);
  const existing = repositories.get(safeKey);
  if (existing) return existing;
  const repository = createVersionedLocalRepository<SoloSession>({
    schema: soloSessionSchema,
    storage: () => {
      try {
        return window.localStorage;
      } catch {
        return undefined;
      }
    },
    keyPrefix: `amordle:solo:${safeKey}`,
  });
  repositories.set(safeKey, repository);
  return repository;
}
