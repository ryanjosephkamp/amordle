'use client';

import { z } from 'zod';
import { deleteEnvelope, readEnvelopeDiagnostic, writeEnvelope } from '@/adapters/indexeddb';
import {
  definitionCacheSchema,
  definitionEntrySchema,
  normalizeDefinitionWord,
  stripDefinitionMarkup,
} from '@/domain/definitions';
import type {
  DefinitionCacheRecord,
  DefinitionEntry,
  DefinitionLookupResult,
} from '@/domain/definitions';

const ownerNamespace = 'public:definitions:v1';
const successTtlMs = 30 * 24 * 60 * 60 * 1000;
const notFoundTtlMs = 24 * 60 * 60 * 1000;
const timeoutMs = 6_000;
const maximumResponseBytes = 512 * 1024;
const inflight = new Map<string, Promise<DefinitionLookupResult>>();

const dictionaryPayloadSchema = z.array(
  z
    .object({
      meanings: z
        .array(
          z
            .object({
              partOfSpeech: z.string().optional(),
              definitions: z.array(z.object({ definition: z.string() }).passthrough()).optional(),
            })
            .passthrough(),
        )
        .optional(),
    })
    .passthrough(),
);

const wiktionaryPayloadSchema = z.record(
  z.string(),
  z.array(
    z
      .object({
        partOfSpeech: z.string().optional(),
        definitions: z.array(z.object({ definition: z.string() }).passthrough()).optional(),
      })
      .passthrough(),
  ),
);

function domain(word: string): string {
  return `definition:${word}`;
}

function asResult(record: DefinitionCacheRecord, cached: boolean, stale = false) {
  return { ...record, cached, stale } satisfies DefinitionLookupResult;
}

function boundedDefinitions(entries: DefinitionEntry[]): DefinitionEntry[] {
  const unique = new Map<string, DefinitionEntry>();
  for (const entry of entries) {
    const parsed = definitionEntrySchema.safeParse(entry);
    if (!parsed.success) continue;
    const key = `${parsed.data.partOfSpeech ?? ''}\0${parsed.data.definition}`;
    if (!unique.has(key)) unique.set(key, parsed.data);
    if (unique.size === 6) break;
  }
  return [...unique.values()];
}

async function fetchJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Definition source returned ${response.status}.`);
    const declaredBytes = Number(response.headers.get('content-length') ?? '0');
    if (declaredBytes > maximumResponseBytes) throw new Error('Definition response was too large.');
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maximumResponseBytes) {
      throw new Error('Definition response was too large.');
    }
    return JSON.parse(text) as unknown;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function dictionaryLookup(word: string): Promise<DefinitionEntry[]> {
  const payload = await fetchJson(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
  );
  if (payload === null) return [];
  const parsed = dictionaryPayloadSchema.safeParse(payload);
  if (!parsed.success) throw new Error('Dictionary response did not match the expected schema.');
  return boundedDefinitions(
    parsed.data.flatMap((entry) =>
      (entry.meanings ?? []).flatMap((meaning) =>
        (meaning.definitions ?? []).map((definition) => ({
          definition: definition.definition.trim(),
          ...(meaning.partOfSpeech ? { partOfSpeech: meaning.partOfSpeech.trim() } : {}),
        })),
      ),
    ),
  );
}

async function wiktionaryLookup(word: string): Promise<DefinitionEntry[]> {
  const payload = await fetchJson(
    `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`,
  );
  if (payload === null) return [];
  const parsed = wiktionaryPayloadSchema.safeParse(payload);
  if (!parsed.success) throw new Error('Wiktionary response did not match the expected schema.');
  return boundedDefinitions(
    (parsed.data.en ?? []).flatMap((entry) =>
      (entry.definitions ?? []).map((definition) => ({
        definition: stripDefinitionMarkup(definition.definition),
        ...(entry.partOfSpeech ? { partOfSpeech: entry.partOfSpeech.trim() } : {}),
      })),
    ),
  );
}

async function store(record: DefinitionCacheRecord): Promise<void> {
  await writeEnvelope({
    schemaVersion: 1,
    ownerNamespace,
    domain: domain(record.word),
    revision: Date.now(),
    updatedAt: record.checkedAt,
    state: record,
  });
}

async function performLookup(word: string): Promise<DefinitionLookupResult> {
  const cached = await readEnvelopeDiagnostic(ownerNamespace, domain(word), definitionCacheSchema);
  if (cached.status === 'corrupt') await deleteEnvelope(ownerNamespace, domain(word));
  const previous = cached.status === 'valid' ? cached.envelope.state : null;
  if (previous && Date.parse(previous.expiresAt) > Date.now()) return asResult(previous, true);
  if (!navigator.onLine && previous) return asResult(previous, true, true);

  let sourceFailures = 0;
  for (const [source, lookup] of [
    ['dictionary-api', dictionaryLookup],
    ['wiktionary', wiktionaryLookup],
  ] as const) {
    try {
      const definitions = await lookup(word);
      if (definitions.length) {
        const checkedAt = new Date().toISOString();
        const record = definitionCacheSchema.parse({
          schemaVersion: 1,
          word,
          status: 'found',
          source,
          definitions,
          checkedAt,
          expiresAt: new Date(Date.parse(checkedAt) + successTtlMs).toISOString(),
        });
        await store(record);
        return asResult(record, false);
      }
    } catch {
      sourceFailures += 1;
    }
  }

  if (sourceFailures > 0) {
    if (previous) return asResult(previous, true, true);
    throw new Error('Definition sources are temporarily unavailable.');
  }
  const checkedAt = new Date().toISOString();
  const record = definitionCacheSchema.parse({
    schemaVersion: 1,
    word,
    status: 'not-found',
    definitions: [],
    checkedAt,
    expiresAt: new Date(Date.parse(checkedAt) + notFoundTtlMs).toISOString(),
  });
  await store(record);
  return asResult(record, false);
}

export async function lookupDefinition(word: string): Promise<DefinitionLookupResult> {
  const normalized = normalizeDefinitionWord(word);
  const existing = inflight.get(normalized);
  if (existing) return existing;
  const request = performLookup(normalized).finally(() => inflight.delete(normalized));
  inflight.set(normalized, request);
  return request;
}
