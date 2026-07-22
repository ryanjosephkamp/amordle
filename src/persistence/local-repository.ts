import { z } from 'zod';

export const LOCAL_STATE_SCHEMA_VERSION = 1;

export type IdentityScope =
  { readonly kind: 'guest' } | { readonly kind: 'authenticated'; readonly userId: string };

export interface StorageLike {
  readonly length: number;
  clear(): void;
  getItem(key: string): string | null;
  key(index: number): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

export interface VersionedEnvelope<T> {
  readonly schemaVersion: number;
  readonly owner: IdentityScope;
  readonly revision: number;
  readonly updatedAt: string;
  readonly payload: T;
}

export type LoadResult<T> =
  | { readonly status: 'empty' }
  | { readonly status: 'ok'; readonly envelope: VersionedEnvelope<T>; readonly migrated: boolean }
  | {
      readonly status: 'corrupt';
      readonly reason:
        | 'invalid_json'
        | 'invalid_envelope'
        | 'owner_mismatch'
        | 'missing_migration'
        | 'invalid_payload';
    }
  | { readonly status: 'unavailable'; readonly error: unknown };

export type SaveResult<T> =
  | { readonly ok: true; readonly envelope: VersionedEnvelope<T> }
  | {
      readonly ok: false;
      readonly reason: 'conflict' | 'corrupt' | 'unavailable';
      readonly currentRevision?: number;
    };

export interface VersionedLocalRepository<T> {
  load(scope: IdentityScope): LoadResult<T>;
  save(
    scope: IdentityScope,
    payload: T,
    options?: {
      readonly expectedRevision?: number;
      readonly updatedAt?: string;
      readonly replaceCorrupt?: boolean;
    },
  ): SaveResult<T>;
  clear(scope: IdentityScope, expectedRevision?: number): boolean;
  storageKey(scope: IdentityScope): string;
}

const identityScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('guest') }),
  z.object({ kind: z.literal('authenticated'), userId: z.string().trim().min(1).max(200) }),
]);

const envelopeBaseSchema = z.object({
  schemaVersion: z.number().int().nonnegative(),
  owner: identityScopeSchema,
  revision: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime(),
  payload: z.unknown(),
});

function assertScope(scope: IdentityScope): IdentityScope {
  return identityScopeSchema.parse(scope) as IdentityScope;
}

export function sameIdentityScope(left: IdentityScope, right: IdentityScope): boolean {
  return (
    left.kind === right.kind &&
    (left.kind === 'guest' || (right.kind === 'authenticated' && left.userId === right.userId))
  );
}

export function ownerStorageSegment(scope: IdentityScope): string {
  const safe = assertScope(scope);
  return safe.kind === 'guest' ? 'guest' : `account:${encodeURIComponent(safe.userId)}`;
}

export interface LocalRepositoryOptions<T> {
  readonly schema: z.ZodType<T>;
  readonly storage: StorageLike | (() => StorageLike | undefined);
  readonly keyPrefix?: string;
  readonly currentSchemaVersion?: number;
  readonly migrations?: Readonly<Record<number, (payload: unknown) => unknown>>;
}

export function createVersionedLocalRepository<T>(
  options: LocalRepositoryOptions<T>,
): VersionedLocalRepository<T> {
  const currentSchemaVersion = options.currentSchemaVersion ?? LOCAL_STATE_SCHEMA_VERSION;
  const keyPrefix = options.keyPrefix ?? 'amordle:local-state';
  const getStorage = (): StorageLike | undefined =>
    typeof options.storage === 'function' ? options.storage() : options.storage;
  const storageKey = (scope: IdentityScope): string => `${keyPrefix}:${ownerStorageSegment(scope)}`;

  const load = (scope: IdentityScope): LoadResult<T> => {
    const safeScope = assertScope(scope);
    let raw: string | null;
    try {
      const storage = getStorage();
      if (!storage) return { status: 'unavailable', error: new Error('Storage is unavailable.') };
      raw = storage.getItem(storageKey(safeScope));
    } catch (error) {
      return { status: 'unavailable', error };
    }
    if (raw === null) return { status: 'empty' };
    let input: unknown;
    try {
      input = JSON.parse(raw) as unknown;
    } catch {
      return { status: 'corrupt', reason: 'invalid_json' };
    }
    const base = envelopeBaseSchema.safeParse(input);
    if (!base.success || base.data.schemaVersion > currentSchemaVersion) {
      return { status: 'corrupt', reason: 'invalid_envelope' };
    }
    if (!sameIdentityScope(base.data.owner as IdentityScope, safeScope)) {
      return { status: 'corrupt', reason: 'owner_mismatch' };
    }

    let payload = base.data.payload;
    let version = base.data.schemaVersion;
    const migrated = version !== currentSchemaVersion;
    while (version < currentSchemaVersion) {
      const migration = options.migrations?.[version];
      if (!migration) return { status: 'corrupt', reason: 'missing_migration' };
      try {
        payload = migration(payload);
      } catch {
        return { status: 'corrupt', reason: 'invalid_payload' };
      }
      version += 1;
    }
    const parsedPayload = options.schema.safeParse(payload);
    if (!parsedPayload.success) return { status: 'corrupt', reason: 'invalid_payload' };
    return {
      status: 'ok',
      migrated,
      envelope: {
        schemaVersion: currentSchemaVersion,
        owner: safeScope,
        revision: base.data.revision,
        updatedAt: base.data.updatedAt,
        payload: parsedPayload.data,
      },
    };
  };

  return {
    load,
    save(scope, payload, saveOptions = {}) {
      const safeScope = assertScope(scope);
      const parsedPayload = options.schema.parse(payload);
      const current = load(safeScope);
      if (current.status === 'unavailable') return { ok: false, reason: 'unavailable' };
      if (current.status === 'corrupt' && !saveOptions.replaceCorrupt)
        return { ok: false, reason: 'corrupt' };
      const currentRevision = current.status === 'ok' ? current.envelope.revision : 0;
      if (
        saveOptions.expectedRevision !== undefined &&
        saveOptions.expectedRevision !== currentRevision
      ) {
        return { ok: false, reason: 'conflict', currentRevision };
      }
      const updatedAt = saveOptions.updatedAt ?? new Date().toISOString();
      if (Number.isNaN(Date.parse(updatedAt)))
        throw new RangeError('A valid update timestamp is required.');
      const envelope: VersionedEnvelope<T> = {
        schemaVersion: currentSchemaVersion,
        owner: safeScope,
        revision: currentRevision + 1,
        updatedAt: new Date(updatedAt).toISOString(),
        payload: parsedPayload,
      };
      try {
        const storage = getStorage();
        if (!storage) return { ok: false, reason: 'unavailable' };
        storage.setItem(storageKey(safeScope), JSON.stringify(envelope));
      } catch {
        return { ok: false, reason: 'unavailable' };
      }
      return { ok: true, envelope };
    },
    clear(scope, expectedRevision) {
      const safeScope = assertScope(scope);
      const current = load(safeScope);
      if (expectedRevision !== undefined) {
        const revision = current.status === 'ok' ? current.envelope.revision : 0;
        if (revision !== expectedRevision) return false;
      }
      try {
        getStorage()?.removeItem(storageKey(safeScope));
        return true;
      } catch {
        return false;
      }
    },
    storageKey,
  };
}

export function chooseAuthoritativeEnvelope<T>(input: {
  readonly local?: VersionedEnvelope<T>;
  readonly cloud?: VersionedEnvelope<T>;
  readonly nowMs?: number;
  readonly maxFutureSkewMs?: number;
}): VersionedEnvelope<T> | undefined {
  const { local, cloud } = input;
  if (!local) return cloud;
  if (!cloud) return local;
  if (!sameIdentityScope(local.owner, cloud.owner)) {
    throw new RangeError('Cannot reconcile envelopes from different owners.');
  }
  const nowMs = input.nowMs ?? Date.now();
  const maxFutureSkewMs = input.maxFutureSkewMs ?? 5 * 60_000;
  const localTime = Date.parse(local.updatedAt);
  const cloudTime = Date.parse(cloud.updatedAt);
  if (localTime > nowMs + maxFutureSkewMs) return cloud;
  if (cloudTime > nowMs + maxFutureSkewMs) return local;
  if (localTime !== cloudTime) return localTime > cloudTime ? local : cloud;
  if (local.revision !== cloud.revision) return local.revision > cloud.revision ? local : cloud;
  return cloud;
}

export function createMemoryStorage(initial: Readonly<Record<string, string>> = {}): StorageLike {
  const values = new Map(Object.entries(initial));
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}
