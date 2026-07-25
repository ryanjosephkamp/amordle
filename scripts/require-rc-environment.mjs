import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const targetPath = path.join(root, '.codex-internal', 'evidence', 'rc-target.json');
let target;
try {
  target = JSON.parse(await readFile(targetPath, 'utf8'));
} catch {
  throw new Error('RC acceptance requires ignored .codex-internal/evidence/rc-target.json.');
}

const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const preview = process.env.PLAYWRIGHT_BASE_URL;
const supabaseUrl = process.env.E2E_SUPABASE_URL;
const actual = {
  commit: head,
  previewUrl: preview,
  supabaseProjectRef: supabaseUrl ? new URL(supabaseUrl).hostname.split('.')[0] : undefined,
  vercelProjectId: process.env.VERCEL_PROJECT_ID,
  previewBlobStoreId: process.env.AMORDLE_PREVIEW_BLOB_STORE_ID,
};

const requiredFlags = [
  'AMORDLE_ENABLE_REAL_SERVICE_E2E',
  'AMORDLE_ENABLE_HOSTED_API_E2E',
  'AMORDLE_CLEANUP_AUTHORITY_VERIFIED',
];
const errors = [];
for (const [key, value] of Object.entries(actual)) {
  if (!value || value !== target[key]) errors.push(`${key} does not match the recorded RC target`);
}
for (const name of requiredFlags) {
  if (process.env[name] !== '1' || target.flags?.[name] !== '1')
    errors.push(`${name} is not verified`);
}
if (!preview?.startsWith('https://') || new URL(preview).hostname === 'amordle.vercel.app') {
  errors.push('PLAYWRIGHT_BASE_URL is not a non-production HTTPS preview');
}
if (target.protected !== true) errors.push('preview protection is not recorded as verified');
if (target.migrationCount !== 45) errors.push('the recorded migration count is not 45');

if (errors.length) throw new Error(`RC environment rejected: ${errors.join('; ')}.`);
console.log(
  JSON.stringify({
    commit: head,
    previewHost: new URL(preview).hostname,
    supabaseProjectRef: actual.supabaseProjectRef,
    vercelProjectId: actual.vercelProjectId,
    previewBlobStoreId: actual.previewBlobStoreId,
    protected: true,
    migrationCount: 45,
    serviceLayers: 'required',
  }),
);
