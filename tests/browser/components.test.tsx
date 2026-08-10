import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GameHistoryViewport } from '@/components/game-history-viewport';
import { GameKeyboard } from '@/components/game-keyboard';
import {
  combatAttentionProjectionSchema,
  rankedDailyQueueIntentSchema,
  rankedPracticeQueueIntentSchema,
  readCombatAttentionProjection,
  readRankedDailyQueueIntent,
  readRankedPracticeQueueIntent,
  writeRankedDailyQueueIntent,
  writeRankedPracticeQueueIntent,
  writeCombatAttentionProjection,
} from '@/adapters/session-combat';
import {
  readRankedQueueIntent,
  removeRankedQueueIntent,
  writeRankedQueueIntent,
} from '@/adapters/durable-combat';
import { combatProjectionSchema, privateRequestBlockSchema } from '@/adapters/supabase/combat';
import { ClockValue } from '@/features/combat/match-clock';
import { MatchUnavailable } from '@/features/combat/match-unavailable';
import { operationId } from '@/adapters/supabase/shared';
import { isEditableShortcutTarget } from '@/application/keyboard-shortcuts';
import { dismissOnBackdrop, isOutsideDialogClick } from '@/application/modal-dialog';
import { eligibleHapticControl, playKeyboardHaptic } from '@/application/keyboard-feedback';
import { prunePublicWordAssetCache, validatePublicWordAsset } from '@/adapters/word-lists';
import { MoveBoards } from '@/features/combat/combat-transcript';
import { FeedbackBuilder } from '@/features/support/feedback-builder';
import { WordResults } from '@/features/words/word-results';
import { WordDefinition } from '@/features/words/word-definition';
import type { DefinitionLookupResult } from '@/domain/definitions';
import { AccentPresetDialog } from '@/features/account/accent-preset-dialog';
import { ContextHelpPopover } from '@/components/context-help-popover';
import { createGameSession, reduceGame } from '@/domain/game';
import { selectEncounteredSoloGoAnswers } from '@/domain/solo-go-review';
import { EncounteredGoReview } from '@/features/solo/encountered-go-review';

describe('browser components', () => {
  it('rejects corrupt and structurally invalid cached word assets', async () => {
    const raw = `${JSON.stringify({
      schemaVersion: 2,
      length: 2,
      curation: {
        method: 'stratified_quality_score_v1',
        targetSampleSize: 1,
      },
      answers: ['am'],
      validGuesses: ['am'],
    })}\n`;
    const digest = [
      ...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))),
    ]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    const entry = {
      length: 2,
      answers: 1,
      validGuesses: 1,
      bytes: new TextEncoder().encode(raw).byteLength,
      sha256: digest,
      url: `/word-lists/${'a'.repeat(64)}/2-${digest}.json`,
    };
    await expect(validatePublicWordAsset(raw, entry, 2)).resolves.toMatchObject({
      answers: ['am'],
      validGuesses: ['am'],
    });
    await expect(validatePublicWordAsset('{"corrupt":true}', entry, 2)).rejects.toThrow(
      /byte count|integrity/i,
    );

    const duplicateRaw = raw.replace('["am"]}', '["am","am"]}');
    const duplicateDigest = [
      ...new Uint8Array(
        await crypto.subtle.digest('SHA-256', new TextEncoder().encode(duplicateRaw)),
      ),
    ]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    await expect(
      validatePublicWordAsset(
        duplicateRaw,
        {
          ...entry,
          validGuesses: 2,
          bytes: new TextEncoder().encode(duplicateRaw).byteLength,
          sha256: duplicateDigest,
        },
        2,
      ),
    ).rejects.toThrow(/invalid/i);
  });

  it('removes stale word revisions without touching the selected revision', async () => {
    const currentRevision = 'a'.repeat(64);
    const staleRevision = 'b'.repeat(64);
    const cache = await caches.open('amordle-public-word-lists-v2');
    const currentUrl = `/word-lists/${currentRevision}/5-${'c'.repeat(64)}.json`;
    const staleUrl = `/word-lists/${staleRevision}/5-${'d'.repeat(64)}.json`;
    await cache.put(currentUrl, new Response('{}'));
    await cache.put(staleUrl, new Response('{}'));
    await prunePublicWordAssetCache(currentRevision);
    expect(await cache.match(currentUrl)).toBeDefined();
    expect(await cache.match(staleUrl)).toBeUndefined();
    await cache.delete(currentUrl);
  });

  it('strictly parses account-scoped Ranked Practice queue intent', () => {
    const intent = rankedPracticeQueueIntentSchema.parse({
      schemaVersion: 2,
      ownerUserId: '11111111-1111-4111-8111-111111111111',
      requestId: 'request-1',
      creationKey: 'create-1',
      claimActionId: 'claim-1',
      finalizeActionId: 'finalize-1',
      createdAt: '2026-07-30T12:00:00.000Z',
      config: {
        mode: 'go',
        wordLength: 7,
        difficulty: 'expert',
        hardMode: true,
        goPuzzleCount: 10,
        timeLimitMs: 300000,
      },
    });
    expect(intent.ownerUserId).toBe('11111111-1111-4111-8111-111111111111');
    expect(
      rankedPracticeQueueIntentSchema.safeParse({
        ...intent,
        ownerUserId: 'not-a-user-id',
      }).success,
    ).toBe(false);
    expect(
      rankedPracticeQueueIntentSchema.safeParse({
        ...intent,
        unexpected: 'value',
      }).success,
    ).toBe(false);
  });

  it('keeps Ranked Practice and Daily recovery isolated to the owning account', () => {
    const ownerUserId = '11111111-1111-4111-8111-111111111111';
    const otherUserId = '22222222-2222-4222-8222-222222222222';
    const createdAt = '2026-07-30T12:00:00.000Z';
    writeRankedPracticeQueueIntent({
      schemaVersion: 2,
      ownerUserId,
      requestId: 'practice-request',
      creationKey: 'practice-create',
      claimActionId: 'practice-claim',
      finalizeActionId: 'practice-finalize',
      createdAt,
      config: {
        mode: 'og',
        wordLength: 5,
        difficulty: 'standard',
        hardMode: false,
        goPuzzleCount: null,
        timeLimitMs: null,
      },
    });
    writeRankedDailyQueueIntent({
      schemaVersion: 3,
      ownerUserId,
      dailyDateKey: '2026-07-30',
      mode: 'go',
      hardMode: true,
      requestId: 'daily-request',
      matchedGameId: 'daily-game',
      creationKey: 'daily-create',
      claimActionId: 'daily-claim',
      finalizeActionId: 'daily-finalize',
      createdAt,
    });

    expect(readRankedPracticeQueueIntent(ownerUserId).status).toBe('valid');
    expect(readRankedDailyQueueIntent(ownerUserId).status).toBe('valid');
    expect(readRankedPracticeQueueIntent(otherUserId)).toEqual({ status: 'missing' });
    expect(readRankedDailyQueueIntent(otherUserId)).toEqual({ status: 'missing' });
    sessionStorage.clear();
  });

  /*
   * v8-B1. The ranked search moved from per-tab session storage to the durable
   * account envelope so it survives navigation and a second tab.
   *
   * The promotion path is the part that can silently strand a player: someone with a
   * live search at the moment this shipped has a server-side queue row counting
   * against the five-request cap, reachable only through the session-storage record
   * the new code no longer reads. If the promotion does not happen they cannot resume
   * that search and cannot cancel it either.
   */
  it('promotes a session-storage ranked search onto the durable store, once, per account', async () => {
    const ownerUserId = '33333333-3333-4333-8333-333333333333';
    const otherUserId = '44444444-4444-4444-8444-444444444444';
    const intent = {
      schemaVersion: 2 as const,
      ownerUserId,
      requestId: 'legacy-request',
      creationKey: 'legacy-create',
      claimActionId: 'legacy-claim',
      finalizeActionId: 'legacy-finalize',
      createdAt: '2026-08-09T12:00:00.000Z',
      config: {
        mode: 'og' as const,
        wordLength: 5,
        difficulty: 'standard' as const,
        hardMode: false,
        goPuzzleCount: null,
        timeLimitMs: null,
      },
    };
    await removeRankedQueueIntent(ownerUserId);
    await removeRankedQueueIntent(otherUserId);
    sessionStorage.clear();
    writeRankedPracticeQueueIntent(intent);

    const promoted = await readRankedQueueIntent(ownerUserId);
    expect(promoted).toEqual({ status: 'valid', intent });
    // The session copy is drained, so the durable record is now the only authority
    // and a stale tab cannot resurrect an older configuration over it.
    expect(readRankedPracticeQueueIntent(ownerUserId)).toEqual({ status: 'missing' });
    expect(await readRankedQueueIntent(ownerUserId)).toEqual({ status: 'valid', intent });
    expect(await readRankedQueueIntent(otherUserId)).toEqual({ status: 'missing' });

    await writeRankedQueueIntent({ ...intent, requestId: 'durable-request' });
    expect(await readRankedQueueIntent(ownerUserId)).toEqual({
      status: 'valid',
      intent: { ...intent, requestId: 'durable-request' },
    });

    await removeRankedQueueIntent(ownerUserId);
    expect(await readRankedQueueIntent(ownerUserId)).toEqual({ status: 'missing' });
  });

  it('keeps provisional COMBAT attention display-only and account-scoped', () => {
    const ownerUserId = '11111111-1111-4111-8111-111111111111';
    const otherUserId = '22222222-2222-4222-8222-222222222222';
    const projection = combatAttentionProjectionSchema.parse({
      schemaVersion: 1,
      ownerUserId,
      updatedAt: '2026-07-31T12:00:00.000Z',
      games: [
        {
          id: 'game-one',
          label: 'Ranked practice OG',
          status: 'playing',
          href: '/combat/match/game-one',
        },
      ],
    });
    writeCombatAttentionProjection(projection);
    expect(readCombatAttentionProjection(ownerUserId)).toEqual({
      status: 'valid',
      projection,
    });
    expect(readCombatAttentionProjection(otherUserId)).toEqual({ status: 'missing' });
    expect(
      combatAttentionProjectionSchema.safeParse({
        ...projection,
        games: [{ ...projection.games[0], answer: 'crane' }],
      }).success,
    ).toBe(false);
    sessionStorage.clear();
  });

  it('strictly parses the private-request block list used by unblock controls', () => {
    expect(
      privateRequestBlockSchema.parse({
        public_profile_id: 'public-profile',
        display_name: 'Rival',
        flair_key: null,
        avatar_url: null,
        blocked_at: '2026-07-31T12:00:00.000Z',
      }).display_name,
    ).toBe('Rival');
    expect(
      privateRequestBlockSchema.safeParse({
        public_profile_id: 'public-profile',
        display_name: 'Rival',
        flair_key: null,
        avatar_url: null,
        blocked_at: '2026-07-31T12:00:00.000Z',
        blocked_user_id: 'private-id',
      }).success,
    ).toBe(false);
  });

  it('strictly parses Ranked Daily recovery and safely correlates hosted UI mutations', () => {
    expect(
      rankedDailyQueueIntentSchema.safeParse({
        schemaVersion: 3,
        ownerUserId: '11111111-1111-4111-8111-111111111111',
        dailyDateKey: '2026-07-30',
        mode: 'og',
        hardMode: false,
        requestId: 'daily-request',
        matchedGameId: 'daily-game',
        creationKey: 'daily-create',
        claimActionId: 'daily-claim',
        finalizeActionId: 'daily-finalize',
        createdAt: '2026-07-30T12:00:00.000Z',
      }).success,
    ).toBe(true);
    expect(
      rankedDailyQueueIntentSchema.safeParse({
        schemaVersion: 3,
        ownerUserId: '11111111-1111-4111-8111-111111111111',
        dailyDateKey: '2026-07-30',
        mode: 'og',
        hardMode: false,
        requestId: 'daily-request',
        matchedGameId: 'daily-game',
        creationKey: 'daily-create',
        claimActionId: 'daily-claim',
        finalizeActionId: 'daily-finalize',
        createdAt: '2026-07-30T12:00:00.000Z',
        rawParticipantIds: [],
      }).success,
    ).toBe(false);

    const windowWithCorrelation = window as typeof window & {
      __AMORDLE_E2E_RUN_ID__?: string;
    };
    windowWithCorrelation.__AMORDLE_E2E_RUN_ID__ = 'e2e_20260730T120000000Z_12345678_abcdef12';
    expect(operationId('ranked-daily-create')).toMatch(
      /^e2e_20260730T120000000Z_12345678_abcdef12:ranked-daily-create:/,
    );
    delete windowWithCorrelation.__AMORDLE_E2E_RUN_ID__;
    expect(operationId('ordinary')).toMatch(/^ordinary:/);
  });

  it('recognizes editable shortcut targets without treating ordinary game controls as fields', () => {
    const input = document.createElement('input');
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    const button = document.createElement('button');
    document.body.append(input, editable, button);
    expect(isEditableShortcutTarget(input)).toBe(true);
    expect(isEditableShortcutTarget(editable)).toBe(true);
    expect(isEditableShortcutTarget(button)).toBe(false);
    input.remove();
    editable.remove();
    button.remove();
  });

  it('keeps submit and delete in the shared third keyboard row', async () => {
    const onLetter = vi.fn();
    const onSubmit = vi.fn();
    const onDelete = vi.fn();
    render(
      <GameKeyboard
        evidence={{ q: 'absent', z: 'removed' }}
        onLetter={onLetter}
        onSubmit={onSubmit}
        onDelete={onDelete}
      />,
    );

    await page.getByRole('button', { name: 'A, unknown' }).click();
    await page.getByRole('button', { name: 'Submit guess' }).click();
    await page.getByRole('button', { name: 'Delete letter' }).click();
    expect(onLetter).toHaveBeenCalledWith('a');
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledOnce();
    await expect
      .element(page.getByRole('button', { name: 'Q, absent' }))
      .toHaveAttribute('data-evidence', 'absent');
    await expect
      .element(page.getByRole('button', { name: 'Submit guess' }))
      .toHaveAttribute('data-evidence', 'unknown');
    await expect
      .element(page.getByRole('button', { name: 'Delete letter' }))
      .toHaveAttribute('data-evidence', 'unknown');
    await expect.element(page.getByText('×')).toBeVisible();
    await expect.element(page.getByRole('button', { name: 'Z, removed' })).toBeDisabled();
  });

  it('uses haptics only for direct touch keyboard gestures and fails closed', () => {
    const vibrate = vi.fn(() => true);
    const originalVibrate = navigator.vibrate;
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: vibrate,
    });
    expect(playKeyboardHaptic({ enabled: true, pointerType: 'touch', reducedEffects: false })).toBe(
      true,
    );
    expect(vibrate).toHaveBeenCalledWith(8);
    expect(playKeyboardHaptic({ enabled: true, pointerType: 'mouse', reducedEffects: false })).toBe(
      false,
    );
    expect(
      playKeyboardHaptic({ enabled: false, pointerType: 'touch', reducedEffects: false }),
    ).toBe(false);
    expect(playKeyboardHaptic({ enabled: true, pointerType: 'touch', reducedEffects: true })).toBe(
      false,
    );
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: originalVibrate,
    });
  });

  it('limits broad haptic eligibility to genuine button surfaces', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <button><span id="native">native</span></button>
      <button disabled><span id="disabled">disabled</span></button>
      <a id="plain" href="/help">ordinary prose link</a>
      <nav><a id="nav" href="/help">navigation</a></nav>
      <a id="styled" class="button" href="/help">styled action</a>
      <span id="role" role="button" tabindex="0">role button</span>
      <span id="aria-disabled" role="button" aria-disabled="true">disabled role</span>
    `;
    document.body.append(root);
    expect(eligibleHapticControl(root.querySelector('#native'))?.tagName).toBe('BUTTON');
    expect(eligibleHapticControl(root.querySelector('#disabled'))).toBeNull();
    expect(eligibleHapticControl(root.querySelector('#plain'))).toBeNull();
    expect(eligibleHapticControl(root.querySelector('#nav'))?.id).toBe('nav');
    expect(eligibleHapticControl(root.querySelector('#styled'))?.id).toBe('styled');
    expect(eligibleHapticControl(root.querySelector('#role'))?.id).toBe('role');
    expect(eligibleHapticControl(root.querySelector('#aria-disabled'))).toBeNull();
    root.remove();
  });

  it('keeps avatar requirements collapsed and dismisses them accessibly', async () => {
    render(
      <ContextHelpPopover label="Image requirements">
        <p>PNG, JPEG, WebP, or animated GIF up to 6 MiB.</p>
      </ContextHelpPopover>,
    );
    const trigger = page.getByRole('button', { name: 'Image requirements' });
    await expect.element(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect.element(page.getByText(/PNG, JPEG/)).not.toBeInTheDocument();
    await trigger.click();
    await expect.element(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect.element(page.getByRole('note')).toBeVisible();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await expect.element(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect.element(trigger).toHaveFocus();
  });

  it('lets manual history scrolling pause following and exposes Latest row recovery', async () => {
    render(
      <>
        <style>{`
          .game-history-shell { height: 8rem; position: relative; overflow: hidden; }
          .game-history-viewport { height: 100%; overflow: auto; }
          .history-test-row { height: 2rem; }
        `}</style>
        <GameHistoryViewport followKey="row-20" label="History test">
          {Array.from({ length: 20 }, (_, index) => (
            <div className="history-test-row" key={index}>
              row {index + 1}
            </div>
          ))}
        </GameHistoryViewport>
      </>,
    );
    await expect.element(page.getByText('row 20')).toBeVisible();
    const viewport = document.querySelector<HTMLElement>('.game-history-viewport');
    expect(viewport).not.toBeNull();
    viewport!.scrollTop = 0;
    viewport!.dispatchEvent(new Event('scroll', { bubbles: true }));
    await expect.element(page.getByRole('button', { name: 'Latest row' })).toBeVisible();
    await page.getByRole('button', { name: 'Latest row' }).click();
    expect(viewport!.scrollTop).toBeGreaterThan(0);
  });

  it('renders COMBAT guesses as one chronological actor-labelled transcript', async () => {
    render(
      <MoveBoards
        length={5}
        viewerSeat="player-one"
        moves={[
          {
            id: 'move-one',
            seat: 'player-one',
            guess: 'crane',
            acceptedAt: '2026-07-28T12:00:00.000Z',
            tiles: [...'crane'].map((letter) => ({ letter, state: 'absent' as const })),
          },
          {
            id: 'move-two',
            seat: 'player-two',
            guess: 'slate',
            acceptedAt: '2026-07-28T12:00:01.000Z',
            tiles: [...'slate'].map((letter) => ({ letter, state: 'present' as const })),
          },
        ]}
      />,
    );

    await expect.element(page.getByRole('row', { name: 'crane' })).toBeVisible();
    const entries = [...document.querySelectorAll<HTMLElement>('.combat-transcript-entry')];
    expect(entries).toHaveLength(6);
    expect(entries[0]?.dataset.actor).toBe('you');
    expect(entries[0]?.querySelector('.board-row')?.getAttribute('aria-label')).toBe(
      'you guessed crane',
    );
    expect(entries[1]?.dataset.actor).toBe('opponent');
    expect(entries[1]?.querySelector('.board-row')?.getAttribute('aria-label')).toBe(
      'opponent guessed slate',
    );
    expect(entries[0]?.querySelector('.combat-transcript-meta')?.textContent).toContain('01·you');
    expect(entries[1]?.querySelector('.combat-transcript-meta')?.textContent).toContain(
      '02·opponent',
    );
  });

  it('renders validated GO seed answers as chronological rows before player guesses', async () => {
    render(
      <MoveBoards
        length={5}
        viewerSeat="player-one"
        seededRows={[
          {
            kind: 'seeded',
            id: 'seed:0:slave',
            sourcePuzzleIndex: 0,
            actorLabel: 'Puzzle 1 answer',
            guess: 'slave',
            tiles: [...'slave'].map((letter) => ({ letter, state: 'present' as const })),
          },
        ]}
        moves={[
          {
            id: 'move-one',
            seat: 'player-one',
            guess: 'frank',
            acceptedAt: '2026-08-02T12:00:00.000Z',
            tiles: [...'frank'].map((letter) => ({ letter, state: 'absent' as const })),
          },
        ]}
      />,
    );
    await expect.element(page.getByRole('row', { name: 'Puzzle 1 answer slave' })).toBeVisible();
    const entries = [...document.querySelectorAll<HTMLElement>('.combat-transcript-entry')];
    expect(entries[0]?.dataset.actor).toBe('seeded');
    expect(entries[0]?.textContent).toContain('SEED 1');
    expect(entries[0]?.querySelector('.board-row')?.getAttribute('aria-label')).toBe(
      'Puzzle 1 answer slave',
    );
    expect(entries[1]?.dataset.actor).toBe('you');
  });

  it('renders an honest empty Word Explorer state', async () => {
    render(<WordResults words={[]} answerEligible={[]} total={0} page={1} pages={0} />);
    await expect.element(page.getByText('No words match this search.')).toBeVisible();
    await expect.element(page.getByText('0 results · page 1/1')).toBeVisible();
  });

  it('sanitizes private values in the feedback preview and never submits automatically', async () => {
    render(<FeedbackBuilder />);
    await page
      .getByLabelText('Short summary')
      .fill('Email person@example.com token=abcdefghijklmnopqrstuvwxyz123456');
    await page
      .getByLabelText('What happened?')
      .fill('password=hunter2 answer=crane 123e4567-e89b-42d3-a456-426614174000');
    const preview = page.getByText(/email removed/i);
    await expect.element(preview).toBeVisible();
    await expect.element(page.getByText('Nothing is submitted automatically.')).toBeVisible();
    const previewText = document.querySelector('.feedback-preview')?.textContent ?? '';
    expect(previewText).not.toContain('person@example.com');
    expect(previewText).not.toContain('hunter2');
  });

  it('supports keyboard-reachable Word Explorer selection and honest eligibility labels', async () => {
    const definitionLookup = vi.fn(async (word: string) => ({
      schemaVersion: 1 as const,
      word,
      status: 'found' as const,
      source: 'dictionary-api' as const,
      definitions: [{ partOfSpeech: 'noun', definition: 'A word used in a browser test.' }],
      checkedAt: '2026-08-01T03:00:00.000Z',
      expiresAt: '2026-08-31T03:00:00.000Z',
      cached: false,
      stale: false,
    }));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <WordResults
          words={['crane', 'slate']}
          answerEligible={['crane']}
          total={2}
          page={1}
          pages={1}
          definitionLookup={definitionLookup}
        />
      </QueryClientProvider>,
    );
    await expect
      .element(page.getByRole('option', { name: /crane/i }))
      .toHaveAttribute('aria-selected', 'true');
    await page.getByRole('option', { name: /slate/i }).click();
    // Anchored: accessible-name matching is substring by default, and ANNOT-12 adds a
    // "Definition · SLATE" heading inside the dialog that would otherwise also match.
    await expect.element(page.getByRole('heading', { name: /^slate$/i })).toBeVisible();
    await expect.element(page.getByRole('heading', { name: /^Definition · SLATE$/ })).toBeVisible();
    await expect.element(page.getByText('A word used in a browser test.')).toBeVisible();
    await expect
      .element(page.getByRole('link', { name: 'Search web' }))
      .toHaveAttribute('href', 'https://www.google.com/search?q=define+slate');
    expect(definitionLookup).toHaveBeenCalledWith('slate');
  });

  it('looks up only the encountered GO prefix even when future answers remain in session state', async () => {
    let session = createGameSession({
      id: 'encountered-browser-review',
      ownerNamespace: 'guest',
      settings: {
        mode: 'go',
        length: 2,
        difficulty: 'standard',
        hardMode: false,
        goCount: 5,
      },
      answers: ['at', 'to', 'on', 'no', 'in'],
      now: '2026-08-01T20:00:00.000Z',
    });
    for (const letter of 'at') {
      session = reduceGame(session, {
        type: 'insert',
        letter,
        now: '2026-08-01T20:00:00.000Z',
      });
    }
    session = reduceGame(session, {
      type: 'submit',
      sanctionedWords: new Set(['at']),
      now: '2026-08-01T20:00:00.000Z',
    });
    session = reduceGame(session, {
      type: 'advance',
      now: '2026-08-01T20:00:02.000Z',
    });
    const review = selectEncounteredSoloGoAnswers({ ...session, status: 'lost' }, 'daily');
    expect(review.status).toBe('available');
    if (review.status !== 'available') return;

    const lookupWord = vi.fn(async (word: string) => ({
      schemaVersion: 1 as const,
      word,
      status: 'found' as const,
      source: 'dictionary-api' as const,
      definitions: [{ definition: `${word} definition` }],
      checkedAt: '2026-08-01T20:00:00.000Z',
      expiresAt: '2026-09-01T20:00:00.000Z',
      cached: false,
      stale: false,
    }));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <EncounteredGoReview entries={review.entries} lookupWord={lookupWord} />
      </QueryClientProvider>,
    );

    await expect.element(page.getByRole('heading', { name: 'Puzzle 1' })).toBeVisible();
    await expect.element(page.getByRole('heading', { name: 'Puzzle 2' })).toBeVisible();
    // ANNOT-12: the word is named inside the definition region itself, not only in the
    // surrounding entry heading, so it survives once the lookup settles.
    await expect.element(page.getByRole('heading', { name: /Definition · AT/ })).toBeVisible();
    await expect.element(page.getByRole('heading', { name: /Definition · TO/ })).toBeVisible();
    await expect.element(page.getByText('to definition')).toBeVisible();
    expect(lookupWord.mock.calls.map(([word]) => word)).toEqual(['at', 'to']);
    expect(queryClient.getQueryCache().find({ queryKey: ['definition', 'on'] })).toBeUndefined();
    expect(document.body.textContent).not.toContain('ON');
    expect(document.body.textContent).not.toContain('NO');
    expect(document.body.textContent).not.toContain('IN');
  });

  // ANNOT-12: whenever a definition region renders, it names its word — in every
  // branch, not only while the lookup is pending. One test per state, so each gets a
  // clean DOM instead of several definition regions competing for the same query.
  const definitionRecord = (status: 'found' | 'not-found') => ({
    schemaVersion: 1 as const,
    word: 'ideas',
    status,
    source: 'wiktionary' as const,
    definitions: status === 'found' ? [{ partOfSpeech: 'noun', definition: 'plural of idea' }] : [],
    checkedAt: '2026-08-05T00:00:00.000Z',
    expiresAt: '2026-09-05T00:00:00.000Z',
    cached: false,
    stale: false,
  });
  const definitionStates = [
    { label: 'found', lookup: async () => definitionRecord('found') },
    { label: 'not-found', lookup: async () => definitionRecord('not-found') },
    {
      label: 'error',
      lookup: async () => {
        throw new Error('offline');
      },
    },
  ];

  for (const state of definitionStates) {
    it(`names the word inside the definition region (${state.label})`, async () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      });
      render(
        <QueryClientProvider client={queryClient}>
          <WordDefinition word="ideas" lookupWord={state.lookup} />
        </QueryClientProvider>,
      );
      // The SS-12 defect: a settled definition rendered its gloss with no word.
      await expect.element(page.getByRole('heading', { name: /Definition · IDEAS/ })).toBeVisible();
      expect(document.querySelector('.word-definition .definition-word')?.textContent).toBe(
        'IDEAS',
      );
      queryClient.clear();
    });
  }

  it('renders only the word it was given, never another answer', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const lookupWord = vi.fn<(word: string) => Promise<DefinitionLookupResult>>(async () => ({
      schemaVersion: 1 as const,
      word: 'ideas',
      status: 'found' as const,
      source: 'wiktionary' as const,
      definitions: [{ partOfSpeech: 'noun', definition: 'a shared example' }],
      checkedAt: '2026-08-05T00:00:00.000Z',
      expiresAt: '2026-09-05T00:00:00.000Z',
      cached: false,
      stale: false,
    }));
    render(
      <QueryClientProvider client={queryClient}>
        <WordDefinition word="ideas" lookupWord={lookupWord} />
      </QueryClientProvider>,
    );
    await expect.element(page.getByText('a shared example')).toBeVisible();
    // The component receives one already-authorized word and looks up only that word,
    // so naming it in the region cannot widen answer disclosure.
    expect(lookupWord.mock.calls.map((call) => call[0])).toEqual(['ideas']);
    expect(
      queryClient
        .getQueryCache()
        .getAll()
        .map((query) => query.queryKey),
    ).toEqual([['definition', 'ideas']]);
    queryClient.clear();
  });

  // ANNOT-08: every true modal dialog opts into the one shared geometry class, so a
  // dialog can never again miss the `margin: auto` that the preflight reset cancels.
  // The rendered centering itself is asserted in the visual suite, which is the only
  // layer that loads the application stylesheets.
  it('marks every modal dialog with the shared geometry class', async () => {
    render(
      <AccentPresetDialog
        preset={null}
        busy={false}
        error=""
        onClose={vi.fn()}
        onSave={vi.fn(async () => true)}
        onDelete={vi.fn(async () => true)}
      />,
    );
    await expect.element(page.getByRole('heading', { name: 'Create custom accent' })).toBeVisible();
    const dialog = document.querySelector('dialog')!;
    expect(dialog.classList.contains('app-modal')).toBe(true);
    expect(dialog.open).toBe(true);
  });

  it('dismisses a modal on an outside click but never while an operation is pending', () => {
    let closed = false;
    // `target` and `currentTarget` are the same node for a backdrop click; a click on
    // inner content reports the inner node as `target`.
    const dialogStub = {
      getBoundingClientRect: () => ({
        left: 100,
        right: 300,
        top: 100,
        bottom: 300,
        width: 200,
        height: 200,
      }),
      close: () => {
        closed = true;
      },
    };
    const clickAt = (clientX: number, clientY: number, detail = 1, target: unknown = dialogStub) =>
      ({ target, currentTarget: dialogStub, detail, clientX, clientY }) as never;

    expect(isOutsideDialogClick(clickAt(10, 10))).toBe(true);
    // Inside the dialog box is never an outside click, even once a dialog has padding.
    expect(isOutsideDialogClick(clickAt(150, 150))).toBe(false);
    // A click on inner content is not a backdrop click.
    expect(isOutsideDialogClick(clickAt(10, 10, 1, { inner: true }))).toBe(false);
    // Keyboard-synthesized clicks (Enter on an inner control) report detail 0.
    expect(isOutsideDialogClick(clickAt(0, 0, 0))).toBe(false);

    // A submitted operation must not be lost to a stray backdrop click.
    dismissOnBackdrop(clickAt(10, 10), { pending: true });
    expect(closed).toBe(false);
    dismissOnBackdrop(clickAt(10, 10), { pending: false });
    expect(closed).toBe(true);
  });

  it('creates a normalized custom accent through the keyboard-safe native dialog', async () => {
    const onSave = vi.fn(async () => true);
    const onClose = vi.fn();
    render(
      <AccentPresetDialog
        preset={null}
        busy={false}
        error=""
        onClose={onClose}
        onSave={onSave}
        onDelete={vi.fn(async () => true)}
      />,
    );
    await expect.element(page.getByRole('heading', { name: 'Create custom accent' })).toBeVisible();
    await page.getByLabelText('Hex').fill('#ffffff');
    await page.getByLabelText(/Name/).fill('Paper');
    await page.getByRole('button', { name: 'SAVE AND USE' }).click();
    expect(onSave).toHaveBeenCalledWith({
      presetId: null,
      name: 'Paper',
      accentHex: '#FFFFFF',
      select: true,
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('requires an explicit second action before deleting a custom accent', async () => {
    const onDelete = vi.fn(async () => true);
    render(
      <AccentPresetDialog
        preset={{
          preset_id: '11111111-1111-4111-8111-111111111111',
          name: 'Aurora north',
          accent_hex: '#32BFA2',
          is_active: true,
          created_at: '2026-08-01T12:00:00.000Z',
          updated_at: '2026-08-01T12:00:00.000Z',
        }}
        busy={false}
        error=""
        onClose={vi.fn()}
        onSave={vi.fn(async () => true)}
        onDelete={onDelete}
      />,
    );
    await page.getByRole('button', { name: 'DELETE PRESET' }).click();
    expect(onDelete).not.toHaveBeenCalled();
    await page.getByRole('button', { name: 'CONFIRM DELETE' }).click();
    expect(onDelete).toHaveBeenCalledOnce();
  });

  /*
   * A2. The turn began 90s before the projection was read, so the player on move has
   * 3:30 left of a 5:00 budget. The read RPC is `stable` and never debits the running
   * turn, so `timeRemainingMs` still reads the full 300_000 — the elapsed 90s exists
   * only in the gap between `turnStartedAt` and `serverNow`. Anchoring to `serverNow`
   * instead loses that gap entirely and paints a fresh 5:00, which is the reported bug.
   */
  it('anchors the running clock to the turn start, not to the last fetch', async () => {
    const turnStartedAt = '2026-08-06T12:00:00.000Z';
    const serverNow = '2026-08-06T12:01:30.000Z';
    render(
      <>
        <ClockValue
          game={timedMatchProjection({ turnStartedAt, serverNow })}
          seat="player-one"
          observedAtMs={Date.now()}
        />
        <ClockValue
          game={timedMatchProjection({ turnStartedAt, serverNow })}
          seat="player-two"
          observedAtMs={Date.now()}
        />
      </>,
    );
    await expect
      .element(page.getByLabelText('player one time remaining'))
      .toHaveTextContent(/^3:(29|30)$/);
    // The inactive seat's stored value is already post-debit and must not tick.
    await expect
      .element(page.getByLabelText('player two time remaining'))
      .toHaveTextContent('5:00');
  });

  /*
   * W1. The regression that put CLAIM WIN ON TIME onto untimed matches lived exactly
   * here, at the seam between `readCombatClock` and `useCombatClockReading`: the hook
   * derives `running` from turn ownership alone, with no reference to whether the lane is
   * timed, so the seat on move in an untimed match reads as running — and the budget it
   * is running against is absent, because the server strips the null out of the
   * projection. Folding that absence into 0 made the seat expired.
   *
   * A unit test could not have caught it. It only appears when the hook's own `running`
   * meets a projection with no budget, which is why this is asserted through the rendered
   * component rather than against a hand-made clock reading.
   */
  it('never reports an untimed seat as out of time, however long the turn runs', async () => {
    render(
      <ClockValue
        game={untimedMatchProjection()}
        seat="player-one"
        observedAtMs={Date.now() - 6 * 60 * 60 * 1000}
      />,
    );
    const clock = page.getByLabelText('player one time remaining');
    // Six hours into an untimed turn: idle, not expired. `expired` here is what used to
    // render the claim control on a match with no clocks beside either player.
    await expect.element(clock).toHaveAttribute('data-clock', 'idle');
  });

  /*
   * A3. The point of the taxonomy is that the panel tells the truth and does not offer a
   * retry that cannot succeed. A 404 stays a 404 however many times you press the button.
   */
  it('tells a missing match from a private one and only offers a workable retry', async () => {
    const missing = await render(
      <MatchUnavailable kind="not-found" gameId="amordle-combat-v2-missing" onRetry={vi.fn()} />,
    );
    await expect.element(page.getByRole('heading', { name: 'Match not found' })).toBeVisible();
    await expect
      .element(page.getByText('MATCH amordle-combat-v2-missing · NOT-FOUND'))
      .toBeVisible();
    await expect.element(page.getByRole('link', { name: 'Active games' })).toBeVisible();
    expect(page.getByRole('button', { name: 'Try again' }).elements()).toHaveLength(0);
    missing.unmount();

    const forbidden = await render(
      <MatchUnavailable kind="forbidden" gameId="amordle-combat-v2-theirs" onRetry={vi.fn()} />,
    );
    await expect
      .element(page.getByRole('heading', { name: 'Match is private to its players' }))
      .toBeVisible();
    expect(page.getByRole('button', { name: 'Try again' }).elements()).toHaveLength(0);
    forbidden.unmount();

    const onRetry = vi.fn();
    render(
      <MatchUnavailable kind="unavailable" gameId="amordle-combat-v2-flaky" onRetry={onRetry} />,
    );
    await expect
      .element(page.getByRole('heading', { name: 'COMBAT services are unavailable' }))
      .toBeVisible();
    await page.getByRole('button', { name: 'Try again' }).click();
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

function timedMatchProjection({
  turnStartedAt,
  serverNow,
}: {
  turnStartedAt: string;
  serverNow: string;
}) {
  return combatProjectionSchema.parse({
    schemaVersion: 2,
    authorityVersion: 2,
    id: 'amordle-combat-v2-clock',
    scope: 'practice',
    mode: 'og',
    sourceKind: 'queue',
    visibilityKind: 'public',
    wordLength: 5,
    difficulty: 'standard',
    hardMode: false,
    timeLimitMs: 300_000,
    ranked: true,
    status: 'playing',
    version: 4,
    moveCount: 2,
    serverNow,
    createdAt: '2026-08-06T11:55:00.000Z',
    startedAt: '2026-08-06T11:56:00.000Z',
    updatedAt: turnStartedAt,
    turnStartedAt,
    currentTurn: 'player-one',
    currentPuzzleIndex: 0,
    attemptBudget: 6,
    viewerSeat: 'player-one',
    players: [
      { seat: 'player-one', displayName: 'You' },
      { seat: 'player-two', displayName: 'Rival' },
    ],
    moves: [],
    seededRows: [],
    playerState: {
      'player-one': {
        points: 0,
        attemptsThisPuzzle: 1,
        puzzlesSolved: 0,
        timeRemainingMs: 300_000,
      },
      'player-two': {
        points: 0,
        attemptsThisPuzzle: 1,
        puzzlesSolved: 0,
        timeRemainingMs: 300_000,
      },
    },
    capabilities: {
      canJoin: false,
      canSubmitGuess: true,
      canAdvance: false,
      canCancel: false,
      canForfeit: true,
      canSettleRating: false,
    },
    outcome: { terminal: false },
  });
}

/*
 * An untimed lane exactly as the server sends one: no `timeLimitMs`, no `turnStartedAt`,
 * and no `timeRemainingMs` on either seat. All three are emitted as null and removed by
 * `jsonb_strip_nulls`, so the client never sees the keys at all.
 */
function untimedMatchProjection() {
  const serverNow = '2026-08-08T12:00:00.000Z';
  return combatProjectionSchema.parse({
    schemaVersion: 2,
    authorityVersion: 2,
    id: 'amordle-combat-v2-untimed',
    scope: 'practice',
    mode: 'og',
    sourceKind: 'queue',
    visibilityKind: 'public',
    wordLength: 5,
    difficulty: 'standard',
    hardMode: false,
    ranked: false,
    status: 'playing',
    version: 4,
    moveCount: 2,
    serverNow,
    createdAt: '2026-08-08T06:00:00.000Z',
    startedAt: '2026-08-08T06:00:00.000Z',
    updatedAt: serverNow,
    currentTurn: 'player-one',
    currentPuzzleIndex: 0,
    attemptBudget: 6,
    viewerSeat: 'player-one',
    players: [
      { seat: 'player-one', displayName: 'You' },
      { seat: 'player-two', displayName: 'Rival' },
    ],
    moves: [],
    seededRows: [],
    playerState: {
      'player-one': { points: 0, attemptsThisPuzzle: 1, puzzlesSolved: 0 },
      'player-two': { points: 0, attemptsThisPuzzle: 1, puzzlesSolved: 0 },
    },
    capabilities: {
      canJoin: false,
      canSubmitGuess: true,
      canAdvance: false,
      canCancel: false,
      canForfeit: true,
      canSettleRating: false,
    },
    outcome: { terminal: false },
  });
}
