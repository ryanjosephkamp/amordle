export type LegacyGoRestartResult =
  'committed' | 'local-failed' | 'cloud-failed' | 'generation-failed' | 'rollback-failed';

type RestartStep = () => boolean | Promise<boolean>;

/**
 * Replaces an active legacy GO lane without advancing its deterministic
 * generation until both local and account-owned persistence have converged.
 */
export async function coordinateLegacyGoRestart(input: {
  readonly replaceLocal: RestartStep;
  readonly rollbackLocal: RestartStep;
  readonly replaceCloud?: RestartStep;
  readonly rollbackCloud?: RestartStep;
  readonly commitGeneration?: RestartStep;
}): Promise<LegacyGoRestartResult> {
  if (!(await input.replaceLocal())) return 'local-failed';

  let cloudCommitted = false;
  if (input.replaceCloud) {
    try {
      cloudCommitted = await input.replaceCloud();
    } catch {
      cloudCommitted = false;
    }
    if (!cloudCommitted) {
      return (await input.rollbackLocal()) ? 'cloud-failed' : 'rollback-failed';
    }
  }

  if (input.commitGeneration && !(await input.commitGeneration())) {
    const cloudRolledBack =
      !cloudCommitted || !input.rollbackCloud || (await input.rollbackCloud());
    const localRolledBack = await input.rollbackLocal();
    return cloudRolledBack && localRolledBack ? 'generation-failed' : 'rollback-failed';
  }

  return 'committed';
}
