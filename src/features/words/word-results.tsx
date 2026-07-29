'use client';

import { useEffect, useRef, useState } from 'react';

export function WordResults({
  words,
  answerEligible,
  total,
  page,
  pages,
  initialWord,
}: {
  words: string[];
  answerEligible: string[];
  total: number;
  page: number;
  pages: number;
  initialWord?: string;
}) {
  const [selected, setSelected] = useState(initialWord ?? words[0] ?? '');
  const dialog = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const answerSet = new Set(answerEligible);
  const openDetails = (word: string, trigger?: HTMLButtonElement | null) => {
    setSelected(word);
    returnFocus.current = trigger ?? null;
    if (!dialog.current?.open) dialog.current?.showModal();
  };

  useEffect(() => {
    if (initialWord) {
      queueMicrotask(() => {
        if (!dialog.current?.open) dialog.current?.showModal();
      });
    }
    // Direct word links intentionally open once on mount.
  }, [initialWord]);

  return (
    <>
      <section aria-labelledby="word-results-heading">
        <div className="section-heading">
          <h2 id="word-results-heading">Words</h2>
          <span className="mono">
            {total} results · page {page}/{Math.max(1, pages)}
          </span>
        </div>
        <div className="word-list" role="listbox" aria-label="Sanctioned words">
          {words.map((word) => (
            <button
              type="button"
              role="option"
              aria-selected={selected === word}
              key={word}
              onClick={(event) => openDetails(word, event.currentTarget)}
            >
              <span className="mono">{word}</span>
              <span>{answerSet.has(word) ? 'Answer + guess' : 'Guess'}</span>
            </button>
          ))}
        </div>
        {!words.length && <p>No words match this search.</p>}
      </section>
      {selected && (
        <dialog
          ref={dialog}
          className="word-detail-dialog"
          aria-labelledby="word-detail-heading"
          onClose={() => returnFocus.current?.focus()}
          onClick={(event) => {
            if (event.target === event.currentTarget) event.currentTarget.close();
          }}
        >
          <div className="word-detail-dialog-content">
            <header>
              <div>
                <span>WORD DETAILS</span>
                <h2 id="word-detail-heading">{selected.toUpperCase()}</h2>
              </div>
              <button
                type="button"
                aria-label="Close word details"
                onClick={() => dialog.current?.close()}
              >
                ×
              </button>
            </header>
            <p>No definition is bundled. Copy this word or search for its definition.</p>
            <div className="action-row">
              <button onClick={() => void navigator.clipboard.writeText(selected)}>
                COPY WORD
              </button>
              <a
                className="button primary"
                href={`https://www.google.com/search?q=define+${encodeURIComponent(selected)}`}
                target="_blank"
                rel="noreferrer"
              >
                SEARCH DEFINITION
              </a>
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}
