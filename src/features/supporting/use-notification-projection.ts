import { useCallback, useEffect, useMemo, useState } from 'react';
import type { IdentityScope } from '../../persistence/local-repository';
import {
  hideNotification,
  markAllNotificationsRead,
  markNotificationRead,
  NOTIFICATIONS_CHANGED_EVENT,
  readNotifications,
} from './notification-repository';

export function useNotificationProjection(identity: IdentityScope, ready: boolean) {
  const owner = identity.kind === 'guest' ? 'guest' : `account:${identity.userId}`;
  const [stateByOwner, setStateByOwner] = useState(() => ({
    owner,
    state: readNotifications(identity),
  }));
  const refresh = useCallback(() => {
    setStateByOwner({
      owner,
      state: ready ? readNotifications(identity) : { events: [], readIds: [], hiddenIds: [] },
    });
  }, [identity, owner, ready]);

  useEffect(() => {
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [refresh]);

  const state =
    stateByOwner.owner === owner
      ? stateByOwner.state
      : ready
        ? readNotifications(identity)
        : { events: [], readIds: [], hiddenIds: [] };

  const hidden = useMemo(() => new Set(state.hiddenIds), [state.hiddenIds]);
  const read = useMemo(() => new Set(state.readIds), [state.readIds]);
  const visible = useMemo(
    () => state.events.filter((event) => !hidden.has(event.id)),
    [hidden, state.events],
  );
  const unreadCount = visible.filter((event) => !read.has(event.id)).length;

  return {
    visible,
    read,
    unreadCount,
    markRead(id: string) {
      markNotificationRead(identity, id);
    },
    markAllRead() {
      markAllNotificationsRead(identity);
    },
    hide(id: string) {
      hideNotification(identity, id);
    },
  };
}
