'use client';

import { useEffect, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';

const endTolerance = 12;

/**
 * The latest row is the child marked `data-history-latest`, or the end of the
 * history when nothing is marked. Solo marks its input row because empty
 * attempts follow it; scrolling to the end would hide the row being typed in.
 */
function latestRow(element: HTMLElement) {
  return element.querySelector<HTMLElement>('[data-history-latest]');
}

function latestScrollTop(element: HTMLElement) {
  const row = latestRow(element);
  if (!row) return element.scrollHeight;
  const below = row.getBoundingClientRect().bottom - element.getBoundingClientRect().bottom;
  return Math.max(0, element.scrollTop + below);
}

function showsLatest(element: HTMLElement) {
  const row = latestRow(element);
  if (!row) {
    return element.scrollHeight - element.clientHeight - element.scrollTop <= endTolerance;
  }
  const view = element.getBoundingClientRect();
  const bounds = row.getBoundingClientRect();
  return bounds.top >= view.top - endTolerance && bounds.bottom <= view.bottom + endTolerance;
}

export function GameHistoryViewport({
  children,
  followKey,
  label,
  className = '',
}: PropsWithChildren<{
  followKey: string | number;
  label: string;
  className?: string;
}>) {
  const viewport = useRef<HTMLDivElement>(null);
  const previousKey = useRef(followKey);
  const hasPositionedInitialHistory = useRef(false);
  const followsLatest = useRef(true);
  const [showLatest, setShowLatest] = useState(false);

  const moveToLatest = () => {
    const element = viewport.current;
    if (!element) return;
    element.scrollTop = latestScrollTop(element);
    followsLatest.current = true;
    setShowLatest(false);
  };

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;

    if (!hasPositionedInitialHistory.current) {
      hasPositionedInitialHistory.current = true;
      const overflows = element.scrollHeight - element.clientHeight > endTolerance;
      if (overflows) moveToLatest();
      else {
        element.scrollTop = 0;
        followsLatest.current = true;
        setShowLatest(false);
      }
      return;
    }

    if (previousKey.current !== followKey) {
      previousKey.current = followKey;
      if (followsLatest.current) moveToLatest();
      return;
    }
    moveToLatest();
  }, [followKey]);

  return (
    <div className={`game-history-shell ${className}`.trim()}>
      <div
        ref={viewport}
        className="game-history-viewport"
        tabIndex={0}
        aria-label={label}
        onScroll={(event) => {
          const atLatest = showsLatest(event.currentTarget);
          followsLatest.current = atLatest;
          setShowLatest(!atLatest);
        }}
      >
        {children}
      </div>
      {showLatest && (
        <button type="button" className="latest-row-button" onClick={moveToLatest}>
          Latest row
        </button>
      )}
    </div>
  );
}
