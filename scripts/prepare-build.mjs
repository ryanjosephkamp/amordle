import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

// A prior `next dev` run can leave large Turbopack caches under the custom
// local dist directory. Vercel's prebuilt packager otherwise treats those
// development-only files as deployable static output. Remove only that
// generated subtree before the production build begins.
rmSync(resolve(root, 'dist/dev'), { force: true, recursive: true });

await import('./prepare-public-word-assets.mjs');
