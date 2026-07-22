import { readFile } from 'node:fs/promises';
import process from 'node:process';

const registryPath = new URL('../quality/shell-parity-registry.json', import.meta.url);
const registry = JSON.parse(await readFile(registryPath, 'utf8'));
const mode = process.argv.includes('--complete') ? 'complete' : 'structure';

const expectedShellIds = [
  ...Array.from({ length: 12 }, (_, index) => `APP-${String(index + 1).padStart(2, '0')}`),
  ...Array.from({ length: 14 }, (_, index) => `GAME-${String(index + 1).padStart(2, '0')}`),
  ...Array.from({ length: 13 }, (_, index) => `ACC-${String(index + 1).padStart(2, '0')}`),
  ...Array.from({ length: 21 }, (_, index) => `MP-${String(index + 1).padStart(2, '0')}`),
  ...Array.from({ length: 6 }, (_, index) => `SUP-${String(index + 1).padStart(2, '0')}`),
];

const items = registry.items ?? [];
const ids = items.map((item) => item.id);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
const shellIds = ids.filter((id) => /^(APP|GAME|ACC|MP|SUP)-/.test(id));
const missing = expectedShellIds.filter((id) => !shellIds.includes(id));
const unexpected = shellIds.filter((id) => !expectedShellIds.includes(id));
const invalid = items.filter(
  (item) =>
    !item.id ||
    !item.capability ||
    !Number.isInteger(item.checkpoint) ||
    !registry.evidenceProfiles?.[item.evidenceProfile] ||
    !['planned', 'implemented', 'accepted'].includes(item.status),
);

if (duplicates.length || missing.length || unexpected.length || invalid.length) {
  throw new Error(
    `Parity registry structure failure: duplicates=${duplicates.join(',') || 'none'}; ` +
      `missing=${missing.join(',') || 'none'}; unexpected=${unexpected.join(',') || 'none'}; ` +
      `invalid=${invalid.map((item) => item.id ?? '<missing>').join(',') || 'none'}.`,
  );
}

if (mode === 'complete') {
  const notAccepted = items.filter((item) => item.status !== 'accepted');
  const incompleteEvidence = items.filter((item) => {
    const profile = registry.evidenceProfiles[item.evidenceProfile];
    return profile.some(
      (kind) => !Array.isArray(item.evidence?.[kind]) || item.evidence[kind].length === 0,
    );
  });
  if (notAccepted.length || incompleteEvidence.length) {
    throw new Error(
      `Parity release gate is incomplete: status=${notAccepted.map((item) => item.id).join(',') || 'none'}; ` +
        `evidence=${incompleteEvidence.map((item) => item.id).join(',') || 'none'}.`,
    );
  }
}

console.log(
  JSON.stringify({
    mode,
    shellCapabilities: expectedShellIds.length,
    amordleCapabilities: ids.length - expectedShellIds.length,
    totalCapabilities: ids.length,
    accepted: items.filter((item) => item.status === 'accepted').length,
  }),
);
