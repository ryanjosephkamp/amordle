'use client';

import { z } from 'zod';

export interface VersionedEnvelope<T> {
  schemaVersion: number;
  ownerNamespace: string;
  domain: string;
  revision: number;
  updatedAt: string;
  state: T;
}

export type EnvelopeReadResult<T> =
  | { status: 'missing' }
  | { status: 'corrupt' }
  | { status: 'valid'; envelope: VersionedEnvelope<T> };

const baseEnvelopeSchema = z
  .object({
    schemaVersion: z.number().int().positive(),
    ownerNamespace: z.string().min(1),
    domain: z.string().min(1),
    revision: z.number().int().nonnegative(),
    updatedAt: z.iso.datetime({ offset: true }),
    state: z.unknown(),
  })
  .strict();

const DATABASE_NAME = 'amordle';
const STORE_NAME = 'domains';
const DATABASE_VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onerror = () => reject(request.error ?? new Error('IndexedDB failed.'));
    request.onsuccess = () => resolve(request.result);
  });
}

function key(ownerNamespace: string, domain: string): string {
  return `${ownerNamespace}\0${domain}`;
}

export async function readEnvelope<T>(
  ownerNamespace: string,
  domain: string,
  stateSchema: z.ZodType<T>,
): Promise<VersionedEnvelope<T> | null> {
  const result = await readEnvelopeDiagnostic(ownerNamespace, domain, stateSchema);
  return result.status === 'valid' ? result.envelope : null;
}

export async function readEnvelopeDiagnostic<T>(
  ownerNamespace: string,
  domain: string,
  stateSchema: z.ZodType<T>,
): Promise<EnvelopeReadResult<T>> {
  const database = await openDatabase();
  try {
    const value = await new Promise<unknown>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(key(ownerNamespace, domain));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Read failed.'));
    });
    if (value === undefined) return { status: 'missing' };
    const envelope = baseEnvelopeSchema.safeParse(value);
    if (!envelope.success) return { status: 'corrupt' };
    if (envelope.data.ownerNamespace !== ownerNamespace || envelope.data.domain !== domain) {
      return { status: 'corrupt' };
    }
    const state = stateSchema.safeParse(envelope.data.state);
    if (!state.success) return { status: 'corrupt' };
    return {
      status: 'valid',
      envelope: { ...envelope.data, state: state.data },
    };
  } finally {
    database.close();
  }
}

export async function writeEnvelope<T>(envelope: VersionedEnvelope<T>): Promise<void> {
  const parsed = baseEnvelopeSchema.parse(envelope);
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(parsed, key(parsed.ownerNamespace, parsed.domain));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Write failed.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Write was cancelled.'));
    });
  } finally {
    database.close();
  }
}

/**
 * Atomically reads, validates, transforms, and writes one domain envelope.
 *
 * Keeping the read and write in one IndexedDB transaction prevents a stale
 * guest tab from restoring an older economy or settings snapshot over a newer
 * accepted operation.
 */
export async function mutateEnvelope<T>(
  ownerNamespace: string,
  domain: string,
  stateSchema: z.ZodType<T>,
  initialState: T,
  transform: (state: T) => T,
): Promise<VersionedEnvelope<T>> {
  const database = await openDatabase();
  try {
    return await new Promise<VersionedEnvelope<T>>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key(ownerNamespace, domain));
      let nextEnvelope: VersionedEnvelope<T> | null = null;

      request.onerror = () => reject(request.error ?? new Error('Read failed.'));
      request.onsuccess = () => {
        const parsedEnvelope = baseEnvelopeSchema.safeParse(request.result);
        const parsedState = parsedEnvelope.success
          ? stateSchema.safeParse(parsedEnvelope.data.state)
          : null;
        const currentState = parsedState?.success ? parsedState.data : initialState;
        const currentRevision =
          parsedEnvelope.success &&
          parsedEnvelope.data.ownerNamespace === ownerNamespace &&
          parsedEnvelope.data.domain === domain
            ? parsedEnvelope.data.revision
            : 0;
        const nextState = stateSchema.parse(transform(currentState));
        nextEnvelope = {
          schemaVersion: 1,
          ownerNamespace,
          domain,
          revision: currentRevision + 1,
          updatedAt: new Date().toISOString(),
          state: nextState,
        };
        store.put(baseEnvelopeSchema.parse(nextEnvelope), key(ownerNamespace, domain));
      };
      transaction.oncomplete = () => {
        if (nextEnvelope) resolve(nextEnvelope);
        else reject(new Error('Mutation did not produce an envelope.'));
      };
      transaction.onerror = () => reject(transaction.error ?? new Error('Mutation failed.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Mutation was cancelled.'));
    });
  } finally {
    database.close();
  }
}

export async function deleteEnvelope(ownerNamespace: string, domain: string): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(key(ownerNamespace, domain));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Delete failed.'));
    });
  } finally {
    database.close();
  }
}
