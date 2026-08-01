import { describe, expect, it } from 'vitest';
import {
  activeSoloSessions,
  canStartSoloSession,
  emptySoloSessionRegistry,
  mergeSoloSessionRegistries,
  reserveSoloSession,
  setSoloSessionLifecycle,
  soloSessionRegistryForOwner,
} from '@/domain/solo-sessions';
import type { SoloSessionSummary } from '@/domain/solo-sessions';

function summary(
  id: string,
  mode: 'og' | 'go' = 'og',
  lane: 'practice' | 'daily' = 'practice',
  timestamp = '2026-08-01T12:00:00.000Z',
): SoloSessionSummary {
  return {
    schemaVersion: 2,
    id,
    ownerNamespace: 'account:example',
    lane,
    settings: {
      mode,
      length: 5,
      difficulty: lane === 'daily' ? 'expert' : 'standard',
      hardMode: false,
      goCount: mode === 'go' ? 5 : 1,
    },
    localDate: lane === 'daily' ? '2026-08-01' : null,
    resumeHref:
      lane === 'daily'
        ? `/play/solo/daily/2026-08-01/${mode}`
        : `/play/solo/practice/${mode}?session=${id}`,
    lifecycle: 'active',
    acceptedGuesses: 0,
    puzzleIndex: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastPlayedAt: timestamp,
  };
}

describe('bounded Solo session registry', () => {
  it('allows three independent Practice sessions per mode and no fourth', () => {
    let registry = emptySoloSessionRegistry();
    for (const id of ['one', 'two', 'three']) registry = reserveSoloSession(registry, summary(id));
    expect(canStartSoloSession(registry, 'practice:og')).toBe(false);
    expect(canStartSoloSession(registry, 'practice:go')).toBe(true);
    expect(() => reserveSoloSession(registry, summary('four'))).toThrow(/limit/i);
    expect(activeSoloSessions(registry)).toHaveLength(3);
  });

  it('allows one Daily OG and one Daily GO without conflating their slots', () => {
    let registry = reserveSoloSession(
      emptySoloSessionRegistry(),
      summary('daily-og', 'og', 'daily'),
    );
    registry = reserveSoloSession(registry, summary('daily-go', 'go', 'daily'));
    expect(canStartSoloSession(registry, 'daily:og')).toBe(false);
    expect(canStartSoloSession(registry, 'daily:go')).toBe(false);
    expect(activeSoloSessions(registry)).toHaveLength(2);
  });

  it('keeps concurrent overflow visible as a conflict instead of deleting it', () => {
    let local = emptySoloSessionRegistry();
    for (const [index, id] of ['one', 'two', 'three'].entries()) {
      local = reserveSoloSession(
        local,
        summary(id, 'og', 'practice', `2026-08-01T12:0${index}:00.000Z`),
      );
    }
    const remote = reserveSoloSession(
      emptySoloSessionRegistry(),
      summary('remote', 'og', 'practice', '2026-08-01T12:04:00.000Z'),
    );
    const merged = mergeSoloSessionRegistries(local, remote);
    expect(activeSoloSessions(merged)).toHaveLength(4);
    expect(
      activeSoloSessions(merged).filter((session) => session.lifecycle === 'conflict'),
    ).toHaveLength(1);
    expect(merged.sessions.one?.lifecycle).toBe('conflict');
  });

  it('releases a slot only after an explicit terminal or abandon transition', () => {
    let registry = emptySoloSessionRegistry();
    for (const id of ['one', 'two', 'three']) registry = reserveSoloSession(registry, summary(id));
    registry = setSoloSessionLifecycle(registry, 'two', 'terminal', '2026-08-01T13:00:00.000Z');
    expect(canStartSoloSession(registry, 'practice:og')).toBe(true);
    expect(activeSoloSessions(registry).map((session) => session.id)).not.toContain('two');
  });

  it('stores only summary metadata and never answers, drafts, or raw account identifiers', () => {
    const serialized = JSON.stringify(
      reserveSoloSession(emptySoloSessionRegistry(), summary('one')),
    );
    expect(serialized).not.toContain('answers');
    expect(serialized).not.toContain('draft');
    expect(serialized).not.toContain('user_id');
  });

  it('drops foreign-owner summaries instead of leaking them across an account switch', () => {
    const foreign = {
      ...summary('foreign'),
      ownerNamespace: 'account:somebody-else',
    };
    const mixed = {
      schemaVersion: 2 as const,
      sessions: {
        mine: summary('mine'),
        foreign,
      },
    };
    expect(Object.keys(soloSessionRegistryForOwner(mixed, 'account:example').sessions)).toEqual([
      'mine',
    ]);
  });
});
