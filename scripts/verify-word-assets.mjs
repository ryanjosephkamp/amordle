import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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
const runtimeRoot = resolve(root, 'data/word-lists');
const { manifest } = validateRuntimeAuthority(runtimeRoot);
const failureProbe = mkdtempSync(join(tmpdir(), 'amordle-word-authority-'));
try {
  const incomplete = join(failureProbe, 'word-lists');
  cpSync(runtimeRoot, incomplete, { recursive: true });
  unlinkSync(join(incomplete, 'words_length_35.json'));
  let failedClosed = false;
  try {
    validateRuntimeAuthority(incomplete);
  } catch {
    failedClosed = true;
  }
  if (!failedClosed) {
    throw new Error('An incomplete word authority did not fail closed.');
  }
} finally {
  rmSync(failureProbe, { recursive: true, force: true });
}
process.stdout.write(
  `PASS immutable bootstrap word authority, runtime schema v2 ${manifest.entries.length}/34, and incomplete-build rejection (${runtimeSize(runtimeRoot)} bytes)\n`,
);
