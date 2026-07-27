import { spawnSync } from 'node:child_process';

const baseURL = process.env.E2E_BASE_URL;
if (!baseURL || !/^https:\/\//.test(baseURL)) {
  throw new Error('E2E_BASE_URL must identify the protected HTTPS Preview.');
}

const commands = [
  ['pnpm', ['test:e2e:fixture']],
  ['pnpm', ['test:e2e:services']],
  ['pnpm', ['test:visual']],
];
for (const [command, args] of commands) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
process.stdout.write(`PASS hosted acceptance at ${new URL(baseURL).origin}\n`);
