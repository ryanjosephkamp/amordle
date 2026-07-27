import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const source = resolve(root, 'bootstrap/source-data/word-lists');
const target = resolve(root, 'data/word-lists');
mkdirSync(target, { recursive: true });

const manifest = JSON.parse(readFileSync(resolve(source, 'manifest.json'), 'utf8'));
if (!manifest.revision || !Array.isArray(manifest.entries) || manifest.entries.length !== 34) {
  throw new Error('Source word-list manifest is invalid.');
}

copyFileSync(resolve(source, 'manifest.json'), resolve(target, 'manifest.json'));
for (let length = 2; length <= 35; length += 1) {
  const name = `words_length_${length}.json`;
  const raw = readFileSync(resolve(source, name), 'utf8');
  const bank = JSON.parse(raw);
  if (
    bank.metadata?.length !== length ||
    bank.metadata?.version !== manifest.revision ||
    !Array.isArray(bank.answers) ||
    !Array.isArray(bank.validGuesses)
  ) {
    throw new Error(`Source ${name} failed generation validation.`);
  }
  copyFileSync(resolve(source, name), resolve(target, name));
}
process.stdout.write('Generated 34 byte-identical runtime word-list assets.\n');
