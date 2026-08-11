export type PlayerNotificationKind = 'request' | 'match' | 'turn' | 'result' | 'rematch';

/*
 * v8-B4. A board at a glance.
 *
 * `rows` holds one string per played row, one character per tile: `c` correct, `p`
 * present, `a` absent. It is deliberately evidence only, with no letters — the
 * snapshot exists to say "this is how the match is going" in the width of a menu, and
 * an unreadable row of tiny letters would say less than the colours do. It also means
 * a snapshot can never carry a word out of a surface that was not meant to show one.
 */
export interface NotificationBoardSnapshot {
  wordLength: number;
  rows: string[];
}

export interface PlayerNotification {
  id: string;
  accountNamespace: string;
  kind: PlayerNotificationKind;
  durableRevision: string;
  route: string;
  createdAt: string;
  read: boolean;
  /*
   * v8.1-C4. Cleared by the player, for THIS state of the notification.
   *
   * Dismissal is remembered against `durableRevision`, not against the game, so clearing
   * "your turn" hides it now and your opponent's next move raises a fresh one. Dismissing
   * a game permanently would let a player silence their own turn alerts with a button
   * pressed once for tidiness, and then lose on time to a game nobody told them about.
   */
  dismissed: boolean;
  /**
   * v8-B3. Who and what, so a row is legible without opening it. Optional because it
   * is derived from the live feed and never persisted — see `mergeNotifications`.
   */
  detail?: string;
  board?: NotificationBoardSnapshot;
}

export const notificationCategories = [
  { id: 'all', label: 'All' },
  { id: 'turn', label: 'Your turn' },
  { id: 'result', label: 'Results' },
  { id: 'request', label: 'Requests' },
  { id: 'rematch', label: 'Rematches' },
] as const;

export type NotificationCategory = (typeof notificationCategories)[number]['id'];

/**
 * v8-B3. `match` — a game that exists and is waiting on the opponent — has no filter
 * of its own. It belongs with the turn lane, because both answer the same question:
 * which games am I in right now.
 */
export function matchesCategory(
  notification: PlayerNotification,
  category: NotificationCategory,
): boolean {
  if (category === 'all') return true;
  if (category === 'turn') return notification.kind === 'turn' || notification.kind === 'match';
  return notification.kind === category;
}

export function countByCategory(
  notifications: readonly PlayerNotification[],
  category: NotificationCategory,
): number {
  return notifications.filter((item) => !item.read && matchesCategory(item, category)).length;
}

export function mergeNotifications(
  current: readonly PlayerNotification[],
  incoming: readonly PlayerNotification[],
): PlayerNotification[] {
  const currentByTransition = new Map<string, PlayerNotification>();
  const currentById = new Map<string, PlayerNotification>();
  for (const notification of current) {
    const key = `${notification.accountNamespace}:${notification.kind}:${notification.durableRevision}`;
    currentByTransition.set(key, notification);
    currentById.set(`${notification.accountNamespace}:${notification.id}`, notification);
  }

  const incomingByTransition = new Map<string, PlayerNotification>();
  for (const notification of incoming) {
    const key = `${notification.accountNamespace}:${notification.kind}:${notification.durableRevision}`;
    const previous = incomingByTransition.get(key);
    if (!previous || Date.parse(notification.createdAt) > Date.parse(previous.createdAt)) {
      incomingByTransition.set(key, notification);
    } else if (Date.parse(notification.createdAt) === Date.parse(previous.createdAt)) {
      incomingByTransition.set(key, {
        ...previous,
        read: previous.read || notification.read,
      });
    }
  }

  const merged = [...incomingByTransition.entries()].map(([transition, notification]) => {
    const previous =
      currentByTransition.get(transition) ??
      currentById.get(`${notification.accountNamespace}:${notification.id}`);
    if (!previous || previous.durableRevision !== notification.durableRevision) {
      return notification;
    }
    /*
     * v8-B3/B4. Take the live row and carry the read flag across, rather than
     * returning the stored one wholesale.
     *
     * The stored copy is metadata only — `detail` and `board` are stripped before
     * persisting, because a board snapshot per notification would grow the envelope
     * without bound and go stale the moment anyone moves. Returning the stored copy
     * for a read item, as this used to, therefore meant every read notification lost
     * its summary and its board on the next merge.
     */
    return { ...notification, read: previous.read, dismissed: previous.dismissed };
  });
  return merged.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** The subset that is worth persisting: identity, transition, and whether it was read. */
export function notificationMetadata(notification: PlayerNotification): PlayerNotification {
  return {
    id: notification.id,
    accountNamespace: notification.accountNamespace,
    kind: notification.kind,
    durableRevision: notification.durableRevision,
    route: notification.route,
    createdAt: notification.createdAt,
    read: notification.read,
    dismissed: notification.dismissed,
  };
}
