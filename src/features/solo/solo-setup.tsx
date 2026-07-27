'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { Difficulty, GameMode } from '@/domain/game';

export function SoloSetup() {
  const router = useRouter();
  const [mode, setMode] = useState<GameMode>('og');
  const [length, setLength] = useState(5);
  const [difficulty, setDifficulty] = useState<Difficulty>('standard');
  const [hardMode, setHardMode] = useState(false);
  const [goCount, setGoCount] = useState<5 | 7 | 10>(5);
  const configKey = useMemo(
    () =>
      [mode, length, difficulty, hardMode ? 'hard' : 'normal', mode === 'go' ? goCount : 1].join(
        ':',
      ),
    [difficulty, goCount, hardMode, length, mode],
  );
  const routeFor = (generation: number) => {
    const query = new URLSearchParams({
      length: String(length),
      difficulty,
      hard: hardMode ? '1' : '0',
      generation: String(generation),
      ...(mode === 'go' ? { count: String(goCount) } : {}),
    });
    return `/play/solo/practice/${mode}?${query.toString()}` as Route;
  };

  return (
    <div className="split-layout">
      <form
        className="form-panel field-stack"
        onSubmit={(event) => {
          event.preventDefault();
          const storageKey = `amordle:practice-generation:${configKey}`;
          const previous = Number(localStorage.getItem(storageKey) ?? '-1');
          const generation = Number.isInteger(previous) && previous >= -1 ? previous + 1 : 0;
          localStorage.setItem(storageKey, String(generation));
          router.push(routeFor(generation));
        }}
      >
        <label>
          Mode
          <select value={mode} onChange={(event) => setMode(event.target.value as GameMode)}>
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
        <button className="primary">Start a new Practice game</button>
      </form>
      <section className="status-panel" aria-labelledby="solo-setup-note">
        <h2 id="solo-setup-note">How new games work</h2>
        <p>
          Starting creates the next generation for only this exact configuration. Other lengths,
          modes, Daily games, accounts, and guest games remain separate.
        </p>
        <Link className="button" href="/calendar">
          Choose a Daily instead
        </Link>
      </section>
    </div>
  );
}
