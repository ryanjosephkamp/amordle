import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = process.cwd();
const dist = resolve(root, 'dist');

function readRouteManifest(path) {
  const source = readFileSync(path, 'utf8');
  const marker = '= ';
  const start = source.lastIndexOf(marker);
  if (start < 0) throw new Error(`Cannot parse ${path}`);
  return JSON.parse(source.slice(start + marker.length).replace(/;\s*$/, ''));
}

function routeBytes(manifestPath, routeModule) {
  const manifest = readRouteManifest(manifestPath);
  const entry = manifest.entryJSFiles?.[routeModule] ?? [];
  const css = manifest.entryCSSFiles?.[routeModule]?.map((item) => item.path) ?? [];
  const gzipBytes = (files) =>
    [...new Set(files)].reduce((total, file) => {
      const path = resolve(dist, file.replace(/^\/?_next\//, ''));
      if (!existsSync(path)) throw new Error(`Missing emitted asset ${file}`);
      return total + gzipSync(readFileSync(path)).byteLength;
    }, 0);
  return { js: gzipBytes(entry), css: gzipBytes(css) };
}

const home = routeBytes(
  resolve(dist, 'server/app/page_client-reference-manifest.js'),
  '[project]/src/app/page',
);
const game = routeBytes(
  resolve(dist, 'server/app/play/solo/practice/[mode]/page_client-reference-manifest.js'),
  '[project]/src/app/play/solo/practice/[mode]/page',
);
const limits = {
  home: { js: 220 * 1024, css: 50 * 1024 },
  game: { js: 320 * 1024, css: 65 * 1024 },
};

for (const [name, measured] of Object.entries({ home, game })) {
  for (const kind of ['js', 'css']) {
    if (measured[kind] > limits[name][kind]) {
      throw new Error(
        `${name} ${kind.toUpperCase()} is ${measured[kind]} compressed bytes; budget is ${limits[name][kind]}`,
      );
    }
  }
}

const bootstrapWordBytes = statSync(
  resolve(root, 'bootstrap/source-data/word-lists/words_length_35.json'),
).size;
if (bootstrapWordBytes <= 0) throw new Error('Word-list fixture is empty.');
process.stdout.write(
  `PASS compressed budgets home ${home.js}B JS/${home.css}B CSS; game ${game.js}B JS/${game.css}B CSS\n`,
);
