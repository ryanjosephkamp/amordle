import type { Page } from '@playwright/test';

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? '';
const shareUrl = process.env.VERCEL_PREVIEW_SHARE_URL ?? '';

function previewHost(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname === 'amordle.vercel.app') {
    throw new Error('Hosted UI tests require an authorized non-production HTTPS Preview.');
  }
  return url.hostname;
}

export async function unlockProtectedPreview(page: Page): Promise<void> {
  if (!shareUrl) return;
  if (previewHost(shareUrl) !== previewHost(baseUrl)) {
    throw new Error('The protected Preview share target does not match PLAYWRIGHT_BASE_URL.');
  }
  await page.goto(shareUrl, { waitUntil: 'domcontentloaded' });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
}
