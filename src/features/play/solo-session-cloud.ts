import { z } from 'zod';
import { restoreOgSession } from '../../domain/game';
import { restoreGoSession } from '../../domain/go';
import type { AmordleSupabaseClient } from '../../lib/supabase-browser';
import type { IdentityScope, VersionedEnvelope } from '../../persistence/local-repository';
import {
  SoloCloudRepository,
  SupabaseSoloCloudStore,
  type SoloCloudReconcileResult,
} from '../../services/solo-cloud-repository';
import type { SoloSession } from './solo-session-repository';

export type SoloCloudPayload = {
  readonly lanes: Readonly<Record<string, SoloSession>>;
};

const soloSessionSchema = z.custom<SoloSession>(
  (value) => Boolean(restoreOgSession(value) ?? restoreGoSession(value)),
  'Invalid private Solo session.',
);

export const soloCloudPayloadSchema: z.ZodType<SoloCloudPayload> = z.object({
  lanes: z.record(z.string().min(1).max(300), soloSessionSchema),
});

export function createSoloSessionCloudRepository(client: AmordleSupabaseClient) {
  return new SoloCloudRepository(new SupabaseSoloCloudStore(client), soloCloudPayloadSchema);
}

export async function syncSoloCloudLane(input: {
  readonly repository: SoloCloudRepository<SoloCloudPayload>;
  readonly identity: IdentityScope;
  readonly lane: string;
  readonly session: SoloSession;
}): Promise<SoloCloudReconcileResult<SoloCloudPayload>> {
  if (input.identity.kind === 'guest') {
    return input.repository.reconcile(input.identity);
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const loaded = await input.repository.load(input.identity);
    if (loaded.status === 'corrupt' || loaded.status === 'guest-local-only') return loaded;
    const prior = loaded.status === 'ok' ? loaded.envelope : undefined;
    const cloudLane = prior?.payload.lanes[input.lane];
    if (cloudLane && Date.parse(cloudLane.updatedAt) > Date.parse(input.session.updatedAt)) {
      return { status: 'stale-rejected', authoritative: prior! };
    }
    const candidate: VersionedEnvelope<SoloCloudPayload> = {
      schemaVersion: 1,
      owner: input.identity,
      revision: (prior?.revision ?? 0) + 1,
      updatedAt: new Date().toISOString(),
      payload: {
        lanes: { ...(prior?.payload.lanes ?? {}), [input.lane]: input.session },
      },
    };
    const reconciled = await input.repository.reconcile(input.identity, candidate);
    if (reconciled.status !== 'conflict') return reconciled;
  }
  return input.repository.reconcile(input.identity);
}
