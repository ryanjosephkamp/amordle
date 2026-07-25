import { chromium, type FullConfig } from '@playwright/test';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const storageStatePath = path.join(
  process.cwd(),
  '.codex-internal',
  'evidence',
  'protected-preview-storage-state.json',
);

export default async function protectedPreviewGlobalSetup(config: FullConfig) {
  const shareUrl = process.env.VERCEL_PREVIEW_SHARE_URL;
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL;
  if (!shareUrl || !baseUrl) return undefined;

  const share = new URL(shareUrl);
  const target = new URL(baseUrl);
  if (
    share.protocol !== 'https:' ||
    target.protocol !== 'https:' ||
    share.hostname !== target.hostname ||
    target.hostname === 'amordle.vercel.app'
  ) {
    throw new Error('Protected Preview storage state target identity did not match.');
  }
  if (!config.projects.some((project) => project.use.baseURL === baseUrl)) {
    throw new Error('Protected Preview storage state is not bound to this Playwright run.');
  }

  await mkdir(path.dirname(storageStatePath), { recursive: true, mode: 0o700 });
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(shareUrl, { waitUntil: 'domcontentloaded' });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await context.storageState({ path: storageStatePath });
  } finally {
    await browser.close();
  }

  return async () => {
    await rm(storageStatePath, { force: true });
  };
}
