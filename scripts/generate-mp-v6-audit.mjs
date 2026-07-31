import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const contractPath = resolve(root, 'bootstrap/FUNCTIONAL-CONTRACT.md');
const contract = readFileSync(contractPath, 'utf8');
const clauses = [...contract.matchAll(/^- (MP-(\d{2})\.([a-z])): (.+)$/gm)];

const h1 =
  'tests/e2e/services.combat.spec.ts::proves deployment words, UI multiplayer recovery, and privacy';
const transcript =
  'tests/browser/components.test.tsx::renders COMBAT guesses as one chronological actor-labelled transcript';
const transitions =
  'tests/domain/platform.test.ts::uses terminal precedence and expected revision/move evidence';
const clock =
  'tests/domain/platform.test.ts::derives clocks from server time without debiting the inactive player';
const rating =
  'tests/domain/platform.test.ts::settles Elo with distinct provisional and established factors';
const notification =
  'tests/domain/platform.test.ts::deduplicates notifications and rejects stale auth epochs';
const queueIntent =
  'tests/domain/multiplayer.test.ts::adopts an intent only for the exact account-visible compatibility tuple';
const queueLifecycle =
  'tests/domain/multiplayer.test.ts::maps every queue status to an explicit recoverable lifecycle';
const queueAuthority =
  'tests/domain/multiplayer.test.ts::retains exact server authority for supported clocks and concurrent claims';
const queueSchema =
  'tests/browser/components.test.tsx::strictly parses account-scoped Ranked Practice queue intent';

const migrations = {
  authorityV2: ['20260724222000_amordle_authoritative_combat_v2.sql'],
  rankedDaily: [
    '20260710061039_phase55_ranked_daily_multiplayer.sql',
    '20260710180608_phase55_ranked_daily_contract_repair.sql',
    '20260710184116_phase55_ranked_daily_cleanup_orphan_repair.sql',
    '20260710184922_phase55_ranked_daily_finalization_authority_repair.sql',
  ],
  requests: [
    '20260701221500_phase40_private_match_requests.sql',
    '20260711001811_phase56_private_request_center_and_anti_spam.sql',
  ],
  spectator: ['20260724223000_amordle_live_spectator_privacy_v3.sql'],
  legacyLobby: ['20260605043000_phase23_stage4_lobby_cancel_spectators.sql'],
};

const groups = {
  '01': {
    frontend: ['/combat/practice', '/combat/match/[matchId]'],
    owner: ['PracticeLobby', 'MatchController', 'multiplayer/game domains'],
    authority: ['legacy async_multiplayer_games', 'authoritative COMBAT v2 RPC family'],
    migrations: [...migrations.legacyLobby, ...migrations.authorityV2],
    proposed:
      'Move public unranked Practice to private answer/action authority; retain the v2 transcript and configuration model.',
  },
  '02': {
    frontend: ['/combat/daily', '/combat/match/[matchId]'],
    owner: ['DailyLobby', 'MatchController'],
    authority: ['unranked Daily v2 RPCs', 'phase-55 ranked Daily RPC family'],
    migrations: [...migrations.rankedDaily, ...migrations.authorityV2],
    proposed:
      'Replace raw-identity Ranked Daily projections and exercise all four UTC lanes independently.',
  },
  '03': {
    frontend: ['/combat/match/[matchId]'],
    owner: ['MatchController', 'multiplayer domain'],
    authority: ['save_amordle_combat_command_v2', 'phase-55 action RPC', 'legacy direct table'],
    migrations: [...migrations.authorityV2, ...migrations.rankedDaily],
    proposed:
      'Use private owner drafts and expected-version authority everywhere; test conflict reread without draft loss.',
  },
  '04': {
    frontend: ['/combat/match/[matchId]'],
    owner: ['MatchController', 'MoveBoards', 'game evidence domain'],
    authority: ['participant projections', 'Realtime invalidation'],
    migrations: [...migrations.authorityV2],
    proposed:
      'Prove duplicate invalidation, shared keyboard convergence and reload without replay.',
  },
  '05': {
    frontend: ['/combat/match/[matchId]'],
    owner: ['MatchController', 'game/GO domains'],
    authority: ['authoritative COMBAT v2 command and projection RPCs'],
    migrations: [...migrations.authorityV2],
    proposed:
      'Add deterministic and hosted GO hold, seed, advancement, skip, point and definition scenarios.',
  },
  '06': {
    frontend: ['/combat/practice', '/combat/match/[matchId]'],
    owner: ['PracticeLobby', 'MatchController', 'clock/game domains'],
    authority: ['authoritative COMBAT v2 command RPCs', 'legacy Practice projection'],
    migrations: [...migrations.authorityV2, ...migrations.legacyLobby],
    proposed:
      'Prove server Hard Mode and clocks; add authoritative unranked clocks only through the migration packet.',
  },
  '07': {
    frontend: ['/combat/match/[matchId]', '/combat/results/[resultId]'],
    owner: ['MatchController', 'multiplayer domain'],
    authority: ['save_amordle_combat_command_v2', 'settlement RPCs'],
    migrations: [...migrations.authorityV2, ...migrations.rankedDaily],
    proposed: 'Exercise cancellation, forfeit, timeout, solve, points, draw and replay precedence.',
  },
  '08': {
    frontend: ['/combat/practice'],
    owner: ['PracticeLobby', 'multiplayer domain', 'session-combat adapter'],
    authority: [
      'create/claim/status/cancel/finalize_amordle_ranked_practice_v2',
      'tab-scoped queue intent',
    ],
    migrations: [...migrations.authorityV2],
    proposed:
      'Complete exact configuration, account/tab recovery and every queue terminal or retry state.',
  },
  '09': {
    frontend: ['/combat/results/[resultId]', '/history', '/stats', '/leaderboards'],
    owner: ['MatchController', 'rating/account-continuity domains'],
    authority: ['settle_amordle_ranked_practice_v2', 'phase-55 settlement RPCs'],
    migrations: [...migrations.authorityV2, ...migrations.rankedDaily],
    proposed:
      'Strictly parse settlement and prove exact result/transaction/profile reconciliation.',
  },
  10: {
    frontend: ['/combat/lobby', '/combat/match/[matchId]'],
    owner: ['RequestCenter', 'MatchController'],
    authority: ['private-request RPCs', 'legacy browser-created game projection'],
    migrations: [...migrations.requests],
    proposed:
      'Move accepted private-game creation to server answer authority and test the full lifecycle.',
  },
  11: {
    frontend: ['/combat/active'],
    owner: ['ActiveGames'],
    authority: ['list_amordle_combat_active_v2', 'legacy participant list'],
    migrations: [...migrations.authorityV2],
    proposed:
      'List only participant waiting/playing/holding rows and remove terminal rows immediately.',
  },
  12: {
    frontend: ['/combat/lobby'],
    owner: ['OpenLobbies'],
    authority: ['public Practice legacy rows', 'unranked Daily lobby RPCs'],
    migrations: [...migrations.legacyLobby, ...migrations.authorityV2],
    proposed:
      'Return sanctioned creator summaries and compatibility from an authoritative lobby projection.',
  },
  13: {
    frontend: ['/combat/live'],
    owner: ['LiveGames'],
    authority: ['spectator privacy v3 RPC family'],
    migrations: [...migrations.spectator],
    proposed: 'Add sanctioned profile links and prove list/exact-ID allow and deny behavior.',
  },
  14: {
    frontend: ['/combat/live', '/combat/match/[matchId]'],
    owner: ['LiveGames', 'spectator transcript'],
    authority: ['spectator privacy v3 RPC family'],
    migrations: [...migrations.spectator],
    proposed:
      'Prove participant/anonymous/authenticated convergence and every private-field denial.',
  },
  15: {
    frontend: ['/combat/active', '/combat/lobby', '/combat/live', '/combat/match/[matchId]'],
    owner: ['COMBAT Query controllers', 'Realtime invalidation coordinator'],
    authority: ['durable query RPCs', 'Realtime invalidation'],
    migrations: [...migrations.authorityV2, ...migrations.spectator],
    proposed: 'Centralize five-second visible-game and thirty-second list recovery triggers.',
  },
  16: {
    frontend: ['global alerts', '/combat/lobby', '/combat/match/[matchId]'],
    owner: ['NotificationCenter', 'notifications domain'],
    authority: ['request, match and rematch durable projections'],
    migrations: [...migrations.requests, ...migrations.authorityV2],
    proposed:
      'Exercise request/match/turn/result/rematch exactly once with opt-out and block isolation.',
  },
  17: {
    frontend: ['/combat/results/[resultId]', '/combat/match/[matchId]'],
    owner: ['MatchController', 'RematchActions'],
    authority: ['settlement RPCs', 'legacy rematch RPCs'],
    migrations: [...migrations.authorityV2, ...migrations.requests],
    proposed: 'Build one complete result projection and server-owned rematch game creation.',
  },
  18: {
    frontend: ['/combat/daily', '/combat/match/[matchId]'],
    owner: ['DailyLobby', 'MatchController'],
    authority: ['phase-55 ranked Daily RPC family'],
    migrations: [...migrations.rankedDaily],
    proposed:
      'Add sanitized queue/participant/finalization RPCs and remove browser projection authority.',
  },
  19: {
    frontend: ['/combat/lobby'],
    owner: ['RequestCenter'],
    authority: ['private-request preference/block/anti-spam RPCs'],
    migrations: [...migrations.requests],
    proposed: 'Add block-list/unblock UI and concurrent reverse-request tests.',
  },
  20: {
    frontend: ['/', '/combat/active'],
    owner: ['HomeAttention', 'COMBAT recovery coordinator'],
    authority: ['account-namespaced local read projection', 'participant repository reads'],
    migrations: [],
    proposed:
      'Add display-only same-tab same-account provisional recovery with explicit durable supersession.',
  },
  21: {
    frontend: ['/', '/combat/daily', '/combat/active'],
    owner: ['HomeAttention', 'COMBAT startup coordinator'],
    authority: ['participant list RPCs', 'separate waiting lane', 'word-list adapter'],
    migrations: [...migrations.authorityV2, ...migrations.rankedDaily],
    proposed: 'Add generation guards, coalescing and participant-first startup proof.',
  },
};

const findings = {
  'MP-01.a': [
    'migration-blocked',
    'H1 covers only public unranked OG; legacy answer authority is browser-visible.',
    true,
  ],
  'MP-01.b': [
    'partial-defective',
    'Ranked clocks now configure untimed/5:00, but authoritative unranked Practice clocks remain unavailable.',
    true,
  ],
  'MP-01.c': [
    'implemented-unproven',
    'Chronology is proven; owner-draft privacy lacks a complete cross-context assertion.',
    false,
  ],
  'MP-01.d': [
    'implemented-unproven',
    'Six initial rows render; growth beyond six is not acceptance-proven.',
    false,
  ],
  'MP-02.a': [
    'migration-blocked',
    'Four lanes render, but Ranked Daily participant projection is not privacy-safe.',
    true,
  ],
  'MP-02.b': [
    'migration-blocked',
    'UTC/clock-free intent exists but all four lanes lack authoritative hosted proof.',
    true,
  ],
  'MP-02.c': [
    'migration-blocked',
    'Namespaces exist; raw participant identity crosses the Ranked Daily browser boundary.',
    true,
  ],
  'MP-02.d': [
    'migration-blocked',
    'Route and rollover controls exist but rely on the blocked Ranked Daily status path.',
    true,
  ],
  'MP-03.a': [
    'migration-blocked',
    'v2 owns drafts; legacy public/private/rematch authority does not meet the same boundary.',
    true,
  ],
  'MP-03.b': [
    'implemented-unproven',
    'Expected version/move exists in authoritative paths without concurrent hosted proof.',
    false,
  ],
  'MP-03.c': [
    'implemented-unproven',
    'Rejected mutations retain the draft and refetch, but the race is unproven.',
    false,
  ],
  'MP-04.a': [
    'proven',
    'H1 and the browser transcript test prove shared rows, actor labels and keyboard evidence.',
    false,
  ],
  'MP-04.b': [
    'implemented-unproven',
    'Realtime invalidates durable reads; duplicate event behavior is unproven.',
    false,
  ],
  'MP-04.c': [
    'implemented-unproven',
    'Hydration does not deliberately replay effects, but no exact restoration test exists.',
    false,
  ],
  'MP-05.a': [
    'implemented-unproven',
    'v2 implements puzzle index, hold, seed and advancement without hosted GO proof.',
    false,
  ],
  'MP-05.b': [
    'implemented-unproven',
    'v2 creates non-move seeded rows; rescoring/points proof is absent.',
    false,
  ],
  'MP-05.c': [
    'implemented-unproven',
    'Turn, skip and outcome SQL exists without two-client GO acceptance.',
    false,
  ],
  'MP-06.a': [
    'migration-blocked',
    'v2 validates server-side; legacy Practice still validates in the browser path.',
    true,
  ],
  'MP-06.b': [
    'partial-defective',
    'Ranked untimed/5:00 is now selectable; unranked documented clocks remain blocked.',
    true,
  ],
  'MP-06.c': [
    'implemented-unproven',
    'Durable active-player clock SQL exists without complete GO/reconnect proof.',
    false,
  ],
  'MP-06.d': [
    'implemented-unproven',
    'Display derives from server time; sleep/reconnect acceptance is absent.',
    false,
  ],
  'MP-07.a': [
    'implemented-unproven',
    'Authoritative before-play cancel is now exposed; no hosted cancellation proof.',
    false,
  ],
  'MP-07.b': [
    'implemented-unproven',
    'Forfeit/timeout precedence exists without a late-command race scenario.',
    false,
  ],
  'MP-07.c': [
    'implemented-unproven',
    'Canonical solve/points/draw SQL exists without exhaustive acceptance.',
    false,
  ],
  'MP-07.d': [
    'implemented-unproven',
    'Idempotency exists without replay and compatible-conflict hosted evidence.',
    false,
  ],
  'MP-08.a': [
    'implemented-unproven',
    'The UI and queue intent now retain the full compatibility tuple.',
    false,
  ],
  'MP-08.b': [
    'implemented-unproven',
    'Exact-bucket FIFO and repeat opponents are present; concurrency is only statically traced.',
    false,
  ],
  'MP-08.c': [
    'implemented-unproven',
    'Queue intent is account/tab/config scoped with explicit terminal states; hosted proof is pending.',
    false,
  ],
  'MP-08.d': [
    'implemented-unproven',
    'Reservation locks and uniqueness exist without a two-claim invariant probe.',
    false,
  ],
  'MP-09.a': [
    'implemented-unproven',
    'Separate stored/application buckets exist without full Practice/Daily scenario coverage.',
    false,
  ],
  'MP-09.b': [
    'implemented-unproven',
    'Current unit vectors cover provisional and established factors only.',
    false,
  ],
  'MP-09.c': [
    'implemented-unproven',
    'Settlement SQL creates exact records; concurrent/retry proof is absent.',
    false,
  ],
  'MP-09.d': [
    'implemented-unproven',
    'Ranked Practice receipt is now strict and reaches History; hosted reconciliation is pending.',
    false,
  ],
  'MP-10.a': [
    'partial-defective',
    'Request creation exists with incomplete supported settings.',
    true,
  ],
  'MP-10.b': [
    'implemented-unproven',
    'Statuses and ordering exist without hosted lifecycle coverage.',
    false,
  ],
  'MP-10.c': ['migration-blocked', 'Accept creates an answer-bearing browser projection.', true],
  'MP-10.d': [
    'migration-blocked',
    'First-turn persistence cannot be accepted on the current answer-bearing authority.',
    true,
  ],
  'MP-11.a': ['partial-defective', 'Active currently includes terminal rows.', false],
  'MP-11.b': [
    'implemented-unproven',
    'Lane/status/resume exists; sanitized opponent summary is not fully proven.',
    false,
  ],
  'MP-11.c': [
    'partial-defective',
    'Completed/cancelled games do not leave Active immediately.',
    false,
  ],
  'MP-12.a': [
    'migration-blocked',
    'Practice lobby lacks an authoritative sanctioned creator summary and block compatibility.',
    true,
  ],
  'MP-12.b': [
    'implemented-unproven',
    'Join/cancel exists without Practice and Daily race coverage.',
    true,
  ],
  'MP-12.c': [
    'implemented-unproven',
    'Tolerant row parsing exists; all distinct states lack exact assertions.',
    false,
  ],
  'MP-13.a': [
    'implemented-unproven',
    'Spectator v3 eligibility exists without bounded terminal breadth proof.',
    false,
  ],
  'MP-13.b': [
    'implemented-unproven',
    'Restricted sources are filtered; exact-ID denial matrix is unproven.',
    false,
  ],
  'MP-13.c': [
    'missing',
    'Participant labels are not consistently sanctioned public-profile links.',
    false,
  ],
  'MP-14.a': ['implemented-unproven', 'H1 covers one authenticated spectator only.', false],
  'MP-14.b': [
    'implemented-unproven',
    'Projection is sanitized but the complete denial probe is absent.',
    false,
  ],
  'MP-14.c': [
    'implemented-unproven',
    'Participant/anonymous/authenticated convergence is unproven.',
    false,
  ],
  'MP-14.d': [
    'implemented-unproven',
    'Responsive presentation exists without dedicated spectator mobile acceptance.',
    false,
  ],
  'MP-15.a': [
    'partial-defective',
    'Match uses five seconds; Active and Live do not follow the exact game/list cadence.',
    false,
  ],
  'MP-15.b': [
    'implemented-unproven',
    'Match now rereads on visibility/reconnect; all COMBAT surfaces are not centralized.',
    false,
  ],
  'MP-15.c': [
    'implemented-unproven',
    'Draft preservation exists without background-race proof.',
    false,
  ],
  'MP-15.d': [
    'implemented-unproven',
    'H1 proves refresh recovery, not the bounded five-second contract.',
    false,
  ],
  'MP-16.a': [
    'implemented-unproven',
    'H1 covers match/turn/result/rematch; private-request transitions are absent.',
    false,
  ],
  'MP-16.b': [
    'implemented-unproven',
    'Preferences exist; opt-out/block matrix is unproven.',
    false,
  ],
  'MP-16.c': [
    'implemented-unproven',
    'Action routes exist without every transition assertion.',
    false,
  ],
  'MP-17.a': [
    'partial-defective',
    'Results omit complete definitions, rating, settings and sanctioned player links.',
    false,
  ],
  'MP-17.b': [
    'migration-blocked',
    'Rematch acceptance creates an answer-bearing browser projection.',
    true,
  ],
  'MP-17.c': ['partial-defective', 'Contextual postgame actions are incomplete.', false],
  'MP-18.a': [
    'migration-blocked',
    'FIFO lanes exist but status returns raw participant Auth UUIDs.',
    true,
  ],
  'MP-18.b': [
    'migration-blocked',
    'Pair locking exists; browser finalization constructs the public projection.',
    true,
  ],
  'MP-18.c': [
    'migration-blocked',
    'Reload/action/settlement paths expose raw identity through the projection.',
    true,
  ],
  'MP-18.d': [
    'implemented-unproven',
    'Queue intent is account/date scoped without account-switch acceptance.',
    false,
  ],
  'MP-19.a': [
    'implemented-unproven',
    'Server policies exist without full hosted protection coverage.',
    false,
  ],
  'MP-19.b': [
    'implemented-unproven',
    'Pair locking exists without reverse/concurrent probes.',
    false,
  ],
  'MP-19.c': [
    'partial-defective',
    'No complete block-list/unblock UI and reconciliation path exists.',
    false,
  ],
  'MP-20.a': ['missing', 'No same-tab participant provisional projection exists.', false],
  'MP-20.b': ['missing', 'No durable-authority supersession coordinator exists.', false],
  'MP-20.c': ['missing', 'The required exclusion boundary has no implementation or test.', false],
  'MP-21.a': [
    'partial-defective',
    'Participant reads exist without an explicit participant-first/waiting merge.',
    false,
  ],
  'MP-21.b': [
    'missing',
    'COMBAT startup has no epoch/coalescing guard for stale generations.',
    false,
  ],
  'MP-21.c': [
    'implemented-unproven',
    'Home word-bank denial is proven elsewhere; cold Ranked Daily preparation is not.',
    false,
  ],
};

function existingEvidence(id) {
  const evidence = [];
  if (['MP-01.a', 'MP-01.c', 'MP-01.d', 'MP-04.a', 'MP-14.a', 'MP-15.d', 'MP-16.a'].includes(id)) {
    evidence.push(h1);
  }
  if (['MP-01.c', 'MP-01.d', 'MP-04.a'].includes(id)) evidence.push(transcript);
  if (['MP-03.b', 'MP-03.c', 'MP-07.a', 'MP-07.b', 'MP-07.c', 'MP-07.d'].includes(id)) {
    evidence.push(transitions);
  }
  if (['MP-06.c', 'MP-06.d'].includes(id)) evidence.push(clock);
  if (id.startsWith('MP-09.')) evidence.push(rating);
  if (id.startsWith('MP-16.')) evidence.push(notification);
  if (['MP-08.a', 'MP-08.c', 'MP-18.d'].includes(id)) evidence.push(queueIntent, queueSchema);
  if (id.startsWith('MP-08.')) evidence.push(queueLifecycle, queueAuthority);
  return [...new Set(evidence)];
}

if (clauses.length !== 73 || Object.keys(findings).length !== 73) {
  throw new Error(
    `Expected 73 MP clauses and findings; found ${clauses.length} clauses and ${Object.keys(findings).length} findings.`,
  );
}

const requirements = clauses.map((match) => {
  const [, requirementId, groupId, , requirementText] = match;
  const group = groups[groupId];
  const finding = findings[requirementId];
  if (!group || !finding) throw new Error(`Missing audit definition for ${requirementId}.`);
  const [status, gap, schemaChangeRequired] = finding;
  const automatedEvidence = existingEvidence(requirementId);
  const hostedEvidence = automatedEvidence.includes(h1) ? ['V5.3-HOSTED-PUBLIC-PRACTICE-OG'] : [];
  return {
    requirementId,
    requirementText,
    status,
    frontendEntryPoint: group.frontend,
    controllerDomainOwner: group.owner,
    adapterRpcTableAuthority: group.authority,
    relevantMigrations: group.migrations,
    automatedEvidence,
    hostedEvidence,
    actualEvidence:
      status === 'proven'
        ? 'Exact automated and hosted evidence satisfies this complete clause.'
        : automatedEvidence.length
          ? 'Evidence covers only part of this clause and is not sufficient for acceptance.'
          : 'No clause-specific automated or hosted acceptance evidence exists.',
    knownDefectOrMissingProof: gap,
    proposedImplementationOrTestWork: group.proposed,
    schemaChangeRequired,
  };
});

const output = {
  schemaVersion: 1,
  source: 'bootstrap/FUNCTIONAL-CONTRACT.md',
  generatedFromCommit: process.env.MP_AUDIT_COMMIT ?? 'working-tree-pre-migration',
  requirementCount: requirements.length,
  requirements,
};

mkdirSync(resolve(root, 'acceptance'), { recursive: true });
writeFileSync(
  resolve(root, 'acceptance/mp-v6-clause-audit.json'),
  `${JSON.stringify(output, null, 2)}\n`,
);
process.stdout.write('Generated truthful MP-01 through MP-21 clause audit (73/73).\n');
