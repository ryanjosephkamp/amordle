import { z } from 'zod';
import type { Difficulty } from '../../domain/words';
import {
  createVersionedLocalRepository,
  type IdentityScope,
} from '../../persistence/local-repository';

const generationSchema = z.object({ generation: z.number().int().nonnegative() });

export type PracticeGenerationLane = {
  readonly mode: 'og' | 'go';
  readonly wordLength: number;
  readonly difficulty: Difficulty;
  readonly goPuzzleCount: 1 | 5 | 7 | 10;
};

function laneKey(lane: PracticeGenerationLane): string {
  return [lane.mode, `${lane.wordLength}l`, lane.difficulty, `${lane.goPuzzleCount}p`].join(':');
}

export function currentPracticeGeneration(
  identity: IdentityScope,
  lane: PracticeGenerationLane,
): number {
  const repository = createVersionedLocalRepository({
    schema: generationSchema,
    storage: () => {
      try {
        return window.localStorage;
      } catch {
        return undefined;
      }
    },
    keyPrefix: `amordle:solo-generation:${laneKey(lane)}`,
  });
  const loaded = repository.load(identity);
  return loaded.status === 'ok' ? loaded.envelope.payload.generation : 0;
}

export function commitPracticeGeneration(
  identity: IdentityScope,
  lane: PracticeGenerationLane,
  expectedGeneration: number,
  generation: number,
): boolean {
  if (generation !== expectedGeneration + 1) return false;
  const repository = createVersionedLocalRepository({
    schema: generationSchema,
    storage: () => {
      try {
        return window.localStorage;
      } catch {
        return undefined;
      }
    },
    keyPrefix: `amordle:solo-generation:${laneKey(lane)}`,
  });
  const loaded = repository.load(identity);
  if (loaded.status === 'corrupt' || loaded.status === 'unavailable') return false;
  const current = loaded.status === 'ok' ? loaded.envelope.payload.generation : 0;
  if (current !== expectedGeneration) return current >= generation;
  const result = repository.save(
    identity,
    { generation },
    {
      expectedRevision: loaded.status === 'ok' ? loaded.envelope.revision : 0,
      replaceCorrupt: false,
    },
  );
  return result.ok;
}
