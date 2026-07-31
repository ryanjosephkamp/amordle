import { resolve } from 'node:path';
import { preparePublicAssets } from './lib/word-assets.mjs';

const root = process.cwd();
const manifest = preparePublicAssets(
  resolve(root, 'data/word-lists'),
  resolve(root, 'public/word-lists'),
);
process.stdout.write(
  `Prepared ${manifest.entries.length} content-addressed public word assets for ${manifest.revision}.\n`,
);
