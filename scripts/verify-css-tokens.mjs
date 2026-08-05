import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const stylesheets = [
  'src/app/globals.css',
  'src/app/tui-shell.css',
  'src/features/solo/solo-game.css',
];

// Custom properties that are never declared in CSS because a runtime supplies them.
// Everything else must be declared in one of the stylesheets above.
const runtimeProvided = new Set([
  // next/font injects these on <html> via GeistSans.variable / GeistMono.variable.
  '--font-geist-sans',
  '--font-geist-mono',
]);
const runtimePrefixes = [
  // accentCssVariableMap() sets these on document.documentElement for custom accents.
  '--custom-',
  // Set inline per element for public profile and directory accents.
  '--profile-accent',
];

const declarationPattern = /(^|[;{]|\*\/)\s*(--[a-zA-Z0-9-]+)\s*:/g;
// A `var()` with a fallback stays valid when the property is undeclared, so only a
// fallback-less reference can invalidate its declaration.
const referencePattern = /var\(\s*(--[a-zA-Z0-9-]+)\s*([,)])/g;

const declared = new Set(runtimeProvided);
const referenced = new Map();

for (const relativePath of stylesheets) {
  const source = readFileSync(resolve(root, relativePath), 'utf8');
  for (const match of source.matchAll(declarationPattern)) {
    declared.add(match[2]);
  }
  for (const match of source.matchAll(referencePattern)) {
    const [, name, delimiter] = match;
    if (delimiter !== ')') continue;
    if (!referenced.has(name)) referenced.set(name, new Set());
    referenced.get(name).add(relativePath);
  }
}

const undeclared = [...referenced.keys()]
  .filter((name) => !declared.has(name))
  .filter((name) => !runtimePrefixes.some((prefix) => name.startsWith(prefix)))
  .sort();

if (undeclared.length > 0) {
  const detail = undeclared
    .map((name) => `  ${name} referenced in ${[...referenced.get(name)].sort().join(', ')}`)
    .join('\n');
  throw new Error(
    'Undefined CSS custom properties. A var() reference with no declaration makes the whole ' +
      'declaration invalid at computed-value time, so the property silently falls back to its ' +
      `initial value:\n${detail}`,
  );
}

process.stdout.write(
  `PASS ${referenced.size} fallback-less CSS custom properties all resolve across ${stylesheets.length} stylesheets\n`,
);
