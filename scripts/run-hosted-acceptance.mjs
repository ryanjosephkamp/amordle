import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const progress = JSON.parse(readFileSync('progress/run_state.json', 'utf8'));
const baseURL = process.env.E2E_BASE_URL ?? progress.preview?.url;
if (!baseURL || !/^https:\/\//.test(baseURL)) {
  throw new Error('E2E_BASE_URL must identify the protected HTTPS Preview.');
}
const env = { ...process.env, E2E_BASE_URL: baseURL };
const localSecrets = {
  E2E_VERCEL_BYPASS_SECRET: '.codex-internal/evidence/operator/vercel-bypass-secret',
  SUPABASE_SERVICE_ROLE_KEY: '.codex-internal/evidence/operator/supabase-service-key',
  SUPABASE_ANON_KEY: '.codex-internal/evidence/operator/supabase-anon-key',
};
for (const [name, file] of Object.entries(localSecrets)) {
  if (!env[name] && existsSync(file)) env[name] = readFileSync(file, 'utf8').trim();
  if (!env[name]) throw new Error(`${name} is required for hosted acceptance.`);
}
const currentCommit = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
env.E2E_EXPECTED_COMMIT_SHA = env.E2E_EXPECTED_COMMIT_SHA ?? currentCommit;
if (env.E2E_EXPECTED_COMMIT_SHA !== currentCommit) {
  throw new Error('Hosted acceptance must target the exact checked-out commit.');
}

const commands = [
  ['pnpm', ['test:e2e:fixture']],
  ['pnpm', ['test:e2e:services']],
  ['pnpm', ['test:visual']],
];
for (const [command, args] of commands) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
process.stdout.write(
  `PASS hosted acceptance at ${new URL(baseURL).origin} for ${env.E2E_EXPECTED_COMMIT_SHA}\n`,
);
