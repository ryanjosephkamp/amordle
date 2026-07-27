import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const names = [
  'manifest.json',
  ...Array.from({ length: 34 }, (_, index) => `words_length_${index + 2}.json`),
];
for (const name of names) {
  const source = readFileSync(resolve(root, 'bootstrap/source-data/word-lists', name));
  const runtime = readFileSync(resolve(root, 'data/word-lists', name));
  if (sha256(source) !== sha256(runtime)) {
    throw new Error(`Runtime word-list asset drift: ${name}`);
  }
}
process.stdout.write('PASS 35/35 runtime word-list assets are byte-identical to authority\n');
