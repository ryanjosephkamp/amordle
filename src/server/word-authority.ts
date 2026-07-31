import 'server-only';

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const commitSchema = z.string().regex(/^[a-f0-9]{40}$/);
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const rootRelativeAssetSchema = z
  .string()
  .regex(/^\/word-lists\/[a-f0-9]{64}\/(?:[2-9]|[12]\d|3[0-5])-[a-f0-9]{64}\.json$/);

const packagedEntrySchema = z
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

export const packagedManifestSchema = z
  .object({
    schemaVersion: z.literal(2),
    revision: hashSchema,
    generatedAt: z.iso.datetime(),
    source: z
      .object({
        dataset: z.literal('ryanjosephkamp/english-openlist'),
        upstreamCommit: commitSchema,
        upstreamManifestSha256: hashSchema,
        releaseDate: z.iso.date(),
        license: z.literal('MIT'),
        generatorVersion: z.literal('2.0.0'),
      })
      .strict(),
    entries: z.array(packagedEntrySchema).length(34),
  })
  .strict();

export type PackagedWordManifest = z.infer<typeof packagedManifestSchema>;

const upstreamManifestSchema = z
  .object({
    dataset: z.literal('english-openlist-brrrdle'),
    schema_version: z.literal('2.0'),
    release_date: z.iso.date(),
    generated_at: z.string().min(1),
    supported_word_lengths: z.object({ min: z.literal(2), max: z.literal(35) }).strict(),
    primary_files: z.array(z.string()).length(34),
  })
  .passthrough();

function digest(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function validateEntrySet(manifest: PackagedWordManifest): PackagedWordManifest {
  const expected = Array.from({ length: 34 }, (_, index) => index + 2);
  if (manifest.entries.map((entry) => entry.length).join(',') !== expected.join(',')) {
    throw new Error('Packaged word manifest length order is invalid.');
  }
  for (const entry of manifest.entries) {
    const expectedUrl = `/word-lists/${manifest.revision}/${entry.length}-${entry.sha256}.json`;
    if (entry.url !== expectedUrl || entry.answers > entry.validGuesses) {
      throw new Error(`Packaged word manifest entry ${entry.length} is invalid.`);
    }
  }
  return manifest;
}

export async function readPackagedManifest(): Promise<PackagedWordManifest> {
  const file = path.resolve(process.cwd(), 'data/word-lists/manifest.json');
  return validateEntrySet(packagedManifestSchema.parse(JSON.parse(await readFile(file, 'utf8'))));
}

export interface WordFreshnessResult {
  status: 'current' | 'upstream_release_available';
  deployedRevision: string;
  deployedUpstreamCommit: string;
  observedUpstreamCommit: string;
  observedReleaseDate: string;
  checkedAt: string;
  nextAction: 'none' | 'repository_refresh_required';
}

export async function checkWordFreshness(): Promise<WordFreshnessResult> {
  const deployed = await readPackagedManifest();
  const response = await fetch(
    'https://huggingface.co/datasets/ryanjosephkamp/english-openlist/resolve/main/data/brrrdle/manifest.json',
    {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) throw new Error('Upstream word manifest is unavailable.');
  const observedCommit = commitSchema.parse(response.headers.get('x-repo-commit'));
  const declaredBytes = Number(response.headers.get('content-length') ?? '0');
  if (declaredBytes > 64 * 1024) throw new Error('Upstream word manifest is out of bounds.');
  const raw = await response.text();
  if (new TextEncoder().encode(raw).byteLength > 64 * 1024) {
    throw new Error('Upstream word manifest is out of bounds.');
  }
  const observed = upstreamManifestSchema.parse(JSON.parse(raw));
  const current = digest(raw) === deployed.source.upstreamManifestSha256;
  return {
    status: current ? 'current' : 'upstream_release_available',
    deployedRevision: deployed.revision,
    deployedUpstreamCommit: deployed.source.upstreamCommit,
    observedUpstreamCommit: observedCommit,
    observedReleaseDate: observed.release_date,
    checkedAt: new Date().toISOString(),
    nextAction: current ? 'none' : 'repository_refresh_required',
  };
}
