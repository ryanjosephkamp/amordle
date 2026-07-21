import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const root = process.cwd();
const dist = path.join(root, 'dist');
const index = await readFile(path.join(dist, 'index.html'), 'utf8');
const entryScripts = [...index.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
const entryStyles = [...index.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map((match) => match[1]);

if (entryScripts.length === 0) throw new Error('No initial JavaScript entry was found.');

async function gzipBytes(relativeUrl) {
  const file = path.join(dist, relativeUrl.replace(/^\//, ''));
  return gzipSync(await readFile(file)).byteLength;
}

const initialJavaScript = (await Promise.all(entryScripts.map((entry) => gzipBytes(entry)))).reduce(
  (total, bytes) => total + bytes,
  0,
);
const initialCss = (await Promise.all(entryStyles.map((entry) => gzipBytes(entry)))).reduce(
  (total, bytes) => total + bytes,
  0,
);

const limits = { initialJavaScript: 200 * 1024, initialCss: 60 * 1024 };
if (initialJavaScript > limits.initialJavaScript)
  throw new Error(`Initial JavaScript is ${initialJavaScript} bytes gzip; limit is 204800.`);
if (initialCss > limits.initialCss)
  throw new Error(`Initial CSS is ${initialCss} bytes gzip; limit is 61440.`);

for (const required of ['manifest.webmanifest', 'sw.js']) {
  if ((await stat(path.join(dist, required))).size === 0)
    throw new Error(`${required} was not generated.`);
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) => {
        const target = path.join(directory, entry.name);
        return entry.isDirectory() ? walk(target) : target;
      }),
    )
  ).flat();
}

const shipped = await walk(dist);
for (const file of shipped) {
  const relative = path.relative(dist, file);
  if (/\bL(?:0[1-9]|[1-5]\d|6[0-4])\.(?:png|jpe?g|webp)$/i.test(relative))
    throw new Error(`Private gallery image entered the build: ${relative}`);
}

console.log(
  JSON.stringify({
    initialJavaScriptGzipBytes: initialJavaScript,
    initialCssGzipBytes: initialCss,
    pwa: ['manifest.webmanifest', 'sw.js'],
    privateGalleryImages: 0,
  }),
);
