'use client';

import { z } from 'zod';
import { readEnvelope, writeEnvelope } from './indexeddb';

const entrySchema = z
  .object({
    length: z.number().int().min(2).max(35),
    bytes: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    url: z.url(),
  })
  .strict();

export const manifestSchema = z
  .object({
    manifest: z
      .object({
        schemaVersion: z.literal(1),
        revision: z.string(),
        publishedAt: z.string(),
        entries: z.array(entrySchema),
      })
      .strict()
      .nullable(),
  })
  .strict();

const wordBankSchema = z
  .object({
    metadata: z
      .object({
        length: z.number().int().min(2).max(35),
        source: z.string().min(1),
        version: z.string(),
        generatedAt: z.iso.datetime(),
        curation: z
          .object({
            method: z.string().min(1),
            seed: z.number().int(),
            target_sample_size: z.number().int().positive(),
            curation_date: z.iso.datetime(),
            note: z.string(),
          })
          .strict(),
      })
      .strict(),
    answers: z.array(
      z
        .object({
          word: z.string().regex(/^[a-z]+$/),
        })
        .strict(),
    ),
    validGuesses: z.array(z.string().regex(/^[a-z]+$/)),
  })
  .strict();

const publicManifestStateSchema = manifestSchema.shape.manifest.unwrap();
const manifestDomain = 'word-lists:manifest';
const assetCache = 'amordle-public-word-lists-v1';

async function loadManifest() {
  try {
    const response = await fetch('/api/word-lists/manifest', { cache: 'no-store' });
    if (!response.ok) throw new Error('Word-list manifest is unavailable.');
    const manifest = manifestSchema.parse(await response.json()).manifest;
    if (!manifest) throw new Error('Word-list storage is intentionally unavailable.');
    await writeEnvelope({
      schemaVersion: 1,
      ownerNamespace: 'public',
      domain: manifestDomain,
      revision: Date.parse(manifest.publishedAt),
      updatedAt: manifest.publishedAt,
      state: manifest,
    });
    return manifest;
  } catch (error) {
    const cached = await readEnvelope('public', manifestDomain, publicManifestStateSchema);
    if (cached) return cached.state;
    throw error;
  }
}

async function sha256Hex(content: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function loadPublicWordBank(length: number): Promise<{
  answers: string[];
  validGuesses: ReadonlySet<string>;
}> {
  const manifest = await loadManifest();
  const entry = manifest.entries.find((candidate) => candidate.length === length);
  if (!entry) throw new Error('This word length is not published.');
  let bankResponse: Response;
  try {
    bankResponse = await fetch(entry.url, { cache: 'force-cache' });
    if (!bankResponse.ok) throw new Error('The selected word list is unavailable.');
    if ('caches' in window) {
      const cache = await caches.open(assetCache);
      await cache.put(entry.url, bankResponse.clone());
    }
  } catch (error) {
    const cached = 'caches' in window ? await caches.match(entry.url) : undefined;
    if (!cached) throw error;
    bankResponse = cached;
  }
  if (!bankResponse.ok) throw new Error('The selected word list is unavailable.');
  const raw = await bankResponse.text();
  if (new TextEncoder().encode(raw).byteLength !== entry.bytes) {
    throw new Error('Word-list byte count does not match its manifest.');
  }
  if ((await sha256Hex(raw)) !== entry.sha256) {
    throw new Error('Word-list integrity check failed.');
  }
  const bank = wordBankSchema.parse(JSON.parse(raw));
  if (bank.metadata.length !== length) throw new Error('Word-list metadata does not match.');
  const answers = bank.answers.map((answer) => answer.word);
  if (
    answers.some((word) => word.length !== length) ||
    bank.validGuesses.some((word) => word.length !== length) ||
    new Set(answers).size !== answers.length ||
    new Set(bank.validGuesses).size !== bank.validGuesses.length
  ) {
    throw new Error('Word-list contents are invalid.');
  }
  return {
    answers,
    validGuesses: new Set([...bank.validGuesses, ...answers]),
  };
}

export async function loadPublicWordSet(length: number): Promise<ReadonlySet<string>> {
  return (await loadPublicWordBank(length)).validGuesses;
}
