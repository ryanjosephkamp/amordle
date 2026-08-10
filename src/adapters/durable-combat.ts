'use client';

import { deleteEnvelope, readEnvelopeDiagnostic, writeEnvelope } from '@/adapters/indexeddb';
import {
  readRankedPracticeQueueIntent,
  rankedPracticeQueueIntentSchema,
  removeRankedPracticeQueueIntent,
} from '@/adapters/session-combat';
import type {
  RankedPracticeQueueIntent,
  RankedPracticeQueueIntentRead,
} from '@/adapters/session-combat';

/*
 * v8-B1. The ranked search intent, moved off per-tab session storage.
 *
 * Session storage is scoped to one tab and, on some engines, to one navigation
 * lineage. That made a ranked search a property of the page you happened to be
 * looking at: navigate away and the search became unreachable, even though the
 * server-side queue row was still alive and still counting against the five-request
 * cap. Opening a second tab could not see it either.
 *
 * The envelope store is the account-scoped durable surface the rest of the app
 * already uses, and it is keyed on `account:<userId>`, which means
 * `clearDeletedAccountLocalState` wipes this for free along with everything else in
 * that namespace.
 *
 * Reads promote any surviving session-storage intent exactly once, so a player who
 * had a live search when this shipped keeps it instead of being stranded with a
 * server row they can no longer reach or cancel.
 */

const DOMAIN = 'combat:ranked-practice-queue:v2';

function namespaceFor(userId: string): string {
  return `account:${userId}`;
}

export async function readRankedQueueIntent(
  userId: string,
): Promise<RankedPracticeQueueIntentRead> {
  let durable: RankedPracticeQueueIntentRead;
  try {
    const envelope = await readEnvelopeDiagnostic(
      namespaceFor(userId),
      DOMAIN,
      rankedPracticeQueueIntentSchema,
    );
    durable =
      envelope.status === 'valid'
        ? envelope.envelope.state.ownerUserId === userId
          ? { status: 'valid', intent: envelope.envelope.state }
          : { status: 'corrupt' }
        : envelope;
  } catch {
    // A blocked or unavailable IndexedDB must not strand the legacy promotion below,
    // and must never be reported as a live search the player cannot actually reach.
    durable = { status: 'missing' };
  }
  if (durable.status === 'valid') return durable;
  if (durable.status === 'corrupt') {
    // Report it once, but discard it, or every later read repeats the warning against
    // a record that can never become readable.
    await deleteEnvelope(namespaceFor(userId), DOMAIN).catch(() => undefined);
  }

  const legacy = readRankedPracticeQueueIntent(userId);
  if (legacy.status !== 'valid') {
    return durable.status === 'corrupt' ? durable : legacy;
  }
  await writeRankedQueueIntent(legacy.intent);
  removeRankedPracticeQueueIntent(userId);
  return legacy;
}

export async function writeRankedQueueIntent(intent: RankedPracticeQueueIntent): Promise<void> {
  const parsed = rankedPracticeQueueIntentSchema.parse(intent);
  await writeEnvelope({
    schemaVersion: 1,
    ownerNamespace: namespaceFor(parsed.ownerUserId),
    domain: DOMAIN,
    revision: 1,
    updatedAt: new Date().toISOString(),
    state: parsed,
  });
}

export async function removeRankedQueueIntent(userId: string): Promise<void> {
  try {
    removeRankedPracticeQueueIntent(userId);
  } catch {
    // A disabled session storage has nothing left to drain.
  }
  await deleteEnvelope(namespaceFor(userId), DOMAIN);
}
