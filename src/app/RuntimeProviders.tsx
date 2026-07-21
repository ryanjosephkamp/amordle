import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { AuthProvider } from './AuthContext';
import { PlayerStateProvider } from './PlayerStateProvider';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error) => {
        if (error instanceof Response && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: { retry: false },
  },
});

function ConnectivityAndUpdateStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError: () => {
      // Startup remains available when service-worker registration is blocked.
    },
  });

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (online && !needRefresh && !offlineReady) return null;

  return (
    <aside className="runtime-status" aria-live="polite" aria-label="Application status">
      {!online ? <p>Offline · saved Solo Practice remains available on this device.</p> : null}
      {offlineReady ? (
        <p>
          Offline shell ready.
          <button type="button" onClick={() => setOfflineReady(false)}>
            Dismiss
          </button>
        </p>
      ) : null}
      {needRefresh ? (
        <p>
          An Amordle update is ready.
          <button type="button" onClick={() => void updateServiceWorker(true)}>
            Update now
          </button>
          <button type="button" onClick={() => setNeedRefresh(false)}>
            Later
          </button>
        </p>
      ) : null}
    </aside>
  );
}

export function RuntimeProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PlayerStateProvider>
          {children}
          <ConnectivityAndUpdateStatus />
        </PlayerStateProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
