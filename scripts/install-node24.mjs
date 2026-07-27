import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { arch, platform } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const version = '24.18.0';
const nodePlatform = platform();
const nodeArch = arch();
if (!['darwin', 'linux'].includes(nodePlatform) || !['arm64', 'x64'].includes(nodeArch)) {
  throw new Error(`Unsupported Node toolchain platform: ${nodePlatform}-${nodeArch}`);
}

const directoryName = `node-v${version}-${nodePlatform}-${nodeArch}`;
const tooling = resolve(process.cwd(), '.tooling');
const directory = resolve(tooling, directoryName);
const executable = resolve(directory, 'bin/node');

if (existsSync(executable)) {
  const check = spawnSync(executable, ['--version'], { encoding: 'utf8' });
  if (check.status === 0 && check.stdout.trim() === `v${version}`) {
    process.stdout.write(`Exact Node v${version} toolchain already available.\n`);
    process.exit(0);
  }
}
if (process.version === `v${version}`) {
  process.stdout.write(`System Node is exact v${version}; no local toolchain needed.\n`);
  process.exit(0);
}

mkdirSync(tooling, { recursive: true });
const archiveName = `${directoryName}.tar.xz`;
const archive = resolve(tooling, archiveName);
const distribution = `https://nodejs.org/dist/v${version}`;
const [archiveResponse, sumsResponse] = await Promise.all([
  fetch(`${distribution}/${archiveName}`),
  fetch(`${distribution}/SHASUMS256.txt`),
]);
if (!archiveResponse.ok || !sumsResponse.ok) {
  throw new Error('Could not download the pinned Node distribution authority.');
}
const archiveBytes = Buffer.from(await archiveResponse.arrayBuffer());
const sums = await sumsResponse.text();
const row = sums.split(/\r?\n/).find((line) => line.endsWith(`  ${archiveName}`));
if (!row) throw new Error(`No checksum was published for ${archiveName}.`);
const expected = row.slice(0, 64);
const actual = createHash('sha256').update(archiveBytes).digest('hex');
if (actual !== expected) throw new Error(`Node distribution checksum mismatch for ${archiveName}.`);

writeFileSync(archive, archiveBytes);
rmSync(directory, { recursive: true, force: true });
const extracted = spawnSync('tar', ['-xJf', archive, '-C', tooling], {
  stdio: 'inherit',
});
if (extracted.status !== 0) {
  throw new Error(`Could not extract ${archiveName}.`);
}
const check = spawnSync(executable, ['--version'], { encoding: 'utf8' });
if (check.status !== 0 || check.stdout.trim() !== `v${version}`) {
  throw new Error('The downloaded Node executable did not pass its version check.');
}
process.stdout.write(
  `Installed and verified exact Node v${version} for ${nodePlatform}-${nodeArch}.\n`,
);
