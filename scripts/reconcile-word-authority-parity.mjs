import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const registryPath = resolve(process.cwd(), 'acceptance/parity-registry.json');
const registry = JSON.parse(readFileSync(registryPath, 'utf8'));

const evidence = {
  'GAME-11.a': [
    'SERVER-WORD-ASSETS',
    'E2E-FIXTURE-HOME-NO-WORDS',
    'E2E-FIXTURE-WORD-SELECTED-LENGTH',
  ],
  'GAME-11.b': ['SERVER-WORD-ASSETS', 'BROWSER-WORD-INTEGRITY', 'E2E-DEPLOYMENT-WORD-HASH'],
  'GAME-11.c': ['STATIC-BOUNDARY', 'E2E-DEPLOYMENT-WORD-PRIVACY'],
  'GAME-11.d': ['VERIFY-WORD-ASSETS', 'WORD-UPDATER-IDEMPOTENCY', 'E2E-DEPLOYMENT-WORD-HASH'],
  'GAME-11.e': ['BROWSER-WORD-INTEGRITY', 'E2E-FIXTURE-WORD-OFFLINE', 'PWA-CACHE-BOUNDARY'],
  'SUP-02.a': ['E2E-FIXTURE-WORD-EXPLORER', 'BROWSER-WORD-RESULTS'],
  'SUP-02.b': ['E2E-FIXTURE-WORD-SELECTED-LENGTH', 'SERVER-WORD-ASSETS'],
  'SUP-02.c': ['E2E-FIXTURE-WORD-EXPLORER', 'E2E-DEPLOYMENT-WORD-PRIVACY'],
  'SUP-02.d': ['BROWSER-WORD-INTEGRITY', 'E2E-FIXTURE-ROUTES'],
  'SUP-05.a': ['E2E-SERVICES-ADMIN-AUTHORIZATION', 'HTTP-INTERFACE-MATRIX'],
  'SUP-05.b': ['E2E-SERVICES-WORD-FRESHNESS', 'WORD-UPDATER-IDEMPOTENCY'],
  'SUP-05.c': ['E2E-SERVICES-ADMIN-AUTHORIZATION', 'DB-RLS-CONTRACT'],
  'SUP-06.a': ['VERIFY-WORD-ASSETS', 'WORD-UPDATER-IDEMPOTENCY'],
  'SUP-06.b': ['E2E-SERVICES-WORD-FRESHNESS', 'BROWSER-ADMIN-FRESHNESS'],
  'SUP-06.c': ['VERIFY-WORD-ASSETS', 'WORD-UPDATER-IDEMPOTENCY'],
};

let reconciled = 0;
for (const requirement of registry.requirements) {
  const automatedTestIds = evidence[requirement.requirementId];
  if (!automatedTestIds) continue;
  requirement.automatedTestIds = automatedTestIds;
  requirement.hostedScenarioIds = ['PREVIEW-DEPLOYMENT-WORD-AUTHORITY'];
  requirement.cleanupEvidence = ['DEPLOYMENT-ASSET-NONMUTATING', 'RESOURCE-LEDGER-ZERO-RESIDUE'];
  reconciled += 1;
}

if (reconciled !== Object.keys(evidence).length) {
  throw new Error(
    `Expected to reconcile ${Object.keys(evidence).length} word-authority clauses, updated ${reconciled}.`,
  );
}

writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
process.stdout.write(`Reconciled ${reconciled} word-authority parity rows.\n`);
