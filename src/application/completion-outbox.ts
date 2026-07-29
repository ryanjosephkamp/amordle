'use client';

import { z } from 'zod';
import {
  deleteEnvelope,
  mutateEnvelope,
  readEnvelopeDiagnostic,
  writeEnvelope,
} from '@/adapters/indexeddb';
import { finalizeAccountHistoryRow } from '@/adapters/supabase/account';
import { historyRowSchema } from '@/domain/account-continuity';
import type { AccountHistoryRow } from '@/domain/account-continuity';

const completionRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    row: historyRowSchema,
    queuedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

const completionOutboxSchema = z.array(completionRecordSchema);
const domain = 'completion-outbox:v1';
const inflight = new Map<string, Promise<ReconciliationResult>>();

export interface ReconciliationResult {
  synced: number;
  pending: number;
  failed: number;
}

function namespace(userId: string): string {
  return `account:${userId}`;
}

export async function queueAccountCompletion(row: AccountHistoryRow): Promise<void> {
  const parsed = historyRowSchema.parse(row);
  const existing = await readEnvelopeDiagnostic(
    namespace(parsed.user_id),
    domain,
    completionOutboxSchema,
  );
  if (existing.status === 'corrupt') {
    throw new Error('Saved result synchronization data is corrupt and needs recovery.');
  }
  await mutateEnvelope(namespace(parsed.user_id), domain, completionOutboxSchema, [], (current) => {
    const withoutCurrent = current.filter((record) => record.row.id !== parsed.id);
    return [
      ...withoutCurrent,
      {
        schemaVersion: 1 as const,
        row: parsed,
        queuedAt: new Date().toISOString(),
      },
    ].sort((left, right) => left.queuedAt.localeCompare(right.queuedAt));
  });
}

export async function loadPendingCompletions(userId: string): Promise<AccountHistoryRow[]> {
  const result = await readEnvelopeDiagnostic(namespace(userId), domain, completionOutboxSchema);
  if (result.status === 'missing') return [];
  if (result.status === 'corrupt') {
    throw new Error('Saved result synchronization data is corrupt and needs recovery.');
  }
  return result.envelope.state
    .filter((record) => record.row.user_id === userId)
    .map((record) => record.row);
}

export async function resetCompletionOutbox(userId: string): Promise<void> {
  await deleteEnvelope(namespace(userId), domain);
}

export async function reconcileCompletionOutbox(userId: string): Promise<ReconciliationResult> {
  const existing = inflight.get(userId);
  if (existing) return existing;
  const task = reconcile(userId).finally(() => inflight.delete(userId));
  inflight.set(userId, task);
  return task;
}

async function reconcile(userId: string): Promise<ReconciliationResult> {
  const ownerNamespace = namespace(userId);
  const result = await readEnvelopeDiagnostic(ownerNamespace, domain, completionOutboxSchema);
  if (result.status === 'missing') return { synced: 0, pending: 0, failed: 0 };
  if (result.status === 'corrupt') {
    throw new Error('Saved result synchronization data is corrupt and needs recovery.');
  }
  const envelope = result.envelope;

  const remaining: typeof envelope.state = [];
  let synced = 0;
  let failed = 0;
  for (const record of envelope.state) {
    if (record.row.user_id !== userId) {
      remaining.push(record);
      failed += 1;
      continue;
    }
    try {
      await finalizeAccountHistoryRow(record.row);
      synced += 1;
    } catch {
      remaining.push(record);
      failed += 1;
    }
  }

  if (remaining.length !== envelope.state.length) {
    await writeEnvelope({
      schemaVersion: 1,
      ownerNamespace,
      domain,
      revision: envelope.revision + 1,
      updatedAt: new Date().toISOString(),
      state: remaining,
    });
  }
  return { synced, pending: remaining.length, failed };
}
