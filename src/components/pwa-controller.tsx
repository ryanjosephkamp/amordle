'use client';

import { useEffect, useState } from 'react';

export function PwaController() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') {
      return;
    }
    let registration: ServiceWorkerRegistration | null = null;
    const register = async () => {
      registration = await navigator.serviceWorker.register('/sw.js');
      if (registration.waiting) setWaiting(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const worker = registration?.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            setWaiting(worker);
          }
        });
      });
    };
    const timer = window.setTimeout(() => void register(), 1_000);
    return () => {
      window.clearTimeout(timer);
      void registration;
    };
  }, []);

  if (!waiting) return null;
  return (
    <aside className="update-toast" aria-live="polite">
      <span>An Amordle update is ready.</span>
      <button
        type="button"
        onClick={() => {
          waiting.postMessage({ type: 'SKIP_WAITING' });
          window.location.reload();
        }}
      >
        Update now
      </button>
      <button type="button" onClick={() => setWaiting(null)}>
        Later
      </button>
    </aside>
  );
}
