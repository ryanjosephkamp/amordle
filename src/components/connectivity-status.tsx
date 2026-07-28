'use client';

import { useEffect, useRef, useState } from 'react';

export function ConnectivityStatus() {
  const [state, setState] = useState<'online' | 'offline' | 'reconnecting'>('online');
  const settleTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!navigator.onLine) queueMicrotask(() => setState('offline'));
    const clearSettle = () => {
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
      settleTimer.current = null;
    };
    const onOffline = () => {
      clearSettle();
      setState('offline');
    };
    const onOnline = () => {
      clearSettle();
      setState('reconnecting');
      settleTimer.current = window.setTimeout(() => setState('online'), 1_500);
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      clearSettle();
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  if (state === 'online') return null;
  return (
    <aside className={`connectivity-status is-${state}`} role="status" aria-live="polite">
      <strong>{state === 'offline' ? 'OFFLINE' : 'RECONNECTING'}</strong>
      <span>
        {state === 'offline'
          ? 'You’re offline. Some features aren’t available.'
          : 'Reconnecting… This may take a moment.'}
      </span>
    </aside>
  );
}
