'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { loadPublicWordBank } from '@/adapters/word-lists';
import { WordResults } from './word-results';

type ExplorerBank = Awaited<ReturnType<typeof loadPublicWordBank>>;

export function WordExplorer({
  length,
  search,
  sort,
  page,
  directWord,
}: {
  length: number;
  search: string;
  sort: 'az' | 'za';
  page: number;
  directWord?: string;
}) {
  const [bank, setBank] = useState<ExplorerBank | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    void loadPublicWordBank(length)
      .then((loaded) => {
        if (current) setBank(loaded);
      })
      .catch(() => {
        if (current) {
          setError(
            'This word list is unavailable. Reconnect and retry, or revisit a list that was opened while online.',
          );
        }
      });
    return () => {
      current = false;
    };
  }, [length]);

  const result = useMemo(() => {
    if (!bank) return null;
    const all = [...bank.validGuesses]
      .filter((word) => !search || word.includes(search))
      .sort((left, right) =>
        sort === 'az' ? left.localeCompare(right) : right.localeCompare(left),
      );
    const pageSize = 100;
    const pages = Math.max(1, Math.ceil(all.length / pageSize));
    const safePage = Math.min(page, pages);
    const words = all.slice((safePage - 1) * pageSize, safePage * pageSize);
    const answerSet = new Set(bank.answers);
    return {
      all,
      pages,
      safePage,
      words,
      answerEligible: words.filter((word) => answerSet.has(word)),
    };
  }, [bank, page, search, sort]);

  const params = new URLSearchParams({
    length: String(length),
    q: search,
    sort,
  });

  return (
    <>
      <form className="explorer-controls">
        <label>
          Length
          <input name="length" type="number" min={2} max={35} defaultValue={length} />
        </label>
        <label>
          Search
          <input name="q" defaultValue={search} />
        </label>
        <label>
          Sort
          <select name="sort" defaultValue={sort}>
            <option value="az">A–Z</option>
            <option value="za">Z–A</option>
          </select>
        </label>
        <button className="primary">Apply</button>
      </form>
      {error ? (
        <section className="route-state" aria-live="polite">
          <h2>Word list unavailable</h2>
          <p>{error}</p>
          <button type="button" onClick={() => window.location.reload()}>
            Retry
          </button>
        </section>
      ) : !bank || !result ? (
        <p className="prose mono" role="status">
          Loading length {length}…
        </p>
      ) : (
        <>
          <p className="prose mono">
            Length {length} · list {bank.revision.slice(0, 8)} · {bank.answers.length} may be
            answers · {bank.validGuesses.size} accepted guesses
          </p>
          <WordResults
            words={result.words}
            answerEligible={result.answerEligible}
            total={result.all.length}
            page={result.safePage}
            pages={result.pages}
            {...(directWord && bank.validGuesses.has(directWord)
              ? { initialWord: directWord }
              : {})}
          />
          <nav className="pagination" aria-label="Word pages">
            <Link
              className="button"
              aria-disabled={result.safePage === 1}
              href={
                result.safePage === 1 ? '#' : `?${params.toString()}&page=${result.safePage - 1}`
              }
            >
              Previous
            </Link>
            <Link
              className="button"
              aria-disabled={result.safePage === result.pages}
              href={
                result.safePage === result.pages
                  ? '#'
                  : `?${params.toString()}&page=${result.safePage + 1}`
              }
            >
              Next
            </Link>
          </nav>
        </>
      )}
    </>
  );
}
