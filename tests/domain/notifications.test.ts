import { describe, expect, it } from 'vitest';
import { createMemoryStorage, type IdentityScope } from '../../src/persistence/local-repository';
import {
  hideNotification,
  ingestSourceNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  readNotifications,
} from '../../src/features/supporting/notification-repository';

const guest: IdentityScope = { kind: 'guest' };
const account: IdentityScope = { kind: 'authenticated', userId: 'account-a' };
const first = {
  id: 'request-1',
  fingerprint: 'private-request:request-1:pending',
  kind: 'private-request' as const,
  title: 'Private Practice request',
  body: 'A public player invited you to a Practice match.',
  target: '/combat/lobby?request=request-1',
  createdAt: '2026-07-22T12:00:00.000Z',
};

describe('identity-scoped notification projections', () => {
  it('deduplicates unchanged source events and keeps identities isolated', () => {
    const storage = createMemoryStorage();
    ingestSourceNotifications(guest, [first], storage);
    ingestSourceNotifications(guest, [first], storage);

    expect(readNotifications(guest, storage).events).toEqual([first]);
    expect(readNotifications(account, storage).events).toEqual([]);
  });

  it('keeps read, mark-all, and hide actions distinct', () => {
    const storage = createMemoryStorage();
    const second = {
      ...first,
      id: 'game-2',
      fingerprint: 'game-ready:game-2',
      kind: 'game-ready' as const,
      title: 'Game ready',
      target: '/combat/match/game-2',
      createdAt: '2026-07-22T12:01:00.000Z',
    };
    ingestSourceNotifications(guest, [first, second], storage);
    markNotificationRead(guest, first.id, storage);
    expect(readNotifications(guest, storage)).toMatchObject({
      readIds: [first.id],
      hiddenIds: [],
    });
    hideNotification(guest, first.id, storage);
    expect(readNotifications(guest, storage).hiddenIds).toEqual([first.id]);
    markAllNotificationsRead(guest, storage);
    expect(new Set(readNotifications(guest, storage).readIds)).toEqual(
      new Set([first.id, second.id]),
    );
  });

  it('rejects external notification targets', () => {
    const storage = createMemoryStorage();
    expect(() =>
      ingestSourceNotifications(guest, [{ ...first, target: 'https://example.test' }], storage),
    ).toThrow(/internal application paths/i);
  });
});
