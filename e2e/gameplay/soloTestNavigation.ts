import { expect, type Page } from '@playwright/test'

export async function navigateToSoloPractice(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^PLAY$/i }).click()
  await expect(page.locator('#solo-workspace-title')).toBeVisible()
  await page.getByRole('tab', { name: /^Practice Solo$/i }).click()
  await expect(page.getByRole('group', { name: /^Practice Solo mode$/i })).toBeVisible()
}
