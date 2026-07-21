import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const tracked = await new Promise((resolve, reject) => {
  import('node:child_process').then(({ execFile }) => {
    execFile('git', ['ls-files'], { cwd: root }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout.trim().split('\n').filter(Boolean));
    });
  });
});

for (const file of tracked) {
  if (file.startsWith('bootstrap/') || file.startsWith('.codex-internal/')) {
    throw new Error(`Private authority material is tracked: ${file}`);
  }
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      return entry.isDirectory() ? sourceFiles(fullPath) : [fullPath];
    }),
  );
  return nested.flat();
}

const browserFiles = await sourceFiles(path.join(root, 'src'));
const forbidden = [
  'E2E_SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_DB_PASSWORD',
  'BLOB_READ_WRITE_TOKEN',
  'CRON_SECRET',
];

for (const file of browserFiles) {
  const content = await readFile(file, 'utf8');
  for (const token of forbidden) {
    if (content.includes(token))
      throw new Error(`Server-only token name ${token} found in ${file}`);
  }
}

console.log('Verified tracked/private and browser/server boundaries.');
