'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { createPrivateRequest } from '@/adapters/supabase/combat';
import { operationId } from '@/adapters/supabase/shared';

export function PrivateChallengeForm({
  targetPublicProfileId,
  targetDisplayName,
  onSent,
}: {
  targetPublicProfileId: string;
  targetDisplayName: string;
  onSent?(): void;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'og' | 'go'>('og');
  const [length, setLength] = useState(5);
  const [hardMode, setHardMode] = useState(false);
  const [timeLimitMs, setTimeLimitMs] = useState<300_000 | null>(null);
  const [goPuzzleCount, setGoPuzzleCount] = useState<5 | 7 | 10>(5);
  const [message, setMessage] = useState('');
  const create = useMutation({
    mutationFn: () =>
      createPrivateRequest({
        targetPublicProfileId,
        mode,
        wordLength: length,
        hardMode,
        timeLimitMs,
        goPuzzleCount: mode === 'go' ? goPuzzleCount : null,
        idempotencyKey: operationId('private-request'),
      }),
    onSuccess: () => {
      setMessage(`Private request sent to ${targetDisplayName}.`);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['combat', 'private-requests'] }),
        queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      ]);
      onSent?.();
    },
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : 'Private request not sent.'),
  });

  return (
    <form
      className="private-challenge-form field-stack"
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate();
      }}
    >
      <div className="section-heading">
        <h2>Challenge {targetDisplayName}</h2>
        <span>Private Practice</span>
      </div>
      <div className="challenge-grid">
        <label>
          Mode
          <select value={mode} onChange={(event) => setMode(event.target.value as 'og' | 'go')}>
            <option value="og">OG</option>
            <option value="go">GO</option>
          </select>
        </label>
        <label>
          Word length
          <input
            type="number"
            min={2}
            max={35}
            step={1}
            value={length}
            onChange={(event) => setLength(Number(event.target.value))}
          />
        </label>
        {mode === 'go' && (
          <label>
            Puzzles
            <select
              value={goPuzzleCount}
              onChange={(event) => setGoPuzzleCount(Number(event.target.value) as 5 | 7 | 10)}
            >
              <option value={5}>5</option>
              <option value={7}>7</option>
              <option value={10}>10</option>
            </select>
          </label>
        )}
        <label>
          Clock
          <select
            value={timeLimitMs ?? 'untimed'}
            onChange={(event) => setTimeLimitMs(event.target.value === '300000' ? 300_000 : null)}
          >
            <option value="untimed">Untimed</option>
            <option value="300000">5:00 per player</option>
          </select>
        </label>
      </div>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={hardMode}
          onChange={(event) => setHardMode(event.target.checked)}
        />
        Hard Mode
      </label>
      <button className="primary" disabled={create.isPending}>
        {create.isPending ? 'SENDING…' : 'SEND PRIVATE REQUEST'}
      </button>
      <p className="field-help">
        The other player can accept, decline, or block the request. Existing request preferences and
        anti-spam limits still apply.
      </p>
      <p aria-live="polite">{message}</p>
    </form>
  );
}
