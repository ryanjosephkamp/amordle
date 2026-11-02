import { readdirSync, readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const root = process.cwd();
const apiRoot = resolve(root, 'src/app/api');
const expected = [
  'src/app/api/admin-refresh/route.ts',
  'src/app/api/cron/refresh-word-lists/route.ts',
  'src/app/api/word-lists/manifest/route.ts',
];

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

const actual = files(apiRoot)
  .filter((path) => path.endsWith('/route.ts'))
  .map((path) => relative(root, path))
  .sort();

if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  throw new Error(
    `HTTP interface drift. Expected ${expected.join(', ')}, found ${actual.join(', ') || 'none'}.`,
  );
}

const methodMatrix = new Map([
  ['src/app/api/admin-refresh/route.ts', ['POST']],
  ['src/app/api/cron/refresh-word-lists/route.ts', ['GET']],
  ['src/app/api/word-lists/manifest/route.ts', ['GET']],
]);
for (const path of actual) {
  const source = readFileSync(resolve(root, path), 'utf8');
  const methods = [...source.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)]
    .map((match) => match[1])
    .sort();
  if (JSON.stringify(methods) !== JSON.stringify(methodMatrix.get(path))) {
    throw new Error(`${path} exports an unexpected HTTP method set: ${methods.join(', ')}`);
  }
}

process.stdout.write('PASS exactly three retained HTTP interfaces and methods\n');
