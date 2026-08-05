'use client';

import { useEffect } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

/**
 * One dismissal policy for every true modal dialog (ANNOT-08).
 *
 * A click on a modal `<dialog>`'s backdrop is reported with the dialog itself as the
 * event target, so `target === currentTarget` is the usual signal. That alone is
 * imprecise once a dialog has padding — a click inside the box but outside its content
 * would also match — so the pointer position is checked against the dialog's own box.
 *
 * Keyboard-synthesized clicks (`detail === 0`, from Enter on an inner control) never
 * count as an outside click.
 */
export function isOutsideDialogClick(event: ReactMouseEvent<HTMLDialogElement>): boolean {
  if (event.target !== event.currentTarget) return false;
  if (event.detail === 0) return false;
  const rect = event.currentTarget.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  return (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  );
}

/**
 * Closes a dialog on an outside click unless an operation is in flight.
 *
 * A submitted email change, password change, or danger-zone action must never be lost
 * to a stray click, which is the same reason `onCancel` already blocks Escape while
 * pending (APP-09.d, ACC-05.c).
 */
export function dismissOnBackdrop(
  event: ReactMouseEvent<HTMLDialogElement>,
  options: { pending?: boolean } = {},
): void {
  if (options.pending) return;
  if (!isOutsideDialogClick(event)) return;
  event.currentTarget.close();
}

let scrollLockCount = 0;
let restoreOverflow = '';

/**
 * Browsers do not lock background scrolling for `dialog:modal`, so the page behind an
 * open dialog stays scrollable. Reference counted, because more than one modal surface
 * can be mounted at a time.
 */
export function useModalScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;
    if (scrollLockCount === 0) {
      restoreOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    scrollLockCount += 1;
    return () => {
      scrollLockCount -= 1;
      if (scrollLockCount === 0) document.body.style.overflow = restoreOverflow;
    };
  }, [locked]);
}
