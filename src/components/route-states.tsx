'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { PropsWithChildren, ReactNode } from 'react';
import { useAuth } from './providers';

export function RouteHeader({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <header className="route-header">
      <h1>{title}</h1>
      {children}
    </header>
  );
}

export function StatusPanel({
  title,
  children,
  action,
}: PropsWithChildren<{ title: string; action?: ReactNode }>) {
  return (
    <section className="status-panel" aria-labelledby={`status-${title.replaceAll(' ', '-')}`}>
      <h2 id={`status-${title.replaceAll(' ', '-')}`}>{title}</h2>
      <div className="prose">{children}</div>
      {action && <div className="action-row">{action}</div>}
    </section>
  );
}

export function AccountGate({ children }: PropsWithChildren) {
  const auth = useAuth();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);
  if (!mounted || auth.status === 'loading') {
    return (
      <StatusPanel title="Restoring your account">
        <p aria-live="polite">Checking your saved session…</p>
      </StatusPanel>
    );
  }
  if (auth.status === 'unavailable') {
    return (
      <StatusPanel title="Account service unavailable">
        <p>{auth.message}</p>
      </StatusPanel>
    );
  }
  if (auth.status === 'error') {
    return (
      <StatusPanel
        title="Account restore needs attention"
        action={<button onClick={() => void auth.retry()}>Try again</button>}
      >
        <p>{auth.message}</p>
      </StatusPanel>
    );
  }
  if (auth.status !== 'signed-in') {
    return (
      <StatusPanel
        title="Sign in required"
        action={
          <Link className="button primary" href="/auth">
            Sign in
          </Link>
        }
      >
        <p>Your guest games remain separate and will still be here when you return.</p>
      </StatusPanel>
    );
  }
  return children;
}
