import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const migrationsDirectory = path.join(root, 'supabase', 'migrations');
const manifestPath = path.join(root, 'supabase', 'migrations.sha256');
const manifest = await readFile(manifestPath, 'utf8');
const expected = new Map(
  manifest
    .trim()
    .split('\n')
    .map((line) => {
      const [hash, relativePath] = line.trim().split(/\s{2,}/u);
      return [path.basename(relativePath), hash];
    }),
);
const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith('.sql')).sort();

if (files.length !== 42 || expected.size !== 42) {
  throw new Error(
    `Expected 42 migrations, found ${files.length} files and ${expected.size} hashes.`,
  );
}

for (const file of files) {
  const actual = createHash('sha256')
    .update(await readFile(path.join(migrationsDirectory, file)))
    .digest('hex');
  if (actual !== expected.get(file)) {
    throw new Error(`Migration checksum mismatch: ${file}`);
  }
}

console.log(`Verified ${files.length} immutable migration checksums.`);
