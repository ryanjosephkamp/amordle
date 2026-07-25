import { z } from 'zod';
import {
  createVersionedLocalRepository,
  type IdentityScope,
  type StorageLike,
} from '../../persistence/local-repository';

export const NOTIFICATIONS_CHANGED_EVENT = 'amordle:notifications-changed';

const internalTargetSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine(
    (target) => target.startsWith('/') && !target.startsWith('//') && !target.includes('\\'),
    'Notification targets must be internal application paths.',
  );

const notificationSchema = z.object({
  id: z.string().trim().min(1).max(200),
  fingerprint: z.string().trim().min(1).max(240),
  kind: z.enum(['private-request', 'game-ready', 'result', 'economy', 'system']),
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(240),
  target: internalTargetSchema,
  createdAt: z.iso.datetime(),
});

const notificationStateSchema = z.object({
  events: z.array(notificationSchema).max(100),
  readIds: z.array(z.string().trim().min(1).max(200)).max(200),
  hiddenIds: z.array(z.string().trim().min(1).max(200)).max(200),
});

export type NotificationEvent = z.infer<typeof notificationSchema>;
export type NotificationState = z.infer<typeof notificationStateSchema>;

export const emptyNotificationState = (): NotificationState => ({
  events: [],
  readIds: [],
  hiddenIds: [],
});

export function notificationRepository(
  storage: StorageLike | undefined = typeof localStorage === 'undefined' ? undefined : localStorage,
) {
  return createVersionedLocalRepository<NotificationState>({
    schema: notificationStateSchema,
    storage: () => storage,
    keyPrefix: 'amordle:notifications',
  });
}

function announceChange(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}

function updateNotifications(
  identity: IdentityScope,
  transform: (state: NotificationState) => NotificationState,
  storage?: StorageLike,
): NotificationState | undefined {
  const repository = notificationRepository(storage);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const loaded = repository.load(identity);
    if (loaded.status === 'unavailable' || loaded.status === 'corrupt') return undefined;
    const current = loaded.status === 'ok' ? loaded.envelope.payload : emptyNotificationState();
    const next = notificationStateSchema.parse(transform(current));
    const saved = repository.save(identity, next, {
      expectedRevision: loaded.status === 'ok' ? loaded.envelope.revision : 0,
    });
    if (saved.ok) {
      announceChange();
      return saved.envelope.payload;
    }
    if (saved.reason !== 'conflict') return undefined;
  }
  return undefined;
}

export function readNotifications(
  identity: IdentityScope,
  storage?: StorageLike,
): NotificationState {
  const loaded = notificationRepository(storage).load(identity);
  return loaded.status === 'ok' ? loaded.envelope.payload : emptyNotificationState();
}

/**
 * Ingests only caller-supplied, source-derived projections. Duplicate source
 * fingerprints replace their prior projection and therefore cannot replay.
 */
export function ingestSourceNotifications(
  identity: IdentityScope,
  events: readonly NotificationEvent[],
  storage?: StorageLike,
): NotificationState | undefined {
  const safeEvents = z.array(notificationSchema).max(100).parse(events);
  return updateNotifications(
    identity,
    (current) => {
      const byFingerprint = new Map(
        current.events.map((event) => [event.fingerprint, event] as const),
      );
      for (const event of safeEvents) byFingerprint.set(event.fingerprint, event);
      const nextEvents = [...byFingerprint.values()]
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
        .slice(0, 100);
      const retainedIds = new Set(nextEvents.map((event) => event.id));
      return {
        events: nextEvents,
        readIds: current.readIds.filter((id) => retainedIds.has(id)),
        hiddenIds: current.hiddenIds.filter((id) => retainedIds.has(id)),
      };
    },
    storage,
  );
}

export function markNotificationRead(
  identity: IdentityScope,
  id: string,
  storage?: StorageLike,
): NotificationState | undefined {
  return updateNotifications(
    identity,
    (current) => ({
      ...current,
      readIds: [...new Set([...current.readIds, id])],
    }),
    storage,
  );
}

export function markAllNotificationsRead(
  identity: IdentityScope,
  storage?: StorageLike,
): NotificationState | undefined {
  return updateNotifications(
    identity,
    (current) => ({
      ...current,
      readIds: [...new Set([...current.readIds, ...current.events.map((event) => event.id)])],
    }),
    storage,
  );
}

export function hideNotification(
  identity: IdentityScope,
  id: string,
  storage?: StorageLike,
): NotificationState | undefined {
  return updateNotifications(
    identity,
    (current) => ({
      ...current,
      hiddenIds: [...new Set([...current.hiddenIds, id])],
    }),
    storage,
  );
}
