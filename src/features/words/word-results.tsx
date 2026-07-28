'use client';

import { useState } from 'react';
import { WorkbenchRegion } from '@/components/workbench';

export function WordResults({
  words,
  answerEligible,
  total,
  page,
  pages,
}: {
  words: string[];
  answerEligible: string[];
  total: number;
  page: number;
  pages: number;
}) {
  const [selected, setSelected] = useState(words[0] ?? '');
  const answerSet = new Set(answerEligible);
  return (
    <div className="split-layout">
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
              onClick={() => setSelected(word)}
            >
              <span className="mono">{word}</span>
              <span>{answerSet.has(word) ? 'Answer + guess' : 'Guess'}</span>
            </button>
          ))}
        </div>
      </section>
      <WorkbenchRegion
        title={(selected || 'CHOOSE A WORD').toUpperCase()}
        status="WORD DETAILS"
        className="word-detail"
      >
        {selected ? (
          <>
            <p>
              No curated definition is bundled for this word. You can copy it or explicitly search
              Google.
            </p>
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
          </>
        ) : (
          <p>No words match this search.</p>
        )}
      </WorkbenchRegion>
    </div>
  );
}
