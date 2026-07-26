import { useEffect, useRef } from 'react';

export type RankedSearchPhase =
  | 'idle'
  | 'creating'
  | 'queued'
  | 'claiming'
  | 'matched'
  | 'finalizing'
  | 'cancelling'
  | 'expired'
  | 'failed';

interface RankedQueueLike {
  readonly status: 'queued' | 'matched' | 'cancelled' | 'expired';
}

export function useRankedSearchController<TQueue extends RankedQueueLike>(input: {
  readonly enabled: boolean;
  readonly requestId: string | null;
  readonly queue: TQueue | null | undefined;
  readonly queueUpdatedAt: number;
  readonly claim: (queue: TQueue) => Promise<TQueue>;
  readonly finalize: (queue: TQueue) => Promise<void>;
  readonly onQueueUpdate: (queue: TQueue) => void;
  readonly onTerminal: (queue: TQueue | null) => void;
  readonly onTransientError: (error: unknown) => void;
}) {
  const {
    enabled,
    requestId,
    queue,
    queueUpdatedAt,
    claim,
    finalize,
    onQueueUpdate,
    onTerminal,
    onTransientError,
  } = input;
  const claimInFlight = useRef(false);
  const finalizeInFlight = useRef(false);
  const lastClaimReceipt = useRef('');
  const phase: RankedSearchPhase =
    !enabled || !requestId
      ? 'idle'
      : queue === null
        ? 'expired'
        : queue?.status === 'matched'
          ? 'matched'
          : queue?.status === 'cancelled' || queue?.status === 'expired'
            ? 'expired'
            : queue?.status === 'queued'
              ? 'queued'
              : 'queued';

  useEffect(() => {
    if (!enabled || !requestId) {
      claimInFlight.current = false;
      finalizeInFlight.current = false;
      lastClaimReceipt.current = '';
      return;
    }
    if (queue === null) {
      onTerminal(null);
      return;
    }
    if (!queue) return;
    if (queue.status === 'cancelled' || queue.status === 'expired') {
      onTerminal(queue);
      return;
    }
    if (queue.status === 'matched') {
      if (finalizeInFlight.current) return;
      finalizeInFlight.current = true;
      void finalize(queue)
        .catch(onTransientError)
        .finally(() => {
          finalizeInFlight.current = false;
        });
      return;
    }
    const receipt = `${requestId}:${queueUpdatedAt}`;
    if (claimInFlight.current || lastClaimReceipt.current === receipt) return;
    lastClaimReceipt.current = receipt;
    claimInFlight.current = true;
    void claim(queue)
      .then(onQueueUpdate)
      .catch(onTransientError)
      .finally(() => {
        claimInFlight.current = false;
      });
  }, [
    claim,
    enabled,
    finalize,
    onQueueUpdate,
    onTerminal,
    onTransientError,
    queue,
    queueUpdatedAt,
    requestId,
  ]);

  return { phase } as const;
}
