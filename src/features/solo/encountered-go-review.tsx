'use client';

import { useCallback, useState } from 'react';
import type { EncounteredSoloGoEntry } from '@/domain/solo-go-review';
import { WordDefinition } from '@/features/words/word-definition';
import type { DefinitionLookupResult } from '@/domain/definitions';

const maximumConcurrentLookups = 2;

export function EncounteredGoReview({
  entries,
  lookupWord,
}: {
  entries: EncounteredSoloGoEntry[];
  lookupWord?: (word: string) => Promise<DefinitionLookupResult>;
}) {
  const [enabledCount, setEnabledCount] = useState(() =>
    Math.min(maximumConcurrentLookups, entries.length),
  );

  const unlockNext = useCallback(() => {
    setEnabledCount((current) => Math.min(entries.length, current + 1));
  }, [entries.length]);

  return (
    <section className="encountered-go-review" aria-labelledby="encountered-words-heading">
      <h3 id="encountered-words-heading">Encountered words</h3>
      <ol className="encountered-go-list">
        {entries.map((entry, index) => (
          <li key={`${entry.puzzleNumber}:${entry.word}`}>
            <article className="encountered-go-entry">
              <h3>
                Puzzle {entry.puzzleNumber} ·{' '}
                <span className="mono">{entry.word.toUpperCase()}</span>
              </h3>
              <WordDefinition
                word={entry.word}
                {...(lookupWord ? { lookupWord } : {})}
                enabled={index < enabledCount}
                headingLevel={4}
                onSettled={unlockNext}
              />
            </article>
          </li>
        ))}
      </ol>
    </section>
  );
}
