import { cpSync, mkdtempSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runtimeSize, validateRuntimeAuthority } from './lib/word-assets.mjs';

const root = process.cwd();
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
  `PASS runtime word authority schema v2 ${manifest.entries.length}/34, and incomplete-build rejection (${runtimeSize(runtimeRoot)} bytes)\n`,
);
