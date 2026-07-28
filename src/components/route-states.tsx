'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { PropsWithChildren, ReactNode } from 'react';
import { useAuth } from './providers';

export function RouteHeader({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <header className="route-header">
      <div className="route-title-line">
        <h1>{title}</h1>
        <span aria-hidden="true" />
      </div>
      {children}
    </header>
  );
}

export function WorkbenchRegion({
  title,
  status,
  children,
  className = '',
}: PropsWithChildren<{ title: string; status?: ReactNode; className?: string }>) {
  const id = `region-${title.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`;
  return (
    <section className={`workbench-region ${className}`.trim()} aria-labelledby={id}>
      <header className="workbench-region-header">
        <h2 id={id}>{title}</h2>
        {status && <div className="workbench-region-status">{status}</div>}
      </header>
      <div className="workbench-region-body">{children}</div>
    </section>
  );
}

export function StatusPanel({
  title,
  children,
  action,
}: PropsWithChildren<{ title: string; action?: ReactNode }>) {
  return (
    <WorkbenchRegion title={title} className="status-panel" status="STATUS">
      <div className="prose">{children}</div>
      {action && <div className="action-row">{action}</div>}
    </WorkbenchRegion>
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
