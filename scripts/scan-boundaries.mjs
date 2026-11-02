import { readFileSync, readdirSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';

const root = process.cwd();
const sourceRoot = resolve(root, 'src');
const textExtensions = new Set(['.ts', '.tsx', '.js', '.mjs']);

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

const failures = [];
for (const path of files(sourceRoot).filter((candidate) =>
  textExtensions.has(extname(candidate)),
)) {
  const source = readFileSync(path, 'utf8');
  const projectPath = relative(root, path);
  const client = /^\s*['"]use client['"];?/m.test(source);
  if (client && /from\s+['"]@\/server\//.test(source)) {
    failures.push(`${projectPath} imports a server module from a client boundary`);
  }
  if (
    client &&
    /\b(process\.env\.(?!(?:NODE_ENV|NEXT_PUBLIC_[A-Z0-9_]+)\b)|SUPABASE_SERVICE_ROLE_KEY|CRON_SECRET)\b/.test(
      source,
    )
  ) {
    failures.push(`${projectPath} reads server-only configuration from a client boundary`);
  }
  if (/^\s*['"]use server['"];?/m.test(source)) {
    failures.push(`${projectPath} introduces an unauthorized Server Action boundary`);
  }
  if (
    /@vercel\/blob|blob\.vercel-storage\.com|BLOB_READ_WRITE_TOKEN|\/storage\/v1\/.*word-list/i.test(
      source,
    )
  ) {
    failures.push(`${projectPath} retains a forbidden runtime word-storage dependency`);
  }
}

const publicFiles = files(resolve(root, 'public'));
for (const path of publicFiles) {
  const source = readFileSync(path);
  const text = source.toString('utf8');
  if (
    /SUPABASE_SERVICE_ROLE_KEY|CRON_SECRET|BLOB_READ_WRITE_TOKEN|BEGIN (RSA |EC )?PRIVATE KEY/.test(
      text,
    )
  ) {
    failures.push(`${relative(root, path)} contains a server-secret marker`);
  }
}

if (failures.length) {
  throw new Error(`Boundary scan failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
}
process.stdout.write('PASS server/browser, Server Action, public-secret, and API boundaries\n');
