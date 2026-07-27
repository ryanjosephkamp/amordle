import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const manifestPath = resolve(root, 'bootstrap/BUNDLE-MANIFEST.json');
const ledgerPath = resolve(root, 'supabase/migrations.sha256');
const expectedLedgerHash = 'f73fc5e4260585a93035c4dc2b5bb9216d5576124c55f652d4a66b1369fd14bf';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const failures = [];

if (!existsSync(manifestPath)) {
  failures.push('bootstrap manifest is missing');
} else {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const entry of manifest.files) {
    const path = resolve(root, entry.path);
    if (!existsSync(path)) {
      failures.push(`missing baseline file: ${entry.path}`);
      continue;
    }
    const actual = sha256(readFileSync(path));
    if (actual !== entry.sha256) {
      failures.push(`baseline hash mismatch: ${entry.path}`);
    }
  }
  if (!failures.length) {
    process.stdout.write(
      `PASS immutable bootstrap baseline ${manifest.files.length}/${manifest.files.length}\n`,
    );
  }
}

if (!existsSync(ledgerPath)) {
  failures.push('migration ledger is missing');
} else if (sha256(readFileSync(ledgerPath)) !== expectedLedgerHash) {
  failures.push('migration ledger hash mismatch');
}

const migrationsDirectory = resolve(root, 'supabase/migrations');
const migrations = readdirSync(migrationsDirectory)
  .filter((name) => name.endsWith('.sql'))
  .sort();
const rows = readFileSync(ledgerPath, 'utf8')
  .trim()
  .split('\n')
  .map((line) => line.match(/^([a-f0-9]{64})  migrations\/(.+\.sql)$/))
  .filter(Boolean);

if (migrations.length !== 45 || rows.length !== 45) {
  failures.push('migration count or ledger row count is not 45');
}

for (const [, expected, name] of rows) {
  const path = resolve(migrationsDirectory, name);
  if (!existsSync(path) || sha256(readFileSync(path)) !== expected) {
    failures.push(`migration hash mismatch: ${name}`);
  }
}

if (!failures.some((failure) => failure.includes('migration'))) {
  process.stdout.write('PASS immutable migrations 45/45\n');
}

if (failures.length) {
  process.stderr.write(
    `Bootstrap baseline verification failed:\n${failures
      .map((failure) => `- ${failure}`)
      .join('\n')}\n`,
  );
  process.exit(1);
}
