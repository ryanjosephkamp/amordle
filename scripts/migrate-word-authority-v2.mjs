import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildRuntimeAuthority,
  sha256,
  WORD_DATASET,
  WORD_LENGTHS,
  writeAuthorityDirectory,
} from './lib/word-assets.mjs';

const root = process.cwd();
const sourceRoot = resolve(root, 'bootstrap/source-data/word-lists');
const targetRoot = resolve(root, 'data/word-lists');
const legacyManifestRaw = readFileSync(resolve(sourceRoot, 'manifest.json'), 'utf8');
const legacyManifest = JSON.parse(legacyManifestRaw);
if (!/^[a-f0-9]{40}$/.test(legacyManifest.revision ?? '')) {
  throw new Error('Bootstrap word revision cannot seed the successor authority.');
}
const sourceBanks = new Map();
for (const length of WORD_LENGTHS) {
  sourceBanks.set(
    length,
    JSON.parse(readFileSync(resolve(sourceRoot, `words_length_${length}.json`), 'utf8')),
  );
}
const authority = buildRuntimeAuthority(sourceBanks, {
  generatedAt: legacyManifest.generatedAt,
  source: {
    dataset: WORD_DATASET,
    upstreamCommit: legacyManifest.revision,
    upstreamManifestSha256: sha256(legacyManifestRaw),
    releaseDate: legacyManifest.generatedAt.slice(0, 10),
    license: 'MIT',
  },
});
writeAuthorityDirectory(targetRoot, authority);
process.stdout.write(
  `Migrated runtime word authority to schema v2 revision ${authority.manifest.revision}.\n`,
);
