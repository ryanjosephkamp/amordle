import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runtimeSize, validateRuntimeAuthority, WORD_LENGTHS } from './lib/word-assets.mjs';

const root = process.cwd();
const baseline = JSON.parse(readFileSync(resolve(root, 'bootstrap/BUNDLE-MANIFEST.json'), 'utf8'));
const baselineHashes = new Map(baseline.files.map((entry) => [entry.path, entry.sha256]));
const bootstrapNames = [
  'manifest.json',
  ...WORD_LENGTHS.map((length) => `words_length_${length}.json`),
];
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
for (const name of bootstrapNames) {
  const expected = readFileSync(resolve(root, 'bootstrap/source-data/word-lists', name));
  const relative = `bootstrap/source-data/word-lists/${name}`;
  if (baselineHashes.get(relative) !== sha256(expected)) {
    throw new Error(`Immutable bootstrap word authority drift: ${name}`);
  }
}
const { manifest } = validateRuntimeAuthority(resolve(root, 'data/word-lists'));
process.stdout.write(
  `PASS immutable bootstrap word authority and runtime schema v2 ${manifest.entries.length}/34 (${runtimeSize(resolve(root, 'data/word-lists'))} bytes)\n`,
);
