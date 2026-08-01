import { existsSync, readFileSync } from 'node:fs';

const contract = readFileSync('bootstrap/FUNCTIONAL-CONTRACT.md', 'utf8');
const audit = JSON.parse(readFileSync('acceptance/mp-v6-clause-audit.json', 'utf8'));
const expected = [...contract.matchAll(/^- (MP-\d{2}\.[a-z]): /gm)].map((match) => match[1]);
const rows = audit.requirements ?? [];
const failures = [];
const hostedSpec = readFileSync('tests/e2e/services.combat.spec.ts', 'utf8');
const statuses = new Set([
  'proven',
  'implemented-unproven',
  'partial-defective',
  'missing',
  'migration-blocked',
]);

if (audit.requirementCount !== 73 || rows.length !== 73) {
  failures.push(`expected 73 rows, found ${rows.length}`);
}
if (JSON.stringify(rows.map((row) => row.requirementId)) !== JSON.stringify(expected)) {
  failures.push('MP requirement order or membership differs from the functional contract');
}
for (const row of rows) {
  if (!statuses.has(row.status)) failures.push(`${row.requirementId} has invalid status`);
  for (const field of [
    'frontendEntryPoint',
    'controllerDomainOwner',
    'adapterRpcTableAuthority',
    'relevantMigrations',
    'automatedEvidence',
    'hostedEvidence',
  ]) {
    if (!Array.isArray(row[field])) failures.push(`${row.requirementId} ${field} is not an array`);
  }
  if (
    !row.actualEvidence ||
    !row.knownDefectOrMissingProof ||
    !row.proposedImplementationOrTestWork ||
    typeof row.schemaChangeRequired !== 'boolean'
  ) {
    failures.push(`${row.requirementId} is missing decision-complete audit fields`);
  }
  if (row.status === 'proven' && (!row.automatedEvidence.length || !row.hostedEvidence.length)) {
    failures.push(`${row.requirementId} is proven without exact automated and hosted evidence`);
  }
  if (row.status === 'proven') {
    for (const evidence of row.automatedEvidence) {
      const separator = evidence.indexOf('::');
      if (separator < 1) {
        failures.push(`${row.requirementId} has a malformed automated evidence id`);
        continue;
      }
      const path = evidence.slice(0, separator);
      const testName = evidence.slice(separator + 2);
      if (!existsSync(path) || !readFileSync(path, 'utf8').includes(testName)) {
        failures.push(`${row.requirementId} references missing automated evidence ${evidence}`);
      }
    }
    for (const scenario of row.hostedEvidence) {
      if (!hostedSpec.includes(scenario)) {
        failures.push(`${row.requirementId} references missing hosted evidence ${scenario}`);
      }
    }
  }
}

if (failures.length) {
  throw new Error(`MP v6 audit failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
}
process.stdout.write('PASS truthful MP v6 clause audit 73/73\n');
