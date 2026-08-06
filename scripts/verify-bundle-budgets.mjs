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

/*
 * Turbopack prefixes every manifest key with `[project]`, which it resolves to the
 * inferred project root — the directory of the nearest lockfile walking up, not the
 * repository root. A stray lockfile in a parent directory therefore shifts every key
 * (`[project]/src/app/page` becomes `[project]/amordle-final/src/app/page`). Matching
 * the module suffix instead of the whole key keeps the lookup correct under either
 * root, and an unresolvable or ambiguous key is a hard failure rather than a silent
 * `?? []` that would report a vacuous 0B and pass every budget.
 */
function resolveEntryKey(manifest, moduleSuffix) {
  const keys = Object.keys(manifest.entryJSFiles ?? {}).filter((key) =>
    key.endsWith(`/${moduleSuffix}`),
  );
  if (keys.length !== 1) {
    throw new Error(
      `Expected exactly one manifest entry ending in ${moduleSuffix}; found ${keys.length}`,
    );
  }
  return keys[0];
}

function routeBytes(manifestPath, routeModule) {
  const manifest = readRouteManifest(manifestPath);
  // First load is the root layout plus the route segment. Next currently propagates the
  // layout's assets into the page entry, so the union is a no-op today; taking it anyway
  // keeps the measurement meaning "what the browser downloads for this route" if that
  // propagation ever changes.
  const keys = [
    resolveEntryKey(manifest, 'src/app/layout'),
    resolveEntryKey(manifest, routeModule),
  ];
  const collect = (field) =>
    keys.flatMap((key) => (manifest[field]?.[key] ?? []).map((item) => item.path ?? item));
  const gzipBytes = (files) =>
    [...new Set(files)].reduce((total, file) => {
      const path = resolve(dist, file.replace(/^\/?_next\//, ''));
      if (!existsSync(path)) throw new Error(`Missing emitted asset ${file}`);
      return total + gzipSync(readFileSync(path)).byteLength;
    }, 0);
  const js = gzipBytes(collect('entryJSFiles'));
  const css = gzipBytes(collect('entryCSSFiles'));
  if (js === 0 || css === 0) {
    throw new Error(
      `Measured 0B for ${routeModule}; the manifest lookup is not measuring anything`,
    );
  }
  return { js, css };
}

const home = routeBytes(
  resolve(dist, 'server/app/page_client-reference-manifest.js'),
  'src/app/page',
);
const game = routeBytes(
  resolve(dist, 'server/app/play/solo/practice/[mode]/page_client-reference-manifest.js'),
  'src/app/play/solo/practice/[mode]/page',
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
