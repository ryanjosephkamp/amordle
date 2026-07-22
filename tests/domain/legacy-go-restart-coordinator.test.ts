import { describe, expect, it, vi } from 'vitest';
import { coordinateLegacyGoRestart } from '../../src/features/play/legacy-go-restart-coordinator';

describe('legacy GO restart coordination', () => {
  it('commits the deterministic generation only after local and cloud replacement', async () => {
    const order: string[] = [];
    await expect(
      coordinateLegacyGoRestart({
        replaceLocal: () => (order.push('local'), true),
        rollbackLocal: () => (order.push('rollback-local'), true),
        replaceCloud: () => (order.push('cloud'), true),
        rollbackCloud: () => (order.push('rollback-cloud'), true),
        commitGeneration: () => (order.push('generation'), true),
      }),
    ).resolves.toBe('committed');
    expect(order).toEqual(['local', 'cloud', 'generation']);
  });

  it('restores the old local lane when cloud CAS rejects the replacement', async () => {
    const rollbackLocal = vi.fn(() => true);
    const commitGeneration = vi.fn(() => true);
    await expect(
      coordinateLegacyGoRestart({
        replaceLocal: () => true,
        rollbackLocal,
        replaceCloud: () => false,
        commitGeneration,
      }),
    ).resolves.toBe('cloud-failed');
    expect(rollbackLocal).toHaveBeenCalledOnce();
    expect(commitGeneration).not.toHaveBeenCalled();
  });

  it('rolls cloud and local state back when generation reservation fails', async () => {
    const order: string[] = [];
    await expect(
      coordinateLegacyGoRestart({
        replaceLocal: () => true,
        rollbackLocal: () => (order.push('local'), true),
        replaceCloud: () => true,
        rollbackCloud: () => (order.push('cloud'), true),
        commitGeneration: () => false,
      }),
    ).resolves.toBe('generation-failed');
    expect(order).toEqual(['cloud', 'local']);
  });

  it('reports a fail-closed blocker if any required rollback cannot be confirmed', async () => {
    await expect(
      coordinateLegacyGoRestart({
        replaceLocal: () => true,
        rollbackLocal: () => false,
        replaceCloud: () => false,
      }),
    ).resolves.toBe('rollback-failed');
  });
});
