import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { createAdminSupabaseClient } from './supabaseAdmin'

export interface E2eUser {
  readonly displayName: string
  readonly email: string
  readonly id: string
  readonly label: string
  readonly password: string
}

export function createRunId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export async function createE2eUser(label: string, runId = createRunId()): Promise<E2eUser> {
  const admin = createAdminSupabaseClient()
  const email = `brrrdle-e2e-${label}-${runId}@example.test`.toLocaleLowerCase('en-US')
  const password = `Brrrdle-e2e-${runId}-A1!`
  const displayName = `E2E ${label} ${runId}`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
    user_metadata: {
      displayName,
    },
  })
  if (error || !data.user?.id) {
    throw new Error(`Unable to create E2E user ${label}: ${error?.message ?? 'missing user id'}`)
  }
  return { displayName, email, id: data.user.id, label, password }
}

export async function deleteE2eUser(user: E2eUser | undefined): Promise<void> {
  if (!user) {
    return
  }
  const admin = createAdminSupabaseClient()
  let lastErrorMessage = 'unknown deletion failure'
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const { error } = await admin.auth.admin.deleteUser(user.id)
    if (!error) {
      return
    }
    lastErrorMessage = error.message
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 250))
    }
  }
  throw new Error(`Unable to delete E2E user ${user.label}: ${lastErrorMessage}`)
}

export async function signInThroughUi(page: Page, user: E2eUser): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: /sign in or create an account/i }).click()
  await page.getByRole('tab', { name: /email \+ password/i }).click()
  await page.getByLabel(/email address/i).fill(user.email)
  await page.getByLabel(/^password$/i).fill(user.password)
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await expect(page.getByRole('button', { name: /open (?:account menu|profile(?: tab)?) for/i })).toBeVisible()
}
