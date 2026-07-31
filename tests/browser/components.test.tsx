import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { GameHistoryViewport } from '@/components/game-history-viewport';
import { GameKeyboard } from '@/components/game-keyboard';
import {
  rankedDailyQueueIntentSchema,
  rankedPracticeQueueIntentSchema,
  readRankedDailyQueueIntent,
  readRankedPracticeQueueIntent,
  writeRankedDailyQueueIntent,
  writeRankedPracticeQueueIntent,
} from '@/adapters/session-combat';
import { operationId } from '@/adapters/supabase/shared';
import { isEditableShortcutTarget } from '@/application/keyboard-shortcuts';
import { prunePublicWordAssetCache, validatePublicWordAsset } from '@/adapters/word-lists';
import { MoveBoards } from '@/features/combat/combat-transcript';
import { FeedbackBuilder } from '@/features/support/feedback-builder';
import { WordResults } from '@/features/words/word-results';

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
    render(
      <WordResults
        words={['crane', 'slate']}
        answerEligible={['crane']}
        total={2}
        page={1}
        pages={1}
      />,
    );
    await expect
      .element(page.getByRole('option', { name: /crane/i }))
      .toHaveAttribute('aria-selected', 'true');
    await page.getByRole('option', { name: /slate/i }).click();
    await expect.element(page.getByRole('heading', { name: 'slate' })).toBeVisible();
    await expect
      .element(page.getByRole('link', { name: 'Search definition' }))
      .toHaveAttribute('href', 'https://www.google.com/search?q=define+slate');
  });
});
