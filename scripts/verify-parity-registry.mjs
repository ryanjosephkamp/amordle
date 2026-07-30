import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const contract = readFileSync(resolve(root, 'bootstrap/FUNCTIONAL-CONTRACT.md'), 'utf8');
const registry = JSON.parse(readFileSync(resolve(root, 'acceptance/parity-registry.json'), 'utf8'));
const expectedIds = [...contract.matchAll(/^- ((?:APP|GAME|ACC|MP|SUP)-\d{2}\.[a-z]): /gm)].map(
  (match) => match[1],
);
const rows = registry.requirements ?? [];
const failures = [];
const requireVerified = process.argv.includes('--require-verified');

if (registry.requirementCount !== 237 || rows.length !== 237) {
  failures.push(`expected 237 rows, found ${rows.length}`);
}
if (new Set(rows.map((row) => row.requirementId)).size !== 237) {
  failures.push('requirement IDs are not unique');
}
if (JSON.stringify(rows.map((row) => row.requirementId)) !== JSON.stringify(expectedIds)) {
  failures.push('requirement order or membership differs from the functional contract');
}

for (const row of rows) {
  if (!row.implementationOwner || !row.routeInterface) {
    failures.push(`${row.requirementId} has no implementation owner or interface`);
  }
  if (
    !Array.isArray(row.automatedTestIds) ||
    (row.status === 'verified' && row.automatedTestIds.length === 0)
  ) {
    failures.push(`${row.requirementId} has no automated evidence`);
  }
  if (!['implemented', 'verified'].includes(row.status)) {
    failures.push(`${row.requirementId} is not implemented`);
  }
  if (row.blocker) failures.push(`${row.requirementId} has blocker: ${row.blocker}`);
  if (requireVerified && row.status !== 'verified') {
    failures.push(`${row.requirementId} is not acceptance-verified`);
  }
}

if (failures.length) {
  throw new Error(
    `Parity registry failed with ${failures.length} issue(s):\n${failures
      .slice(0, 40)
      .map((failure) => `- ${failure}`)
      .join('\n')}`,
  );
}
process.stdout.write(
  requireVerified
    ? 'PASS 237/237 ordered atomic clauses are acceptance-verified\n'
    : 'PASS 237/237 ordered atomic clauses have truthful implementation/evidence status\n',
);
