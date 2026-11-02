import { execFileSync } from 'node:child_process';
import {
  WORD_ASSET_FILE_LIMIT,
  WORD_ASSET_TOTAL_LIMIT,
  WORD_DATASET,
  WORD_LENGTHS,
  WORD_MANIFEST_LIMIT,
  sha256,
} from './word-assets.mjs';

const commitPattern = /^[a-f0-9]{40}$/;
const allowedPathPattern =
  /^data\/brrrdle\/(?:manifest\.json|words_length_(?:[2-9]|[12]\d|3[0-5])\.json)$/;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function allowedHost(hostname) {
  return (
    hostname === 'huggingface.co' ||
    hostname.endsWith('.huggingface.co') ||
    hostname.endsWith('.hf.co') ||
    hostname.endsWith('.xethub.hf.co')
  );
}

export function resolveUpstreamCommit() {
  const output = execFileSync(
    'git',
    ['ls-remote', `https://huggingface.co/datasets/${WORD_DATASET}.git`, 'HEAD'],
    {
      encoding: 'utf8',
      timeout: 30_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  ).trim();
  const commit = output.split(/\s+/)[0] ?? '';
  assert(commitPattern.test(commit), 'Hugging Face did not return an exact dataset commit.');
  return commit;
}

export function validateCommit(commit) {
  assert(commitPattern.test(commit), 'Upstream revision must be a 40-character lowercase commit.');
  return commit;
}

export async function fetchPinnedText(commit, assetPath, maxBytes) {
  validateCommit(commit);
  assert(allowedPathPattern.test(assetPath), `Refusing unexpected Hugging Face path ${assetPath}.`);
  const url = new URL(
    `https://huggingface.co/datasets/${WORD_DATASET}/resolve/${commit}/${assetPath}`,
  );
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  });
  assert(response.ok, `Hugging Face returned ${response.status} for ${assetPath}.`);
  assert(allowedHost(new URL(response.url).hostname), `Unexpected redirect for ${assetPath}.`);
  const declared = Number(response.headers.get('content-length') ?? '0');
  assert(!declared || declared <= maxBytes, `${assetPath} exceeds its declared size limit.`);
  assert(response.body, `${assetPath} returned no response body.`);
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    assert(bytes <= maxBytes, `${assetPath} exceeds its streamed size limit.`);
    chunks.push(value);
  }
  const merged = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const raw = new TextDecoder('utf-8', { fatal: true }).decode(merged);
  assert(
    !raw.startsWith('version https://git-lfs.github.com/spec/'),
    `${assetPath} is an LFS pointer.`,
  );
  return raw;
}

export async function fetchUpstreamManifest(commit) {
  const raw = await fetchPinnedText(commit, 'data/brrrdle/manifest.json', WORD_MANIFEST_LIMIT);
  const manifest = JSON.parse(raw);
  assert(manifest?.dataset === 'english-openlist-brrrdle', 'Unexpected upstream dataset name.');
  assert(manifest.schema_version === '2.0', 'Unexpected upstream word schema.');
  assert(
    manifest.supported_word_lengths?.min === 2 && manifest.supported_word_lengths?.max === 35,
    'Upstream length boundary drifted.',
  );
  assert(/^\d{4}-\d{2}-\d{2}$/.test(manifest.release_date ?? ''), 'Invalid release date.');
  assert(!Number.isNaN(Date.parse(manifest.generated_at)), 'Invalid upstream generation time.');
  const primary = new Set(manifest.primary_files ?? []);
  for (const length of WORD_LENGTHS) {
    assert(primary.has(`words_length_${length}.json`), `Upstream length ${length} is missing.`);
    assert(
      Number.isInteger(manifest.per_length_counts?.[String(length)]) &&
        manifest.per_length_counts[String(length)] > 0,
      `Upstream count for length ${length} is invalid.`,
    );
  }
  assert(primary.size === 34, 'Upstream primary file set contains unexpected entries.');
  return { raw, manifest, sha256: sha256(raw) };
}

export async function fetchUpstreamWordBanks(commit) {
  const banks = new Map();
  let totalBytes = 0;
  for (const length of WORD_LENGTHS) {
    const raw = await fetchPinnedText(
      commit,
      `data/brrrdle/words_length_${length}.json`,
      WORD_ASSET_FILE_LIMIT,
    );
    totalBytes += Buffer.byteLength(raw);
    assert(totalBytes <= WORD_ASSET_TOTAL_LIMIT, 'Upstream word assets exceed the total limit.');
    banks.set(length, JSON.parse(raw));
  }
  return { banks, totalBytes };
}

function difference(left, right) {
  const rightSet = new Set(right);
  const values = left.filter((value) => !rightSet.has(value));
  return {
    count: values.length,
    sample: values.slice(0, 20),
    sha256: sha256(`${values.slice().sort().join('\n')}\n`),
  };
}

export function compareWordAuthorities(current, candidate) {
  const lengths = [];
  let currentTotal = 0;
  let candidateTotal = 0;
  const blockers = [];
  for (const length of WORD_LENGTHS) {
    const before = JSON.parse(current.assets.get(length));
    const after = JSON.parse(candidate.assets.get(length));
    currentTotal += before.validGuesses.length;
    candidateTotal += after.validGuesses.length;
    const validDelta = after.validGuesses.length - before.validGuesses.length;
    const validRatio = Math.abs(validDelta) / before.validGuesses.length;
    const addedGuesses = difference(after.validGuesses, before.validGuesses);
    const removedGuesses = difference(before.validGuesses, after.validGuesses);
    const addedAnswers = difference(after.answers, before.answers);
    const removedAnswers = difference(before.answers, after.answers);
    const answerChange = addedAnswers.count + removedAnswers.count;
    const answerRatio = answerChange / before.answers.length;
    if (Math.abs(validDelta) > 5 && validRatio > 0.15) {
      blockers.push(`Length ${length} valid-guess count changed by more than 15%.`);
    }
    if (answerChange > 25 && answerRatio > 0.2) {
      blockers.push(`Length ${length} answer set changed by more than 20%.`);
    }
    lengths.push({
      length,
      before: { answers: before.answers.length, validGuesses: before.validGuesses.length },
      after: { answers: after.answers.length, validGuesses: after.validGuesses.length },
      addedAnswers,
      removedAnswers,
      addedGuesses,
      removedGuesses,
    });
  }
  const totalRatio = (candidateTotal - currentTotal) / currentTotal;
  if (totalRatio < -0.02) blockers.push('Total valid guesses decreased by more than 2%.');
  if (totalRatio > 0.15) blockers.push('Total valid guesses increased by more than 15%.');
  return {
    currentRevision: current.manifest.revision,
    candidateRevision: candidate.manifest.revision,
    currentTotal,
    candidateTotal,
    totalDelta: candidateTotal - currentTotal,
    blockers,
    lengths,
  };
}
