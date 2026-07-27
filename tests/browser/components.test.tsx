import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { FeedbackBuilder } from '@/features/support/feedback-builder';
import { WordResults } from '@/features/words/word-results';

describe('browser components', () => {
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
