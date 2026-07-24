import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const targetPath = path.join(root, '.codex-internal', 'evidence', 'preview-target.json');
let target;
try {
  target = JSON.parse(await readFile(targetPath, 'utf8'));
} catch {
  throw new Error(
    'Preview acceptance requires ignored .codex-internal/evidence/preview-target.json.',
  );
}

const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).trim();
const previewUrl = process.env.PLAYWRIGHT_BASE_URL;
const supabaseUrl = process.env.E2E_SUPABASE_URL;
const actual = {
  commit,
  previewUrl,
  supabaseProjectRef: supabaseUrl ? new URL(supabaseUrl).hostname.split('.')[0] : undefined,
  vercelProjectId: process.env.VERCEL_PROJECT_ID,
};
const errors = [];

for (const [key, value] of Object.entries(actual)) {
  if (!value || value !== target[key]) {
    errors.push(`${key} does not match the recorded preview target`);
  }
}
if (!previewUrl?.startsWith('https://') || new URL(previewUrl).hostname === 'amordle.vercel.app') {
  errors.push('PLAYWRIGHT_BASE_URL is not a non-production HTTPS Preview');
}
if (target.protected !== true) {
  errors.push('Preview protection is not recorded as verified');
}
if (target.migrationCount !== 42) {
  errors.push('the recorded migration count is not exactly 42');
}
for (const name of ['AMORDLE_ENABLE_REAL_SERVICE_E2E', 'AMORDLE_CLEANUP_AUTHORITY_VERIFIED']) {
  if (process.env[name] !== '1' || target.flags?.[name] !== '1') {
    errors.push(`${name} is not verified`);
  }
}

if (errors.length) {
  throw new Error(`Preview environment rejected: ${errors.join('; ')}.`);
}

console.log(
  JSON.stringify({
    commit,
    previewHost: new URL(previewUrl).hostname,
    supabaseProjectRef: actual.supabaseProjectRef,
    vercelProjectId: actual.vercelProjectId,
    protected: true,
    migrationCount: 42,
    releaseClass: 'development-preview',
    productionReady: false,
  }),
);
