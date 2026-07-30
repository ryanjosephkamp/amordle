import 'server-only';

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { get, list, put } from '@vercel/blob';
import { z } from 'zod';
import { getBlobToken } from './config';

const sourceManifestSchema = z
  .object({
    revision: z.string().min(1),
  })
  .passthrough();

const publishedEntrySchema = z
  .object({
    length: z.number().int().min(2).max(35),
    bytes: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    url: z.url(),
  })
  .strict();

export const publishedManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.string().min(1),
    publishedAt: z.iso.datetime(),
    entries: z.array(publishedEntrySchema).length(34),
  })
  .strict();

export type PublishedManifest = z.infer<typeof publishedManifestSchema>;

function manifestPath(): string {
  if (process.env.VERCEL_ENV === 'production') {
    return 'word-lists/production/manifest.json';
  }
  const commit = process.env.VERCEL_GIT_COMMIT_SHA;
  const channel = commit && /^[a-f0-9]{40}$/.test(commit) ? commit : 'local';
  return `word-lists/previews/${channel}/manifest.json`;
}

function digest(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

async function existingUrls(prefix: string, token: string): Promise<Map<string, string>> {
  const found = await list({ prefix, limit: 100, token });
  return new Map(found.blobs.map((blob) => [blob.pathname, blob.url]));
}

export async function publishWordLists(): Promise<PublishedManifest> {
  const token = getBlobToken();
  if (!token) throw new Error('WORD_STORAGE_UNAVAILABLE');
  const root = path.resolve(process.cwd(), 'data/word-lists');
  const sourceManifest = sourceManifestSchema.parse(
    JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8')),
  );
  const objectPrefix = `word-lists/objects/${sourceManifest.revision}/`;
  const existing = await existingUrls(objectPrefix, token);

  const entries: PublishedManifest['entries'] = [];
  for (let length = 2; length <= 35; length += 1) {
    const content = await readFile(path.join(root, `words_length_${length}.json`), 'utf8');
    const sha256 = digest(content);
    const pathname = `${objectPrefix}${length}-${sha256}.json`;
    const current = existing.get(pathname) ?? null;
    const blob =
      current ??
      (
        await put(pathname, content, {
          access: 'public',
          addRandomSuffix: false,
          allowOverwrite: false,
          cacheControlMaxAge: 31_536_000,
          contentType: 'application/json; charset=utf-8',
          token,
        })
      ).url;
    entries.push({
      length,
      bytes: Buffer.byteLength(content),
      sha256,
      url: blob,
    });
  }

  const manifest = publishedManifestSchema.parse({
    schemaVersion: 1,
    revision: sourceManifest.revision,
    publishedAt: new Date().toISOString(),
    entries,
  });
  await put(manifestPath(), JSON.stringify(manifest), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
    contentType: 'application/json; charset=utf-8',
    token,
  });
  return manifest;
}

export async function readPublishedManifest(): Promise<PublishedManifest | null> {
  const token = getBlobToken();
  if (!token) return null;
  const result = await get(manifestPath(), {
    access: 'public',
    useCache: false,
    token,
  });
  if (!result || result.statusCode !== 200) return null;
  const text = await new Response(result.stream).text();
  return publishedManifestSchema.parse(JSON.parse(text));
}
