import { readFile } from 'node:fs/promises';

const registryPath = new URL('../quality/shell-parity-registry.json', import.meta.url);
const registry = JSON.parse(await readFile(registryPath, 'utf8'));
const items = registry.items ?? [];

const errors = [];
const planned = items.filter((item) => item.status === 'planned');
if (planned.length) {
  errors.push(`planned items remain: ${planned.map((item) => item.id).join(',')}`);
}

for (const item of items) {
  const automated = item.evidence?.automated;
  if (
    ['implemented', 'partial-preview'].includes(item.status) &&
    (!Array.isArray(automated) || automated.length === 0)
  ) {
    errors.push(`${item.id} has no automated preview evidence`);
  }
  if (item.status === 'partial-preview') {
    if (!Array.isArray(item.limitations) || item.limitations.length === 0) {
      errors.push(`${item.id} has no explicit preview limitation`);
    }
  }
  if (['disabled', 'deferred'].includes(item.status)) {
    if (typeof item.decision !== 'string' || item.decision.trim().length === 0) {
      errors.push(`${item.id} has no explicit deferral decision`);
    }
  }
}

const requiredPreviewLimits = registry.previewContract?.requiredLimits;
if (!Array.isArray(requiredPreviewLimits) || requiredPreviewLimits.length === 0) {
  errors.push('preview contract has no required limitation ledger');
}

if (errors.length) {
  throw new Error(`Preview parity gate failed: ${errors.join('; ')}.`);
}

console.log(
  JSON.stringify({
    mode: 'protected-development-preview',
    totalCapabilities: items.length,
    implemented: items.filter((item) => item.status === 'implemented').length,
    partialPreview: items.filter((item) => item.status === 'partial-preview').length,
    disabled: items.filter((item) => item.status === 'disabled').length,
    deferred: items.filter((item) => item.status === 'deferred').length,
    accepted: items.filter((item) => item.status === 'accepted').length,
    productionReady: false,
  }),
);
