import { chromium } from '@playwright/test';
import { chmod, mkdir } from 'node:fs/promises';
import path from 'node:path';

const storageStatePath = '.codex-internal/evidence/operator/vercel-protection-storage-state.json';

export default async function globalSetup() {
  const secret = process.env.E2E_VERCEL_BYPASS_SECRET;
  const rawBaseURL = process.env.E2E_BASE_URL;
  if (!secret || !rawBaseURL) return;

  const baseURL = new URL(rawBaseURL);
  if (baseURL.protocol !== 'https:') {
    throw new Error('The Vercel protection bootstrap requires an HTTPS Preview.');
  }
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const bootstrapURL = new URL(baseURL);
    bootstrapURL.searchParams.set('x-vercel-protection-bypass', secret);
    bootstrapURL.searchParams.set('x-vercel-set-bypass-cookie', 'true');
    const response = await page.goto(bootstrapURL.toString(), { waitUntil: 'domcontentloaded' });
    if (!response || response.status() !== 200 || new URL(page.url()).origin !== baseURL.origin) {
      throw new Error('The protected Preview bypass cookie could not be established.');
    }
    await mkdir(path.dirname(storageStatePath), { recursive: true, mode: 0o700 });
    await context.storageState({ path: storageStatePath });
    await chmod(storageStatePath, 0o600);
  } finally {
    await browser.close();
  }
}
