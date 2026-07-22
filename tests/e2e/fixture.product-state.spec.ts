import { expect, test } from '@playwright/test';

test('supporting routes render truthful empty projections without proof records', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await expect(page.locator('main')).not.toContainText('Puzzle 2/3');

  await page.goto('/play');
  await expect(page.locator('main')).not.toContainText('Solo · 2 active');
  await expect(page.locator('main')).not.toContainText('one prior answer carried');

  await page.goto('/history');
  await expect(page.locator('main')).not.toContainText('141 pts');
  await expect(page.locator('main')).not.toContainText('+50 XP');

  await page.goto('/stats');
  await expect(page.locator('main')).not.toContainText('1535');
  await expect(page.locator('main')).not.toContainText('47', { useInnerText: true });

  await page.goto('/marketplace');
  await expect(page.getByText('Owned 0', { exact: true })).toHaveCount(2);
  await expect(page.locator('main')).not.toContainText('42');

  await page.goto('/profile');
  await expect(page.locator('main')).not.toContainText('Dennis Sellers');
  await expect(page.locator('main')).not.toContainText('Five letters. No excuses.');

  await page.goto('/calendar');
  await expect(page.locator('main')).not.toContainText('Current 3 · Best 8');
  await expect(page.locator('main')).not.toContainText('Current 1 · Best 4');
});

test('Word Explorer never classifies visible words as answer-pool members', async ({ page }) => {
  await page.goto('/word-explorer');
  await expect(page.locator('.search-metadata')).toContainText(/^\d+ matching valid words/);
  await expect(page.locator('.ruled-list .word-row').first()).toBeVisible();
  await expect(page.locator('.explorer-layout')).not.toContainText('Answer & valid guess');
  await expect(page.locator('.definition-panel')).not.toContainText(/Casual|Standard|Expert/);
});

test('Feedback previews an explicit sanitized handoff without submitting it', async ({ page }) => {
  const outgoing: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('github.com') && request.method() !== 'GET') {
      outgoing.push(`${request.method()} ${request.url()}`);
    }
  });
  await page.goto('/feedback');
  await page.getByLabel('What happened?').fill('Keyboard focus is lost after opening the dock.');
  await page.getByRole('button', { name: 'Review handoff' }).click();
  const preview = page.locator('.issue-preview');
  await expect(preview).toContainText('Keyboard focus is lost after opening the dock.');
  await expect(preview).toContainText('No private account or game state was attached.');
  await expect(preview).not.toContainText(/access_token|refresh_token|user_id|@/i);
  expect(outgoing).toEqual([]);
});

test('a real local Solo lane appears in Home and Play without exposing its answer', async ({
  page,
}) => {
  await page.goto('/play/practice/og?length=7');
  await expect(page.getByRole('grid', { name: '7-letter word board' })).toBeVisible({
    timeout: 15_000,
  });
  const answer = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) =>
      candidate.startsWith('amordle:solo:practice:og:active:7l'),
    );
    const stored = key ? (JSON.parse(localStorage.getItem(key) ?? '{}') as unknown) : null;
    if (!stored || typeof stored !== 'object') return '';
    const payload = (stored as { payload?: { answer?: unknown } }).payload;
    return typeof payload?.answer === 'string' ? payload.answer : '';
  });
  expect(answer).toMatch(/^[a-z]{7}$/);

  await page.goto('/');
  await expect(page.getByText('Practice Solo · OG · 7L', { exact: true })).toBeVisible();
  await expect(page.locator('main')).not.toContainText(answer.toUpperCase());

  await page.goto('/play');
  await expect(page.getByText('Practice Solo · OG · 7L', { exact: true })).toBeVisible();
  await expect(page.locator('main')).not.toContainText(answer.toUpperCase());
});

test('GO carry-over evidence consumes playable rows across the five-puzzle chain', async ({
  page,
}) => {
  test.setTimeout(45_000);
  await page.goto('/play/practice/go?length=2&count=5');
  await expect(page.getByRole('grid', { name: '2-letter word board' })).toBeVisible({
    timeout: 15_000,
  });

  const solveCurrentPuzzle = async () => {
    await expect(page.locator('.keyboard')).toBeVisible();
    const answer = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((candidate) =>
        candidate.startsWith('amordle:solo:practice:go:active:2l'),
      );
      const envelope = key ? JSON.parse(localStorage.getItem(key) ?? '{}') : {};
      const index = envelope?.payload?.currentPuzzleIndex;
      return typeof index === 'number' && typeof envelope?.payload?.answers?.[index] === 'string'
        ? envelope.payload.answers[index]
        : '';
    });
    expect(answer).toMatch(/^[a-z]{2}$/);
    await page.keyboard.type(answer);
    await page.keyboard.press('Enter');
    await expect(page.locator('.game-transition-band.is-active')).toBeVisible();
  };

  await expect(page.getByText('6 attempts remaining')).toBeVisible();
  await solveCurrentPuzzle();
  await expect(page.getByText('5 attempts remaining')).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole('row', { name: /P1 seeded evidence row/ })).toBeVisible();

  await solveCurrentPuzzle();
  await expect(page.getByText('4 attempts remaining')).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole('row')).toHaveCount(6);
  await expect(page.getByRole('row', { name: /P2 seeded evidence row/ })).toBeVisible();

  await solveCurrentPuzzle();
  await expect(page.getByText('3 attempts remaining')).toBeVisible({ timeout: 5_000 });

  await solveCurrentPuzzle();
  await expect(page.getByText('2 attempts remaining')).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole('row')).toHaveCount(6);
  await expect(page.getByRole('row', { name: /P4 seeded evidence row/ })).toBeVisible();
});

test('terminal Solo is excluded from active lanes and retained in local History', async ({
  page,
}) => {
  await page.goto('/play/practice/og?length=2');
  await expect(page.getByRole('grid', { name: '2-letter word board' })).toBeVisible({
    timeout: 15_000,
  });
  const answer = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) =>
      candidate.startsWith('amordle:solo:practice:og:active:2l'),
    );
    const stored = key ? (JSON.parse(localStorage.getItem(key) ?? '{}') as unknown) : null;
    if (!stored || typeof stored !== 'object') return '';
    const payload = (stored as { payload?: { answer?: unknown } }).payload;
    return typeof payload?.answer === 'string' ? payload.answer : '';
  });
  expect(answer).toMatch(/^[a-z]{2}$/);
  await page.keyboard.type(answer);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'OG puzzle complete' })).toBeVisible();

  await page.goto('/play');
  await expect(page.getByText('Practice Solo · OG · 2L', { exact: true })).toHaveCount(0);
  await page.goto('/history');
  await expect(page.getByRole('table', { name: 'Completed games' })).toContainText(
    'Practice Solo · OG',
  );
  await expect(page.getByRole('table', { name: 'Completed games' })).toContainText('Won');
});

test('guest Marketplace inventory changes the real Practice board and keyboard', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('amordle:progression:guest')) return;
    const now = new Date().toISOString();
    localStorage.setItem(
      'amordle:progression:guest',
      JSON.stringify({
        schemaVersion: 1,
        owner: { kind: 'guest' },
        revision: 1,
        updatedAt: now,
        payload: {
          xp: 0,
          coins: 100,
          rewardedGameIds: [],
          unlockedDailies: [],
          appliedUnlockIds: [],
          rewardOperations: {},
          unlockOperations: {},
          consumables: { revealOneLetter: 0, removeIncorrectLetters: 0 },
          economyRevision: 0,
          economyOperations: {},
          pendingDailyUnlocks: {},
        },
      }),
    );
  });
  await page.goto('/marketplace');
  await page.getByRole('button', { name: 'Buy 1 · 25 coins' }).click();
  await expect(page.getByText('Owned 1', { exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Buy 1 · 40 coins' }).click();
  await expect(page.getByText('Owned 1', { exact: true })).toHaveCount(2);

  await page.goto('/play/practice/og?length=5');
  await expect(page.getByRole('grid', { name: '5-letter word board' })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: /Reveal one letter · 1 owned/ }).click();
  await expect(page.getByRole('gridcell', { name: /, draft/ })).toHaveCount(1);
  await page.getByRole('button', { name: /Remove incorrect · 1 owned/ }).click();
  await expect(page.locator('.key[data-state="removed"]')).toHaveCount(5);
  await expect(page.getByRole('button', { name: /Reveal one letter · 0 owned/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /Remove incorrect · 0 owned/ })).toBeDisabled();
});

test('exhausted Practice persists before paid continuation and finalizes only after reveal', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('amordle:progression:guest')) return;
    localStorage.setItem(
      'amordle:progression:guest',
      JSON.stringify({
        schemaVersion: 1,
        owner: { kind: 'guest' },
        revision: 1,
        updatedAt: new Date().toISOString(),
        payload: {
          xp: 0,
          coins: 100,
          rewardedGameIds: [],
          unlockedDailies: [],
          appliedUnlockIds: [],
          rewardOperations: {},
          unlockOperations: {},
          consumables: { revealOneLetter: 0, removeIncorrectLetters: 0 },
          economyRevision: 0,
          economyOperations: {},
          pendingDailyUnlocks: {},
        },
      }),
    );
  });
  await page.goto('/play/practice/og?length=2');
  await expect(page.getByRole('grid', { name: '2-letter word board' })).toBeVisible({
    timeout: 15_000,
  });
  const answer = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) =>
      candidate.startsWith('amordle:solo:practice:og:active:2l'),
    );
    const envelope = key ? JSON.parse(localStorage.getItem(key) ?? '{}') : {};
    return typeof envelope?.payload?.answer === 'string' ? envelope.payload.answer : '';
  });
  const wrongGuess = await page.evaluate(async (activeAnswer) => {
    const response = await fetch('/word-lists/bundled/words_length_2.json');
    const document = (await response.json()) as { validGuesses?: string[] };
    return document.validGuesses?.find(
      (word) =>
        word !== activeAnswer && [...word].every((letter) => !activeAnswer.includes(letter)),
    );
  }, answer);
  expect(wrongGuess).toMatch(/^[a-z]{2}$/);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await page.keyboard.type(wrongGuess!);
    await page.keyboard.press('Enter');
    await expect(page.getByText(`${5 - attempt} attempts remaining`)).toBeVisible();
  }
  const continueButton = page.getByRole('button', { name: /Continue · \d+ coins/ });
  await expect(continueButton).toBeVisible();

  await page.goto('/history');
  await expect(page.getByRole('table', { name: 'Completed games' })).not.toContainText(
    'Practice Solo · OG · 2L',
  );
  await page.goto('/play/practice/og?length=2');
  await page.getByRole('button', { name: /Continue · \d+ coins/ }).click();
  await expect(page.getByText('1 attempts remaining')).toBeVisible();

  await page.keyboard.type(wrongGuess!);
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Reveal and record loss' }).click();
  await expect(page.getByRole('link', { name: 'History' }).last()).toBeVisible();
  await page.goto('/history');
  await expect(page.getByRole('table', { name: 'Completed games' })).toContainText(
    'Practice Solo · OG · 2L',
  );
  await expect(page.getByRole('table', { name: 'Completed games' })).toContainText('Lost');
});
