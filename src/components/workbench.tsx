import type { PropsWithChildren, ReactNode } from 'react';

export function WorkbenchRegion({
  title,
  status,
  children,
  className = '',
  variant = 'open',
}: PropsWithChildren<{
  title: string;
  status?: ReactNode;
  className?: string;
  variant?: 'open' | 'pane';
}>) {
  const id = `region-${title.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`;
  return (
    <section className={`workbench-region is-${variant} ${className}`.trim()} aria-labelledby={id}>
      <header className="workbench-region-header">
        <h2 id={id}>{title}</h2>
        <span className="region-rule" aria-hidden="true" />
        {status && <div className="workbench-region-status">{status}</div>}
      </header>
      <div className="workbench-region-body">{children}</div>
    </section>
  );
}

/*
 * Lives here rather than beside AccountGate in route-states so that surfaces which only
 * need to say something went wrong do not pull the auth provider into their module
 * graph. route-states re-exports it, so existing imports are unaffected.
 */
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

export function SkeletonRows({
  label = 'Loading this view…',
  rows = 3,
}: {
  label?: string;
  rows?: number;
}) {
  return (
    <div className="skeleton-stack" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <span className="skeleton-row" aria-hidden="true" key={index}>
          <i />
          <i />
        </span>
      ))}
    </div>
  );
}
