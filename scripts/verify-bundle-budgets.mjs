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

const wordManifest = JSON.parse(
  readFileSync(resolve(root, 'data/word-lists/manifest.json'), 'utf8'),
);
if (wordManifest.entries?.length !== 34) {
  throw new Error('Deployment word authority does not contain all 34 lengths.');
}
let deploymentWordBytes = statSync(resolve(root, 'data/word-lists/manifest.json')).size;
for (const entry of wordManifest.entries) {
  const runtimePath = resolve(root, `data/word-lists/words_length_${entry.length}.json`);
  const publicPath = resolve(root, `public${entry.url}`);
  if (!existsSync(runtimePath) || !existsSync(publicPath)) {
    throw new Error(`Word-list length ${entry.length} is missing from a build authority.`);
  }
  if (statSync(runtimePath).size !== entry.bytes || statSync(publicPath).size !== entry.bytes) {
    throw new Error(`Word-list length ${entry.length} has an unexpected emitted size.`);
  }
  deploymentWordBytes += entry.bytes;
}
if (deploymentWordBytes > 25 * 1024 * 1024) {
  throw new Error(`Deployment word authority is ${deploymentWordBytes} bytes; budget is 25 MiB.`);
}
const representativeTransfers = Object.fromEntries(
  [5, 7, 10].map((length) => {
    const entry = wordManifest.entries.find((candidate) => candidate.length === length);
    const raw = readFileSync(resolve(root, `data/word-lists/words_length_${length}.json`));
    return [length, { raw: entry.bytes, gzip: gzipSync(raw).byteLength }];
  }),
);
process.stdout.write(
  `PASS compressed budgets home ${home.js}B JS/${home.css}B CSS; game ${game.js}B JS/${game.css}B CSS; deployment words ${deploymentWordBytes}B; transfers ${JSON.stringify(representativeTransfers)}\n`,
);
