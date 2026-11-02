import { z } from 'zod';

const tileState = z.enum(['correct', 'present', 'absent']);
const rowSchema = z
  .object({
    id: z.string(),
    puzzleIndex: z.number().int().nonnegative(),
    guess: z.string().regex(/^[a-z]+$/),
    tiles: z.array(
      z
        .object({
          letter: z.string().regex(/^[a-z]$/),
          state: tileState,
        })
        .strict(),
    ),
    kind: z.enum(['accepted', 'seeded']),
    acceptedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const gameSessionSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().min(1),
    ownerNamespace: z.string().min(1),
    settings: z
      .object({
        mode: z.enum(['og', 'go']),
        length: z.number().int().min(2).max(35),
        difficulty: z.enum(['casual', 'standard', 'expert']),
        hardMode: z.boolean(),
        goCount: z.union([z.literal(1), z.literal(5), z.literal(7), z.literal(10)]),
      })
      .strict(),
    answers: z.array(z.string().regex(/^[a-z]+$/)),
    puzzleIndex: z.number().int().nonnegative(),
    rows: z.array(rowSchema),
    draft: z.string().regex(/^[a-z]*$/),
    status: z.enum(['active', 'holding', 'won', 'lost']),
    rejection: z.string().nullable(),
    holdUntil: z.iso.datetime({ offset: true }).nullable(),
    continuationCount: z.number().int().nonnegative(),
    revealedPositions: z.record(z.string(), z.string().regex(/^[a-z]$/)),
    removedLetters: z.array(z.string().regex(/^[a-z]$/)),
    appliedOperationIds: z.array(z.string().min(1)),
    answerRevealed: z.boolean(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
