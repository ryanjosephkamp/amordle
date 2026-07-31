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
const migrateRuntime = process.argv.includes('--from-runtime');
const inputRoot = migrateRuntime ? targetRoot : sourceRoot;
const inputManifestRaw = readFileSync(resolve(inputRoot, 'manifest.json'), 'utf8');
const inputManifest = JSON.parse(inputManifestRaw);
const sourceBanks = new Map();
for (const length of WORD_LENGTHS) {
  sourceBanks.set(
    length,
    JSON.parse(readFileSync(resolve(inputRoot, `words_length_${length}.json`), 'utf8')),
  );
}
const source = migrateRuntime
  ? inputManifest.source
  : {
      dataset: WORD_DATASET,
      upstreamCommit: inputManifest.revision,
      upstreamManifestSha256: sha256(inputManifestRaw),
      releaseDate: inputManifest.generatedAt.slice(0, 10),
      license: 'MIT',
    };
if (!/^[a-f0-9]{40}$/.test(source.upstreamCommit ?? '')) {
  throw new Error('Word revision cannot seed the successor authority.');
}
const authority = buildRuntimeAuthority(sourceBanks, {
  generatedAt: inputManifest.generatedAt,
  source,
});
writeAuthorityDirectory(targetRoot, authority);
process.stdout.write(
  `Migrated runtime word authority to sanitized schema v2 revision ${authority.manifest.revision}.\n`,
);
