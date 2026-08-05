'use client';

import { useEffect, useRef, useState } from 'react';
import { dismissOnBackdrop, useModalScrollLock } from '@/application/modal-dialog';
import type { DefinitionLookupResult } from '@/domain/definitions';
import { WordDefinition } from './word-definition';

export function WordResults({
  words,
  answerEligible,
  total,
  page,
  pages,
  initialWord,
  definitionLookup,
}: {
  words: string[];
  answerEligible: string[];
  total: number;
  page: number;
  pages: number;
  initialWord?: string;
  definitionLookup?: (word: string) => Promise<DefinitionLookupResult>;
}) {
  const [selected, setSelected] = useState(initialWord ?? words[0] ?? '');
  const dialog = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  useModalScrollLock(detailsOpen);
  const answerSet = new Set(answerEligible);
  const openDetails = (word: string, trigger?: HTMLButtonElement | null) => {
    setSelected(word);
    returnFocus.current = trigger ?? null;
    if (!dialog.current?.open) dialog.current?.showModal();
    setDetailsOpen(true);
  };

  useEffect(() => {
    if (initialWord) {
      queueMicrotask(() => {
        if (!dialog.current?.open) dialog.current?.showModal();
        setDetailsOpen(true);
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
          className="app-modal word-detail-dialog"
          aria-labelledby="word-detail-heading"
          onClose={() => {
            setDetailsOpen(false);
            returnFocus.current?.focus();
          }}
          onClick={(event) => dismissOnBackdrop(event)}
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
            <WordDefinition
              word={selected}
              {...(definitionLookup === undefined ? {} : { lookupWord: definitionLookup })}
            />
          </div>
        </dialog>
      )}
    </>
  );
}
