'use client';

import { useEffect, useRef, useState } from 'react';

/*
 * One copy affordance.
 *
 * There were four call sites writing to the clipboard directly and only one of
 * them — the route error page — did it properly: it guarded `navigator.clipboard`
 * for the contexts where it is undefined, and it told you whether the copy
 * worked. The other three fired and forgot, so on a browser without clipboard
 * access the button did nothing at all and said nothing about it.
 *
 * That last part matters more than it sounds. A copy button that silently fails
 * is worse than no button: the reader believes they have the link.
 *
 * The confirmation clears itself after a few seconds so the control returns to
 * its resting label rather than claiming COPIED forever.
 */
export function CopyButton({
  value,
  label,
  copiedLabel = 'COPIED',
  failedLabel = 'COPY FAILED',
  className,
}: {
  /*
   * A function when the text depends on something that only exists in the
   * browser — an absolute URL needs `location.origin`, and computing that during
   * render would either mismatch hydration or ship the server's idea of the
   * origin. Resolved on click, where the browser is definitely present.
   */
  value: string | (() => string);
  label: string;
  copiedLabel?: string;
  failedLabel?: string;
  className?: string;
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const settle = (next: 'copied' | 'failed') => {
    setState(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 4000);
  };

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        const clipboard = navigator.clipboard;
        if (!clipboard) {
          settle('failed');
          return;
        }
        void clipboard
          .writeText(typeof value === 'function' ? value() : value)
          .then(() => settle('copied'))
          .catch(() => settle('failed'));
      }}
    >
      {state === 'copied' ? copiedLabel : state === 'failed' ? failedLabel : label}
      {/*
       * The label change is the visible feedback; this is the same news for a
       * screen reader, which would otherwise hear nothing because the button
       * keeps focus and its accessible name changing is not announced.
       */}
      <span role="status" aria-live="polite" className="sr-only">
        {state === 'copied' ? 'Copied.' : state === 'failed' ? 'Copy failed.' : ''}
      </span>
    </button>
  );
}
