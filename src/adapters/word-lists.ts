'use client';

import { z } from 'zod';
import { readEnvelope, writeEnvelope } from './indexeddb';

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const rootRelativeAssetSchema = z
  .string()
  .regex(/^\/word-lists\/[a-f0-9]{64}\/(?:[2-9]|[12]\d|3[0-5])-[a-f0-9]{64}\.json$/);

const entrySchema = z
  .object({
    length: z.number().int().min(2).max(35),
    answers: z.number().int().positive(),
    validGuesses: z.number().int().positive(),
    bytes: z
      .number()
      .int()
      .positive()
      .max(5 * 1024 * 1024),
    sha256: hashSchema,
    url: rootRelativeAssetSchema,
  })
  .strict();

const publicManifestSchema = z
  .object({
    schemaVersion: z.literal(2),
    revision: hashSchema,
    generatedAt: z.iso.datetime(),
    source: z
      .object({
        dataset: z.literal('ryanjosephkamp/english-openlist'),
        upstreamCommit: z.string().regex(/^[a-f0-9]{40}$/),
        upstreamManifestSha256: hashSchema,
        releaseDate: z.iso.date(),
        license: z.literal('MIT'),
        generatorVersion: z.literal('2.1.0'),
      })
      .strict(),
    entries: z.array(entrySchema).length(34),
  })
  .strict();

export const manifestSchema = z.object({ manifest: publicManifestSchema.nullable() }).strict();

const wordBankSchema = z
  .object({
    schemaVersion: z.literal(2),
    length: z.number().int().min(2).max(35),
    curation: z
      .object({
        method: z.literal('stratified_quality_score_v1'),
        targetSampleSize: z.number().int().positive(),
      })
      .strict(),
    answers: z.array(z.string().regex(/^[a-z]+$/)),
    validGuesses: z.array(z.string().regex(/^[a-z]+$/)),
  })
  .strict();

const manifestDomain = 'word-lists:manifest:v2';
const assetCache = 'amordle-public-word-lists-v2';

export async function prunePublicWordAssetCache(revision: string): Promise<void> {
  if (!('caches' in window) || !hashSchema.safeParse(revision).success) return;
  const cache = await caches.open(assetCache);
  const prefix = `${window.location.origin}/word-lists/${revision}/`;
  const requests = await cache.keys();
  await Promise.all(
    requests
      .filter((request) => !request.url.startsWith(prefix))
      .map((request) => cache.delete(request)),
  );
}

function validateManifestEntries(manifest: z.infer<typeof publicManifestSchema>) {
  const lengths = manifest.entries.map((entry) => entry.length);
  const expected = Array.from({ length: 34 }, (_, index) => index + 2);
  if (lengths.join(',') !== expected.join(',')) {
    throw new Error('Word-list manifest length coverage is invalid.');
  }
  for (const entry of manifest.entries) {
    if (
      entry.answers > entry.validGuesses ||
      entry.url !== `/word-lists/${manifest.revision}/${entry.length}-${entry.sha256}.json`
    ) {
      throw new Error('Word-list manifest entry is inconsistent.');
    }
  }
  return manifest;
}

async function loadManifest() {
  try {
    const response = await fetch('/api/word-lists/manifest', { cache: 'no-store' });
    if (!response.ok) throw new Error('Word-list manifest is unavailable.');
    const manifest = manifestSchema.parse(await response.json()).manifest;
    if (!manifest) throw new Error('Word-list authority is intentionally unavailable.');
    validateManifestEntries(manifest);
    await writeEnvelope({
      schemaVersion: 2,
      ownerNamespace: 'public',
      domain: manifestDomain,
      revision: Date.parse(manifest.generatedAt),
      updatedAt: manifest.generatedAt,
      state: manifest,
    });
    await prunePublicWordAssetCache(manifest.revision);
    return manifest;
  } catch (error) {
    const cached = await readEnvelope('public', manifestDomain, publicManifestSchema);
    if (cached) {
      const manifest = validateManifestEntries(cached.state);
      await prunePublicWordAssetCache(manifest.revision);
      return manifest;
    }
    throw error;
  }
}

async function sha256Hex(content: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function validatePublicWordAsset(
  raw: string,
  entry: z.infer<typeof entrySchema>,
  requestedLength: number,
) {
  if (new TextEncoder().encode(raw).byteLength !== entry.bytes) {
    throw new Error('Word-list byte count does not match its manifest.');
  }
  if ((await sha256Hex(raw)) !== entry.sha256) {
    throw new Error('Word-list integrity check failed.');
  }
  const bank = wordBankSchema.parse(JSON.parse(raw));
  if (
    bank.length !== requestedLength ||
    bank.answers.length !== entry.answers ||
    bank.validGuesses.length !== entry.validGuesses
  ) {
    throw new Error('Word-list metadata does not match its manifest.');
  }
  if (
    bank.answers.some((word) => word.length !== requestedLength) ||
    bank.validGuesses.some((word) => word.length !== requestedLength) ||
    new Set(bank.answers).size !== bank.answers.length ||
    new Set(bank.validGuesses).size !== bank.validGuesses.length
  ) {
    throw new Error('Word-list contents are invalid.');
  }
  const guesses = new Set(bank.validGuesses);
  if (!bank.answers.every((word) => guesses.has(word))) {
    throw new Error('Word-list answers are not valid guesses.');
  }
  return bank;
}

async function readNetworkAsset(entry: z.infer<typeof entrySchema>, length: number) {
  const resolved = new URL(entry.url, window.location.origin);
  if (resolved.origin !== window.location.origin) {
    throw new Error('Cross-origin word-list assets are not permitted.');
  }
  const response = await fetch(resolved, { cache: 'force-cache' });
  if (!response.ok) throw new Error('The selected word list is unavailable.');
  const raw = await response.text();
  const bank = await validatePublicWordAsset(raw, entry, length);
  if ('caches' in window) {
    const cache = await caches.open(assetCache);
    await cache.put(
      entry.url,
      new Response(raw, {
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      }),
    );
  }
  return bank;
}

async function readCachedAsset(entry: z.infer<typeof entrySchema>, length: number) {
  if (!('caches' in window)) return null;
  const cache = await caches.open(assetCache);
  const response = await cache.match(entry.url);
  if (!response) return null;
  try {
    return await validatePublicWordAsset(await response.text(), entry, length);
  } catch (error) {
    await cache.delete(entry.url);
    throw error;
  }
}

export async function loadPublicWordBank(length: number): Promise<{
  revision: string;
  answers: string[];
  validGuesses: ReadonlySet<string>;
}> {
  if (!Number.isInteger(length) || length < 2 || length > 35) {
    throw new Error('Word length must be from 2 to 35.');
  }
  const manifest = await loadManifest();
  const entry = manifest.entries.find((candidate) => candidate.length === length);
  if (!entry) throw new Error('This word length is not published.');
  let bank: z.infer<typeof wordBankSchema>;
  try {
    bank = await readNetworkAsset(entry, length);
  } catch (networkError) {
    const cached = await readCachedAsset(entry, length);
    if (!cached) throw networkError;
    bank = cached;
  }
  return {
    revision: manifest.revision,
    answers: bank.answers,
    validGuesses: new Set(bank.validGuesses),
  };
}

export async function loadPublicWordSet(length: number): Promise<ReadonlySet<string>> {
  return (await loadPublicWordBank(length)).validGuesses;
}
