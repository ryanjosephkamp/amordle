import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { GameHistoryViewport } from '@/components/game-history-viewport';
import { GameKeyboard } from '@/components/game-keyboard';
import { MoveBoards } from '@/features/combat/combat-transcript';
import { FeedbackBuilder } from '@/features/support/feedback-builder';
import { WordResults } from '@/features/words/word-results';

describe('browser components', () => {
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
