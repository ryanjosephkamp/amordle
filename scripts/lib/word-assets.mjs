import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const WORD_LENGTHS = Object.freeze(Array.from({ length: 34 }, (_, index) => index + 2));
export const WORD_GENERATOR_VERSION = '2.0.0';
export const WORD_DATASET = 'ryanjosephkamp/english-openlist';
export const WORD_SCHEMA_VERSION = 2;
export const WORD_ASSET_TOTAL_LIMIT = 25 * 1024 * 1024;
export const WORD_ASSET_FILE_LIMIT = 5 * 1024 * 1024;
export const WORD_MANIFEST_LIMIT = 64 * 1024;

const wordPattern = /^[a-z]+$/;
const hashPattern = /^[a-f0-9]{64}$/;
const commitPattern = /^[a-f0-9]{40}$/;

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function stableJson(value) {
  return `${JSON.stringify(value)}\n`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeAnswer(value, length) {
  const word =
    typeof value === 'string'
      ? value
      : value && typeof value === 'object' && typeof value.word === 'string'
        ? value.word
        : null;
  assert(word && wordPattern.test(word), `Length ${length} contains an invalid answer.`);
  assert(word.length === length, `Length ${length} contains a mismatched answer.`);
  return word;
}

export function normalizeWordBank(source, length) {
  assert(Number.isInteger(length) && length >= 2 && length <= 35, 'Invalid word length.');
  assert(source && typeof source === 'object', `Length ${length} bank is not an object.`);
  const metadata = source.metadata && typeof source.metadata === 'object' ? source.metadata : {};
  const curation =
    source.curation && typeof source.curation === 'object'
      ? source.curation
      : metadata.curation && typeof metadata.curation === 'object'
        ? metadata.curation
        : {};
  const method = curation.method;
  const seed = curation.seed;
  const targetSampleSize = curation.targetSampleSize ?? curation.target_sample_size;
  assert(
    method === 'stratified_quality_score_v1',
    `Length ${length} uses an unexpected curation method.`,
  );
  assert(seed === 42 + length, `Length ${length} uses an unexpected curation seed.`);
  assert(
    Number.isInteger(targetSampleSize) && targetSampleSize > 0,
    `Length ${length} has an invalid target sample size.`,
  );
  assert(Array.isArray(source.answers), `Length ${length} answers are missing.`);
  assert(Array.isArray(source.validGuesses), `Length ${length} valid guesses are missing.`);
  const answers = source.answers.map((value) => normalizeAnswer(value, length));
  const validGuesses = source.validGuesses.map((value) => {
    assert(
      typeof value === 'string' && wordPattern.test(value) && value.length === length,
      `Length ${length} contains an invalid valid guess.`,
    );
    return value;
  });
  assert(answers.length > 0, `Length ${length} answer list is empty.`);
  assert(validGuesses.length > 0, `Length ${length} valid-guess list is empty.`);
  assert(new Set(answers).size === answers.length, `Length ${length} answers contain duplicates.`);
  assert(
    new Set(validGuesses).size === validGuesses.length,
    `Length ${length} valid guesses contain duplicates.`,
  );
  const guesses = new Set(validGuesses);
  assert(
    answers.every((word) => guesses.has(word)),
    `Length ${length} answers are not a subset of valid guesses.`,
  );
  assert(
    answers.length === Math.min(targetSampleSize, validGuesses.length),
    `Length ${length} answer count does not match its bounded target sample size.`,
  );
  return {
    schemaVersion: WORD_SCHEMA_VERSION,
    length,
    curation: {
      method,
      seed,
      targetSampleSize,
    },
    answers,
    validGuesses,
  };
}

function normalizeSource(source) {
  assert(source && typeof source === 'object', 'Word-list source provenance is missing.');
  assert(source.dataset === WORD_DATASET, 'Unexpected word-list dataset authority.');
  assert(commitPattern.test(source.upstreamCommit), 'Invalid upstream dataset commit.');
  assert(hashPattern.test(source.upstreamManifestSha256), 'Invalid upstream manifest SHA-256.');
  assert(/^\d{4}-\d{2}-\d{2}$/.test(source.releaseDate), 'Invalid upstream release date.');
  assert(source.license === 'MIT', 'Unexpected word-list license.');
  return {
    dataset: WORD_DATASET,
    upstreamCommit: source.upstreamCommit,
    upstreamManifestSha256: source.upstreamManifestSha256,
    releaseDate: source.releaseDate,
    license: 'MIT',
    generatorVersion: WORD_GENERATOR_VERSION,
  };
}

export function buildRuntimeAuthority(sourceBanks, options) {
  assert(
    options &&
      typeof options.generatedAt === 'string' &&
      !Number.isNaN(Date.parse(options.generatedAt)),
    'Word-list generation timestamp is invalid.',
  );
  const source = normalizeSource(options.source);
  const assets = new Map();
  const descriptor = [];
  for (const length of WORD_LENGTHS) {
    const bank = normalizeWordBank(sourceBanks.get(length), length);
    const raw = stableJson(bank);
    const bytes = Buffer.byteLength(raw);
    assert(bytes > 0 && bytes <= WORD_ASSET_FILE_LIMIT, `Length ${length} asset is out of bounds.`);
    const digest = sha256(raw);
    assets.set(length, raw);
    descriptor.push({
      length,
      answers: bank.answers.length,
      validGuesses: bank.validGuesses.length,
      bytes,
      sha256: digest,
    });
  }
  const revision = sha256(stableJson(descriptor));
  const entries = descriptor.map((entry) => ({
    ...entry,
    url: `/word-lists/${revision}/${entry.length}-${entry.sha256}.json`,
  }));
  const manifest = {
    schemaVersion: WORD_SCHEMA_VERSION,
    revision,
    generatedAt: new Date(options.generatedAt).toISOString(),
    source,
    entries,
  };
  return { manifest, assets };
}

export function validateRuntimeAuthority(root) {
  const manifestPath = resolve(root, 'manifest.json');
  const manifestRaw = readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestRaw);
  assert(manifest?.schemaVersion === WORD_SCHEMA_VERSION, 'Runtime manifest schema is invalid.');
  assert(hashPattern.test(manifest.revision), 'Runtime manifest revision is invalid.');
  assert(!Number.isNaN(Date.parse(manifest.generatedAt)), 'Runtime generatedAt is invalid.');
  const source = normalizeSource(manifest.source);
  assert(
    manifest.source.generatorVersion === WORD_GENERATOR_VERSION,
    'Runtime generator version is invalid.',
  );
  assert(
    Array.isArray(manifest.entries) && manifest.entries.length === 34,
    'Runtime entries fail.',
  );
  const sourceBanks = new Map();
  const rawAssets = new Map();
  for (const length of WORD_LENGTHS) {
    const name = `words_length_${length}.json`;
    const raw = readFileSync(resolve(root, name), 'utf8');
    assert(Buffer.byteLength(raw) <= WORD_ASSET_FILE_LIMIT, `${name} is out of bounds.`);
    const parsed = normalizeWordBank(JSON.parse(raw), length);
    assert(raw === stableJson(parsed), `${name} is not canonical JSON.`);
    sourceBanks.set(length, parsed);
    rawAssets.set(length, raw);
  }
  const rebuilt = buildRuntimeAuthority(sourceBanks, {
    generatedAt: manifest.generatedAt,
    source,
  });
  assert(
    stableJson(rebuilt.manifest) === stableJson(manifest),
    'Runtime manifest does not match its assets.',
  );
  for (const length of WORD_LENGTHS) {
    assert(rebuilt.assets.get(length) === rawAssets.get(length), `Length ${length} drifted.`);
  }
  return { manifest, assets: rawAssets };
}

function assertExactChild(root, candidate) {
  const expected = resolve(root);
  const resolved = resolve(candidate);
  assert(resolved === expected, `Refusing filesystem mutation outside ${expected}.`);
  return resolved;
}

export function writeAuthorityDirectory(target, authority) {
  const resolvedTarget = resolve(target);
  const parent = dirname(resolvedTarget);
  mkdirSync(parent, { recursive: true });
  const nonce = `${process.pid}-${Date.now()}`;
  const candidate = `${resolvedTarget}.candidate-${nonce}`;
  const backup = `${resolvedTarget}.backup-${nonce}`;
  mkdirSync(candidate, { recursive: false });
  let movedExisting = false;
  try {
    writeFileSync(join(candidate, 'manifest.json'), stableJson(authority.manifest));
    for (const length of WORD_LENGTHS) {
      writeFileSync(join(candidate, `words_length_${length}.json`), authority.assets.get(length));
    }
    validateRuntimeAuthority(candidate);
    if (statSync(resolvedTarget, { throwIfNoEntry: false })) {
      renameSync(resolvedTarget, backup);
      movedExisting = true;
    }
    renameSync(candidate, resolvedTarget);
    validateRuntimeAuthority(resolvedTarget);
    if (movedExisting) rmSync(assertExactChild(backup, backup), { recursive: true });
  } catch (error) {
    if (statSync(candidate, { throwIfNoEntry: false })) {
      rmSync(assertExactChild(candidate, candidate), { recursive: true });
    }
    if (movedExisting && !statSync(resolvedTarget, { throwIfNoEntry: false })) {
      renameSync(backup, resolvedTarget);
    }
    throw error;
  }
}

export function preparePublicAssets(runtimeRoot, publicRoot) {
  const { manifest, assets } = validateRuntimeAuthority(runtimeRoot);
  const resolvedPublic = assertExactChild(resolve(publicRoot), publicRoot);
  rmSync(resolvedPublic, { recursive: true, force: true });
  const revisionRoot = join(resolvedPublic, manifest.revision);
  mkdirSync(revisionRoot, { recursive: true });
  for (const entry of manifest.entries) {
    writeFileSync(
      join(revisionRoot, `${entry.length}-${entry.sha256}.json`),
      assets.get(entry.length),
    );
  }
  return manifest;
}

export function runtimeSize(root) {
  return WORD_LENGTHS.reduce(
    (total, length) => total + statSync(resolve(root, `words_length_${length}.json`)).size,
    statSync(resolve(root, 'manifest.json')).size,
  );
}
