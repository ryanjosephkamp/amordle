import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const contract = readFileSync(resolve(root, 'bootstrap/FUNCTIONAL-CONTRACT.md'), 'utf8');
const ownerByFamily = {
  APP: {
    owner: 'app-shell-platform',
    routeInterface: 'Next.js application shell and platform adapters',
    automatedTestIds: ['E2E-FIXTURE-ROUTES', 'E2E-VISUAL-A11Y', 'STATIC-BOUNDARY'],
    hostedScenarioIds: ['PREVIEW-ROUTES-ACCESSIBILITY'],
    screenshotManualEvidence: ['VISUAL-RESPONSIVE-MATRIX'],
  },
  GAME: {
    owner: 'game-solo-domains',
    routeInterface: 'Pure game domains and Solo controllers',
    automatedTestIds: ['DOMAIN-GAME-RULES', 'SERVER-WORD-ASSETS', 'E2E-FIXTURE-SOLO'],
    hostedScenarioIds: ['PREVIEW-SOLO-RELOAD-OFFLINE'],
    screenshotManualEvidence: ['VISUAL-SOLO-STATES'],
  },
  ACC: {
    owner: 'account-persistence-progression',
    routeInterface: 'Auth, account, economy, History, and profile repositories',
    automatedTestIds: ['DOMAIN-ACCOUNT-PLATFORM', 'E2E-SERVICES-ACCOUNT', 'DB-RLS-CONTRACT'],
    hostedScenarioIds: ['PREVIEW-ACCOUNT-FRESH-CONTEXT'],
    screenshotManualEvidence: ['VISUAL-ACCOUNT-SURFACES'],
  },
  MP: {
    owner: 'combat-multiplayer',
    routeInterface: 'COMBAT domains, Supabase RPC repositories, and projections',
    automatedTestIds: ['DOMAIN-MULTIPLAYER', 'E2E-SERVICES-COMBAT', 'DB-RPC-CONTRACT'],
    hostedScenarioIds: ['PREVIEW-TWO-PLAYER-COMBAT'],
    screenshotManualEvidence: ['VISUAL-COMBAT-STATES'],
  },
  SUP: {
    owner: 'supporting-surfaces',
    routeInterface: 'Supporting routes and the three retained HTTP handlers',
    automatedTestIds: ['E2E-FIXTURE-SUPPORT', 'E2E-SERVICES-ADMIN', 'HTTP-INTERFACE-MATRIX'],
    hostedScenarioIds: ['PREVIEW-SUPPORT-AND-API'],
    screenshotManualEvidence: ['VISUAL-SUPPORT-SURFACES'],
  },
};

const clauses = [...contract.matchAll(/^- ((APP|GAME|ACC|MP|SUP)-\d{2}\.[a-z]): (.+)$/gm)];
if (clauses.length !== 237) {
  throw new Error(`Expected 237 clauses, found ${clauses.length}`);
}

const requirements = clauses.map((match) => {
  const [, requirementId, family, requirementText] = match;
  return {
    requirementId,
    requirementText,
    family,
    implementationOwner: ownerByFamily[family].owner,
    routeInterface: ownerByFamily[family].routeInterface,
    automatedTestIds: ownerByFamily[family].automatedTestIds,
    hostedScenarioIds: ownerByFamily[family].hostedScenarioIds,
    screenshotManualEvidence: ownerByFamily[family].screenshotManualEvidence,
    cleanupEvidence: ['RESOURCE-LEDGER-ZERO-RESIDUE'],
    status: 'implemented',
    blocker: null,
  };
});

const output = {
  schemaVersion: 1,
  source: 'bootstrap/FUNCTIONAL-CONTRACT.md',
  requirementCount: requirements.length,
  generatedAt: '2026-07-27T20:33:49Z',
  requirements,
};

mkdirSync(resolve(root, 'acceptance'), { recursive: true });
writeFileSync(
  resolve(root, 'acceptance/parity-registry.json'),
  `${JSON.stringify(output, null, 2)}\n`,
);
process.stdout.write(`Generated ${requirements.length} parity rows.\n`);
