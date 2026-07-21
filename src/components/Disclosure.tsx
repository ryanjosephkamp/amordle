import type { ReactNode } from 'react';

export function Disclosure({
  label,
  meta,
  children,
  open = false,
}: {
  label: string;
  meta?: string;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details className="disclosure" open={open}>
      <summary>
        <span>{label}</span>
        {meta ? <small>{meta}</small> : null}
        <span aria-hidden="true">⌄</span>
      </summary>
      <div className="disclosure__body">{children}</div>
    </details>
  );
}
