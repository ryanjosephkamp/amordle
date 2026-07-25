import { z } from 'zod';
import {
  createVersionedLocalRepository,
  ownerStorageSegment,
  type IdentityScope,
  type StorageLike,
} from '../persistence/local-repository';

const difficultySchema = z.enum(['Casual', 'Standard', 'Expert']);
const chainSchema = z.union([z.literal(5), z.literal(7), z.literal(10)]);

const settingsSchema = z.object({
  difficulty: difficultySchema,
  chain: chainSchema,
  hard: z.boolean(),
  sound: z.boolean(),
  motion: z.boolean(),
  notifications: z.boolean(),
});

const settingsPatchSchema = settingsSchema.partial();

export type PlayerSettings = z.infer<typeof settingsSchema>;
export type PlayerSettingsPatch = z.infer<typeof settingsPatchSchema>;

export const defaultPlayerSettings: Readonly<PlayerSettings> = {
  difficulty: 'Expert',
  chain: 5,
  hard: false,
  sound: true,
  motion: false,
  notifications: true,
};

export type SettingsLoadResult = {
  readonly settings: PlayerSettings;
  readonly revision: number;
  readonly status: 'default' | 'versioned' | 'legacy-migrated' | 'corrupt' | 'unavailable';
};

const envelopeKeys = ['schemaVersion', 'owner', 'revision', 'updatedAt', 'payload'] as const;
const settingKeys = ['difficulty', 'chain', 'hard', 'sound', 'motion', 'notifications'] as const;

function repository(storage: StorageLike | undefined) {
  return createVersionedLocalRepository<PlayerSettings>({
    schema: settingsSchema,
    storage: () => storage,
    keyPrefix: 'amordle:settings',
  });
}

export function settingsStorageKey(identity: IdentityScope): string {
  return `amordle:settings:${ownerStorageSegment(identity)}`;
}

export function mergePlayerSettings(
  input: unknown,
  base: PlayerSettings = { ...defaultPlayerSettings },
): PlayerSettings {
  const parsed = settingsPatchSchema.safeParse(input);
  return parsed.success ? settingsSchema.parse({ ...base, ...parsed.data }) : { ...base };
}

function legacySettings(raw: string | null): PlayerSettings | undefined {
  if (raw === null) return undefined;
  let input: unknown;
  try {
    input = JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;
  const record = input as Record<string, unknown>;
  if (envelopeKeys.some((key) => key in record)) return undefined;
  if (!settingKeys.some((key) => key in record)) return undefined;
  const parsed = settingsPatchSchema.safeParse(record);
  return parsed.success
    ? settingsSchema.parse({ ...defaultPlayerSettings, ...parsed.data })
    : undefined;
}

export function loadPlayerSettings(
  identity: IdentityScope,
  storage: StorageLike | undefined,
): SettingsLoadResult {
  const local = repository(storage);
  const loaded = local.load(identity);
  if (loaded.status === 'ok') {
    return {
      settings: loaded.envelope.payload,
      revision: loaded.envelope.revision,
      status: 'versioned',
    };
  }
  if (loaded.status === 'empty') {
    return { settings: { ...defaultPlayerSettings }, revision: 0, status: 'default' };
  }
  if (loaded.status === 'unavailable') {
    return { settings: { ...defaultPlayerSettings }, revision: 0, status: 'unavailable' };
  }

  let raw: string | null = null;
  try {
    raw = storage?.getItem(local.storageKey(identity)) ?? null;
  } catch {
    return { settings: { ...defaultPlayerSettings }, revision: 0, status: 'unavailable' };
  }
  const legacy = legacySettings(raw);
  if (!legacy) {
    return { settings: { ...defaultPlayerSettings }, revision: 0, status: 'corrupt' };
  }
  const migrated = local.save(identity, legacy, { replaceCorrupt: true });
  return migrated.ok
    ? {
        settings: migrated.envelope.payload,
        revision: migrated.envelope.revision,
        status: 'legacy-migrated',
      }
    : { settings: legacy, revision: 0, status: 'unavailable' };
}

export function updatePlayerSettings(
  identity: IdentityScope,
  patch: PlayerSettingsPatch,
  storage: StorageLike | undefined,
): { readonly ok: true; readonly settings: PlayerSettings } | { readonly ok: false } {
  const safePatch = settingsPatchSchema.parse(patch);
  const local = repository(storage);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const current = loadPlayerSettings(identity, storage);
    if (current.status === 'unavailable') return { ok: false };
    const settings = settingsSchema.parse({ ...current.settings, ...safePatch });
    const saved = local.save(identity, settings, {
      expectedRevision: current.revision,
      replaceCorrupt: current.status === 'corrupt',
    });
    if (saved.ok) return { ok: true, settings: saved.envelope.payload };
    if (saved.reason !== 'conflict') return { ok: false };
  }
  return { ok: false };
}
