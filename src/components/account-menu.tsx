'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from './providers';

const destinations = [
  { href: '/profile', label: 'Profile' },
  { href: '/stats', label: 'Stats' },
  { href: '/history', label: 'History' },
  { href: '/marketplace', label: 'Marketplace' },
  { href: '/settings', label: 'Settings' },
] as const;

export function AccountMenu() {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !panel.current?.contains(target) &&
        !button.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    panel.current?.querySelector<HTMLElement>('a,button')?.focus();
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (auth.status !== 'signed-in') {
    return (
      <div className="account-menu">
        <Link href="/auth">Sign in</Link>
      </div>
    );
  }

  return (
    <div className="account-menu">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="account-navigation"
        onClick={() => setOpen((value) => !value)}
      >
        Account
      </button>
      {open && (
        <div
          ref={panel}
          id="account-navigation"
          className="menu-popover account-popover"
          role="menu"
          aria-label="Account"
        >
          <div className="menu-heading" aria-hidden="true">
            ┌─ account ──────────────────────┐
          </div>
          {destinations.map((item) => (
            <Link href={item.href} key={item.href} role="menuitem" onClick={() => setOpen(false)}>
              <span aria-hidden="true">›</span> {item.label}
            </Link>
          ))}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void auth.signOut();
            }}
          >
            <span aria-hidden="true">›</span> Sign out
          </button>
          <div className="menu-footer" aria-hidden="true">
            └────────────────────────────────┘
          </div>
        </div>
      )}
    </div>
  );
}
