import { z } from 'zod';

const soloSettingsSummarySchema = z
  .object({
    mode: z.enum(['og', 'go']),
    length: z.number().int().min(2).max(35),
    difficulty: z.enum(['casual', 'standard', 'expert']),
    hardMode: z.boolean(),
    goCount: z.union([z.literal(1), z.literal(5), z.literal(7), z.literal(10)]),
  })
  .strict();

export const soloSessionSummarySchema = z
  .object({
    schemaVersion: z.literal(2),
    id: z.string().min(1).max(180),
    ownerNamespace: z.string().min(1),
    lane: z.enum(['practice', 'daily']),
    settings: soloSettingsSummarySchema,
    localDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    resumeHref: z.string().startsWith('/play/solo/').max(1_024),
    lifecycle: z.enum(['reserved', 'active', 'terminal', 'abandoned', 'conflict']),
    acceptedGuesses: z.number().int().nonnegative(),
    puzzleIndex: z.number().int().nonnegative(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
    lastPlayedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const soloSessionRegistrySchema = z
  .object({
    schemaVersion: z.literal(2),
    sessions: z.record(z.string(), soloSessionSummarySchema),
  })
  .strict();

export type SoloSessionSummary = z.infer<typeof soloSessionSummarySchema>;
export type SoloSessionRegistry = z.infer<typeof soloSessionRegistrySchema>;
export type SoloSessionCategory = 'practice:og' | 'practice:go' | 'daily:og' | 'daily:go';

export const soloSessionRegistryDomain = 'solo:index:v2';

export function emptySoloSessionRegistry(): SoloSessionRegistry {
  return { schemaVersion: 2, sessions: {} };
}

export function soloSessionRegistryForOwner(
  registry: SoloSessionRegistry,
  ownerNamespace: string,
): SoloSessionRegistry {
  return soloSessionRegistrySchema.parse({
    schemaVersion: 2,
    sessions: Object.fromEntries(
      Object.entries(registry.sessions).filter(
        ([, session]) => session.ownerNamespace === ownerNamespace,
      ),
    ),
  });
}

export function soloSessionCategory(session: SoloSessionSummary): SoloSessionCategory {
  return `${session.lane}:${session.settings.mode}`;
}

export function soloSessionLimit(category: SoloSessionCategory): number {
  return category.startsWith('practice:') ? 3 : 1;
}

function isOpen(session: SoloSessionSummary): boolean {
  return session.lifecycle === 'reserved' || session.lifecycle === 'active';
}

export function activeSoloSessions(registry: SoloSessionRegistry): SoloSessionSummary[] {
  return Object.values(registry.sessions)
    .filter((session) => isOpen(session) || session.lifecycle === 'conflict')
    .sort((left, right) => {
      const updated = Date.parse(right.lastPlayedAt) - Date.parse(left.lastPlayedAt);
      return updated || left.id.localeCompare(right.id);
    });
}

export function canStartSoloSession(
  registry: SoloSessionRegistry,
  category: SoloSessionCategory,
): boolean {
  return (
    activeSoloSessions(registry).filter(
      (session) => isOpen(session) && soloSessionCategory(session) === category,
    ).length < soloSessionLimit(category)
  );
}

/**
 * Normalizes concurrent offline/tab reservations deterministically. The newest
 * sessions retain their slots and older overflow entries remain visible as
 * conflicts until the player explicitly abandons them.
 */
export function normalizeSoloSessionLimits(registry: SoloSessionRegistry): SoloSessionRegistry {
  const sessions = { ...registry.sessions };
  const categories: SoloSessionCategory[] = ['practice:og', 'practice:go', 'daily:og', 'daily:go'];
  for (const category of categories) {
    const candidates = Object.values(sessions)
      .filter((session) => isOpen(session) && soloSessionCategory(session) === category)
      .sort((left, right) => {
        const updated = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
        return updated || left.id.localeCompare(right.id);
      });
    candidates.slice(soloSessionLimit(category)).forEach((session) => {
      sessions[session.id] = { ...session, lifecycle: 'conflict' };
    });
  }
  return soloSessionRegistrySchema.parse({ schemaVersion: 2, sessions });
}

export function mergeSoloSessionRegistries(
  local: SoloSessionRegistry,
  remote: SoloSessionRegistry,
): SoloSessionRegistry {
  const sessions = { ...local.sessions };
  for (const session of Object.values(remote.sessions)) {
    const current = sessions[session.id];
    if (
      !current ||
      Date.parse(session.updatedAt) > Date.parse(current.updatedAt) ||
      (session.updatedAt === current.updatedAt &&
        session.lifecycle.localeCompare(current.lifecycle) > 0)
    ) {
      sessions[session.id] = session;
    }
  }
  return normalizeSoloSessionLimits({ schemaVersion: 2, sessions });
}

export function upsertSoloSession(
  registry: SoloSessionRegistry,
  session: SoloSessionSummary,
): SoloSessionRegistry {
  const parsed = soloSessionSummarySchema.parse(session);
  const current = registry.sessions[parsed.id];
  if (current && Date.parse(current.updatedAt) > Date.parse(parsed.updatedAt)) return registry;
  return normalizeSoloSessionLimits({
    schemaVersion: 2,
    sessions: { ...registry.sessions, [parsed.id]: parsed },
  });
}

export function reserveSoloSession(
  registry: SoloSessionRegistry,
  session: SoloSessionSummary,
): SoloSessionRegistry {
  const parsed = soloSessionSummarySchema.parse(session);
  const category = soloSessionCategory(parsed);
  if (!canStartSoloSession(registry, category)) {
    throw new Error(`The ${category.replace(':', ' ')} active-session limit has been reached.`);
  }
  return upsertSoloSession(registry, parsed);
}

export function setSoloSessionLifecycle(
  registry: SoloSessionRegistry,
  sessionId: string,
  lifecycle: SoloSessionSummary['lifecycle'],
  updatedAt: string,
): SoloSessionRegistry {
  const current = registry.sessions[sessionId];
  if (!current) return registry;
  return upsertSoloSession(registry, {
    ...current,
    lifecycle,
    updatedAt,
    lastPlayedAt: updatedAt,
  });
}
