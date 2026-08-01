'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { reserveSoloSessionSummary, loadSoloSessionRegistry } from '@/adapters/solo-sessions';
import { soloSessionsQueryKey } from '@/application/solo-query-keys';
import { useAuth } from '@/components/providers';
import { canStartSoloSession } from '@/domain/solo-sessions';
import { WorkbenchRegion } from '@/components/route-states';
import type { Difficulty, GameMode } from '@/domain/game';

export function SoloSetup({ ownerNamespace }: { ownerNamespace: string }) {
  const router = useRouter();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const userId = auth.status === 'signed-in' ? auth.user?.id : undefined;
  const [mode, setMode] = useState<GameMode>('og');
  const [length, setLength] = useState(5);
  const [difficulty, setDifficulty] = useState<Difficulty>('standard');
  const [hardMode, setHardMode] = useState(false);
  const [goCount, setGoCount] = useState<5 | 7 | 10>(5);
  const [startError, setStartError] = useState('');
  const [starting, setStarting] = useState(false);
  const registry = useQuery({
    queryKey: soloSessionsQueryKey(ownerNamespace),
    queryFn: () => loadSoloSessionRegistry(ownerNamespace, userId),
  });
  const configKey = useMemo(
    () =>
      [mode, length, difficulty, hardMode ? 'hard' : 'normal', mode === 'go' ? goCount : 1].join(
        ':',
      ),
    [difficulty, goCount, hardMode, length, mode],
  );
  const routeFor = (generation: number, sessionToken: string) => {
    const query = new URLSearchParams({
      length: String(length),
      difficulty,
      hard: hardMode ? '1' : '0',
      generation: String(generation),
      session: sessionToken,
      ...(mode === 'go' ? { count: String(goCount) } : {}),
    });
    return `/play/solo/practice/${mode}?${query.toString()}` as Route;
  };
  const category = `practice:${mode}` as const;
  const canStart = registry.data ? canStartSoloSession(registry.data, category) : false;

  return (
    <div className="split-layout">
      <WorkbenchRegion title="PRACTICE CONFIGURATION" status="2–35 LETTERS">
        <form
          className="field-stack setup-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!registry.data || !canStart || starting) return;
            setStarting(true);
            setStartError('');
            const storageKey = `amordle:practice-generation:${configKey}`;
            const previous = Number(localStorage.getItem(storageKey) ?? '-1');
            const generation = Number.isInteger(previous) && previous >= -1 ? previous + 1 : 0;
            const sessionToken = crypto.randomUUID();
            const sessionId = `practice:${mode}:${sessionToken}`;
            const resumeHref = routeFor(generation, sessionToken);
            const timestamp = new Date().toISOString();
            try {
              const next = await reserveSoloSessionSummary(ownerNamespace, userId, {
                schemaVersion: 2,
                id: sessionId,
                ownerNamespace,
                lane: 'practice',
                settings: {
                  mode,
                  length,
                  difficulty,
                  hardMode,
                  goCount: mode === 'go' ? goCount : 1,
                },
                localDate: null,
                resumeHref,
                lifecycle: 'reserved',
                acceptedGuesses: 0,
                puzzleIndex: 0,
                createdAt: timestamp,
                updatedAt: timestamp,
                lastPlayedAt: timestamp,
              });
              localStorage.setItem(storageKey, String(generation));
              queryClient.setQueryData(soloSessionsQueryKey(ownerNamespace), next);
              router.push(resumeHref);
            } catch (error) {
              setStartError(error instanceof Error ? error.message : 'The game could not start.');
              setStarting(false);
              void registry.refetch();
            }
          }}
        >
          <label>
            Mode
            <select
              aria-label="Mode"
              value={mode}
              onChange={(event) => setMode(event.target.value as GameMode)}
            >
              <option value="og">OG · one answer</option>
              <option value="go">GO · answer chain</option>
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
          <label>
            Difficulty
            <select
              value={difficulty}
              onChange={(event) => setDifficulty(event.target.value as Difficulty)}
            >
              <option value="casual">Casual</option>
              <option value="standard">Standard</option>
              <option value="expert">Expert</option>
            </select>
          </label>
          {mode === 'go' && (
            <label>
              Puzzles
              <select
                value={goCount}
                onChange={(event) => setGoCount(Number(event.target.value) as 5 | 7 | 10)}
              >
                <option value={5}>5</option>
                <option value={7}>7</option>
                <option value={10}>10</option>
              </select>
            </label>
          )}
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={hardMode}
              onChange={(event) => setHardMode(event.target.checked)}
            />
            Hard Mode
          </label>
          <button className="primary" disabled={!canStart || starting}>
            {starting ? 'STARTING…' : 'START NEW PRACTICE'}
          </button>
          {!canStart && registry.data && (
            <p role="status">You already have three active {mode.toUpperCase()} Practice games.</p>
          )}
          {startError && <p role="alert">{startError}</p>}
        </form>
      </WorkbenchRegion>
      <WorkbenchRegion title="RUN NOTES" status={mode === 'go' ? `${goCount} PUZZLES` : '1 PUZZLE'}>
        <div className="prose">
          <p>
            Each configuration keeps its own saved game. Starting here creates a fresh run without
            changing your other modes, Daily games, or account progress.
          </p>
        </div>
        <div className="action-row">
          <Link className="button" href="/calendar">
            CHOOSE A DAILY
          </Link>
        </div>
      </WorkbenchRegion>
    </div>
  );
}
