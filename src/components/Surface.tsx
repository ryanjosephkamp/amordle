import type { ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
}

export function SectionHeading({ title, meta }: { title: string; meta?: ReactNode }) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      {meta ? <span>{meta}</span> : null}
    </div>
  );
}

export function StatusDot({
  tone = 'green',
  children,
}: {
  tone?: 'green' | 'amber' | 'red' | 'muted' | 'ice';
  children: ReactNode;
}) {
  return (
    <span className={`status-dot status-dot--${tone}`}>
      <span aria-hidden="true" />
      {children}
    </span>
  );
}

export function Metric({
  value,
  label,
  tone,
}: {
  value: ReactNode;
  label: string;
  tone?: 'green' | 'amber' | 'red' | 'ice';
}) {
  return (
    <div className={`metric ${tone ? `metric--${tone}` : ''}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

export function RuledList({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="ruled-list" role={label ? 'list' : undefined} aria-label={label}>
      {children}
    </div>
  );
}
