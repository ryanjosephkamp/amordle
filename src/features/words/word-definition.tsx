'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useRef } from 'react';
import { lookupDefinition } from '@/adapters/definitions';
import { ExternalLink } from '@/components/external-link';
import type { DefinitionLookupResult } from '@/domain/definitions';

export function WordDefinition({
  word,
  lookupWord = lookupDefinition,
  enabled = true,
  headingLevel = 3,
  onSettled,
}: {
  word: string;
  lookupWord?: (word: string) => Promise<DefinitionLookupResult>;
  enabled?: boolean;
  headingLevel?: 3 | 4;
  onSettled?: () => void;
}) {
  const headingId = useId();
  const settledWord = useRef('');
  const normalized = word.trim().toLocaleLowerCase('en-US');
  const lookup = useQuery({
    queryKey: ['definition', normalized],
    queryFn: () => lookupWord(normalized),
    enabled: enabled && /^[a-z]{2,35}$/.test(normalized),
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
  const searchUrl = `https://www.google.com/search?q=define+${encodeURIComponent(normalized)}`;
  const Heading = headingLevel === 4 ? 'h4' : 'h3';

  useEffect(() => {
    if (
      enabled &&
      lookup.fetchStatus === 'idle' &&
      (lookup.isSuccess || lookup.isError) &&
      settledWord.current !== normalized
    ) {
      settledWord.current = normalized;
      onSettled?.();
    }
  }, [enabled, lookup.fetchStatus, lookup.isError, lookup.isSuccess, normalized, onSettled]);

  return (
    <section className="word-definition" aria-labelledby={headingId}>
      <div className="definition-status">
        {/*
          ANNOT-12. The word is named inside the definition region itself, in every
          branch — it previously appeared only while a lookup was pending, so a settled
          definition showed a gloss with no word ("Noun · plural of idea" in SS-12).
          Fixing it here rather than at the five call sites makes the invariant global,
          including the ranked COMBAT forfeit path the owner hit.

          This cannot widen answer disclosure: `word` is already the authorized value
          passed in by a caller that has cleared its own reveal guard, and it is
          already used for the lookup itself. No new data reaches the browser.
        */}
        <Heading id={headingId}>
          Definition · <span className="definition-word mono">{normalized.toUpperCase()}</span>
        </Heading>
        {lookup.data?.source && (
          <span>
            {lookup.data.source === 'dictionary-api' ? 'Free Dictionary API' : 'Wiktionary'}
            {lookup.data.cached ? ' · cached' : ''}
            {lookup.data.stale ? ' · offline copy' : ''}
          </span>
        )}
      </div>
      {!enabled ? (
        <p role="status">Waiting to look up {normalized.toUpperCase()}…</p>
      ) : lookup.isPending ? (
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
        <ExternalLink href={searchUrl} variant="button">
          SEARCH WEB
        </ExternalLink>
      </div>
    </section>
  );
}
