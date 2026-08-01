'use client';

import { useEffect, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';

const endTolerance = 12;

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
    element.scrollTop = element.scrollHeight;
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
          const element = event.currentTarget;
          const atEnd =
            element.scrollHeight - element.clientHeight - element.scrollTop <= endTolerance;
          followsLatest.current = atEnd;
          setShowLatest(!atEnd);
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
