import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import {
  buildRuntimeAuthority,
  runtimeSize,
  validateRuntimeAuthority,
  WORD_DATASET,
  writeAuthorityDirectory,
} from './lib/word-assets.mjs';
import {
  compareWordAuthorities,
  fetchUpstreamManifest,
  fetchUpstreamWordBanks,
  validateCommit,
} from './lib/hugging-face-word-data.mjs';

const args = process.argv.slice(2).filter((value, index) => value !== '--' || index !== 0);
const revisionIndex = args.indexOf('--revision');
const upstreamCommit = validateCommit(revisionIndex >= 0 ? (args[revisionIndex + 1] ?? '') : '');
if (args.length !== 2 || revisionIndex !== 0) {
  throw new Error('Usage: refresh-word-data.mjs --revision <40-character-commit>');
}

const root = process.cwd();
const runtimeRoot = resolve(root, 'data/word-lists');
const current = validateRuntimeAuthority(runtimeRoot);
const upstreamManifest = await fetchUpstreamManifest(upstreamCommit);
if (
  current.manifest.source.upstreamCommit === upstreamCommit &&
  current.manifest.source.upstreamManifestSha256 === upstreamManifest.sha256
) {
  process.stdout.write(`Word authority already pins upstream ${upstreamCommit}; no changes.\n`);
  process.exit(0);
}
const upstream = await fetchUpstreamWordBanks(upstreamCommit);
const candidate = buildRuntimeAuthority(upstream.banks, {
  generatedAt: upstreamManifest.manifest.generated_at,
  source: {
    dataset: WORD_DATASET,
    upstreamCommit,
    upstreamManifestSha256: upstreamManifest.sha256,
    releaseDate: upstreamManifest.manifest.release_date,
    license: 'MIT',
  },
});
const comparison = compareWordAuthorities(current, candidate);
if (comparison.blockers.length) {
  throw new Error(
    `Upstream drift requires separate review:\n${comparison.blockers.map((item) => `- ${item}`).join('\n')}`,
  );
}

const retrievedAt = new Date().toISOString();
const report = {
  schemaVersion: 1,
  dataset: WORD_DATASET,
  retrievedAt,
  upstreamCommit,
  upstreamManifestSha256: upstreamManifest.sha256,
  upstreamReleaseDate: upstreamManifest.manifest.release_date,
  upstreamInputBytes: upstream.totalBytes + Buffer.byteLength(upstreamManifest.raw),
  previousRuntimeBytes: runtimeSize(runtimeRoot),
  candidateRuntimeBytes:
    Buffer.byteLength(`${JSON.stringify(candidate.manifest)}\n`) +
    [...candidate.assets.values()].reduce((sum, raw) => sum + Buffer.byteLength(raw), 0),
  ...comparison,
};
const shortCommit = upstreamCommit.slice(0, 12);
const reportDirectory = resolve(root, 'reports/word-refresh');
mkdirSync(reportDirectory, { recursive: true });
const reportBase = `${upstreamManifest.manifest.release_date}-${shortCommit}`;
const jsonPath = resolve(reportDirectory, `${reportBase}.json`);
const markdownPath = resolve(reportDirectory, `${reportBase}.md`);
const changedLengths = comparison.lengths.filter(
  (row) =>
    row.addedAnswers.count ||
    row.removedAnswers.count ||
    row.addedGuesses.count ||
    row.removedGuesses.count,
);
const markdown = `# Word Authority Refresh ${upstreamManifest.manifest.release_date}

- Dataset: \`${WORD_DATASET}\`
- Pinned upstream commit: \`${upstreamCommit}\`
- Retrieved: ${retrievedAt}
- Previous runtime revision: \`${comparison.currentRevision}\`
- Candidate runtime revision: \`${comparison.candidateRevision}\`
- Valid guesses: ${comparison.currentTotal} → ${comparison.candidateTotal} (${comparison.totalDelta >= 0 ? '+' : ''}${comparison.totalDelta})
- Upstream input: ${report.upstreamInputBytes} bytes
- Runtime data: ${report.previousRuntimeBytes} → ${report.candidateRuntimeBytes} bytes
- Blocking drift findings: none

## Changed lengths

${
  changedLengths.length
    ? changedLengths
        .map(
          (row) =>
            `- **${row.length} letters:** answers ${row.before.answers} → ${row.after.answers}; valid guesses ${row.before.validGuesses} → ${row.after.validGuesses}; answer additions/removals ${row.addedAnswers.count}/${row.removedAnswers.count}; guess additions/removals ${row.addedGuesses.count}/${row.removedGuesses.count}.`,
        )
        .join('\n')
    : '- No normalized gameplay content changed; provenance advanced only.'
}

The machine-readable companion contains bounded samples and SHA-256 digests for every difference set.
`;
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(markdownPath, markdown);
writeAuthorityDirectory(runtimeRoot, candidate);
const verified = validateRuntimeAuthority(runtimeRoot);
if (verified.manifest.revision !== candidate.manifest.revision) {
  throw new Error(`Candidate activation failed after writing ${basename(runtimeRoot)}.`);
}
process.stdout.write(
  `Activated word authority ${candidate.manifest.revision} from ${upstreamCommit}; reports: ${reportBase}.{md,json}\n`,
);
