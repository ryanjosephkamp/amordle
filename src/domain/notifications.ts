export interface PlayerNotification {
  id: string;
  accountNamespace: string;
  kind: 'request' | 'match' | 'turn' | 'result' | 'rematch';
  durableRevision: string;
  route: string;
  createdAt: string;
  read: boolean;
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
    return previous.read ? previous : notification;
  });
  return merged.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
