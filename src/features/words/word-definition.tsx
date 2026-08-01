'use client';

import { useQuery } from '@tanstack/react-query';
import { useId } from 'react';
import { lookupDefinition } from '@/adapters/definitions';
import type { DefinitionLookupResult } from '@/domain/definitions';

export function WordDefinition({
  word,
  lookupWord = lookupDefinition,
}: {
  word: string;
  lookupWord?: (word: string) => Promise<DefinitionLookupResult>;
}) {
  const headingId = useId();
  const normalized = word.trim().toLocaleLowerCase('en-US');
  const lookup = useQuery({
    queryKey: ['definition', normalized],
    queryFn: () => lookupWord(normalized),
    enabled: /^[a-z]{2,35}$/.test(normalized),
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
  const searchUrl = `https://www.google.com/search?q=define+${encodeURIComponent(normalized)}`;

  return (
    <section className="word-definition" aria-labelledby={headingId}>
      <div className="definition-status">
        <h3 id={headingId}>Definition</h3>
        {lookup.data?.source && (
          <span>
            {lookup.data.source === 'dictionary-api' ? 'Free Dictionary API' : 'Wiktionary'}
            {lookup.data.cached ? ' · cached' : ''}
            {lookup.data.stale ? ' · offline copy' : ''}
          </span>
        )}
      </div>
      {lookup.isPending ? (
        <p role="status">Looking up {normalized.toUpperCase()}…</p>
      ) : lookup.data?.status === 'found' ? (
        <ol className="definition-list">
          {lookup.data.definitions.slice(0, 3).map((entry, index) => (
            <li key={`${entry.definition}:${index}`}>
              {entry.partOfSpeech && <strong>{entry.partOfSpeech}</strong>}
              <span>{entry.definition}</span>
            </li>
          ))}
        </ol>
      ) : lookup.isError ? (
        <p role="status">
          Definition sources are unavailable right now. A saved offline result will be used when one
          exists.
        </p>
      ) : (
        <p>No usable definition was found from either source.</p>
      )}
      <div className="action-row">
        <button type="button" onClick={() => void navigator.clipboard.writeText(normalized)}>
          COPY WORD
        </button>
        {lookup.isError && (
          <button type="button" onClick={() => void lookup.refetch()}>
            RETRY
          </button>
        )}
        <a className="button" href={searchUrl} target="_blank" rel="noopener noreferrer">
          SEARCH WEB
        </a>
      </div>
    </section>
  );
}
