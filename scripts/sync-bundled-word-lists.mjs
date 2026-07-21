import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const manifestUrl =
  process.env.BUNDLED_MANIFEST_URL ?? 'https://amordle.vercel.app/api/word-lists/manifest';
const outputDirectory = path.join(process.cwd(), 'public', 'word-lists', 'bundled');
const supportedLengths = Array.from({ length: 34 }, (_, index) => index + 2);

function assertWordPayload(payload, length, expected) {
  if (!payload || !Array.isArray(payload.answers) || !Array.isArray(payload.validGuesses)) {
    throw new Error(`Length ${length} payload is missing answer or valid-guess arrays.`);
  }
  if (
    payload.answers.length !== expected.answers ||
    payload.validGuesses.length !== expected.validGuesses
  ) {
    throw new Error(`Length ${length} counts do not match the public manifest.`);
  }
  const wordPattern = new RegExp(`^[a-z]{${length}}$`, 'u');
  for (const record of [...payload.answers, ...payload.validGuesses]) {
    const word = typeof record === 'string' ? record : record?.word;
    if (typeof word !== 'string' || !wordPattern.test(word)) {
      throw new Error(`Length ${length} contains an invalid normalized word record.`);
    }
  }
}

const response = await fetch(manifestUrl, { headers: { accept: 'application/json' } });
if (!response.ok) throw new Error(`Manifest fetch failed with HTTP ${response.status}.`);
const envelope = await response.json();
const manifest = envelope.manifest;
if (!manifest || !Array.isArray(manifest.entries))
  throw new Error('Public manifest is unavailable.');

const entriesByLength = new Map(manifest.entries.map((entry) => [entry.length, entry]));
for (const length of supportedLengths) {
  const entry = entriesByLength.get(length);
  if (!entry || entry.status !== 'served' || !entry.url?.startsWith('https://')) {
    throw new Error(`Manifest does not serve required length ${length}.`);
  }
}

await mkdir(outputDirectory, { recursive: true });
for (let offset = 0; offset < supportedLengths.length; offset += 4) {
  await Promise.all(
    supportedLengths.slice(offset, offset + 4).map(async (length) => {
      const entry = entriesByLength.get(length);
      const wordResponse = await fetch(entry.url, { headers: { accept: 'application/json' } });
      if (!wordResponse.ok)
        throw new Error(`Length ${length} fetch failed: ${wordResponse.status}.`);
      const payload = await wordResponse.json();
      assertWordPayload(payload, length, entry);
      await writeFile(
        path.join(outputDirectory, `words_length_${length}.json`),
        `${JSON.stringify(payload)}\n`,
      );
    }),
  );
}

const bundledManifest = {
  ...manifest,
  source: { ...manifest.source, bundledFrom: manifestUrl },
  entries: supportedLengths.map((length) => {
    const entry = entriesByLength.get(length);
    return { ...entry, url: `/word-lists/bundled/words_length_${length}.json` };
  }),
};
await writeFile(
  path.join(outputDirectory, 'manifest.json'),
  `${JSON.stringify(bundledManifest, null, 2)}\n`,
);

console.log(`Bundled and validated ${supportedLengths.length} lazy word-list payloads.`);
