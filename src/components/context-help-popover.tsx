'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';

export function ContextHelpPopover({ children, label }: PropsWithChildren<{ label: string }>) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="context-help" ref={root}>
      <button
        ref={trigger}
        type="button"
        className="context-help-trigger"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">?</span> {label}
      </button>
      {open && (
        <div id={id} className="context-help-panel" role="note">
          {children}
        </div>
      )}
    </div>
  );
}
