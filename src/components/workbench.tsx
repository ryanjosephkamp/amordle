import type { PropsWithChildren, ReactNode } from 'react';

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
