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
  const byTransition = new Map<string, PlayerNotification>();
  for (const notification of [...current, ...incoming]) {
    const key = `${notification.accountNamespace}:${notification.kind}:${notification.durableRevision}`;
    const previous = byTransition.get(key);
    if (!previous || Date.parse(notification.createdAt) > Date.parse(previous.createdAt)) {
      byTransition.set(key, notification);
    } else if (Date.parse(notification.createdAt) === Date.parse(previous.createdAt)) {
      byTransition.set(key, {
        ...previous,
        read: previous.read || notification.read,
      });
    }
  }
  return [...byTransition.values()].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}
