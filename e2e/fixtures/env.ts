import fs from 'node:fs'
import path from 'node:path'

export interface E2eEnv {
  readonly baseURL: string
  readonly supabaseAnonKey: string
  readonly supabaseServiceRoleKey?: string
  readonly supabaseUrl: string
}

function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    return {}
  }

  const parsed: Record<string, string> = {}
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/u)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }
    const index = line.indexOf('=')
    if (index === -1) {
      continue
    }
    const key = line.slice(0, index).trim()
    const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/gu, '')
    if (key && value) {
      parsed[key] = value
    }
  }
  return parsed
}

let loaded = false

export function loadLocalEnv(): void {
  if (loaded) {
    return
  }
  loaded = true

  const cwd = process.cwd()
  for (const fileName of ['.env.local', '.env']) {
    const values = parseEnvFile(path.join(cwd, fileName))
    for (const [key, value] of Object.entries(values)) {
      process.env[key] ??= value
    }
  }
}

function firstEnv(...keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim()
    if (value) {
      return value
    }
  }
  return undefined
}

export function getE2eEnv(): E2eEnv {
  loadLocalEnv()

  const supabaseUrl = firstEnv('E2E_SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_URL')
  const supabaseAnonKey = firstEnv('E2E_SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY')
  const supabaseServiceRoleKey = firstEnv('E2E_SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY')
  const baseURL = firstEnv('E2E_BASE_URL') ?? `http://127.0.0.1:${process.env.E2E_PORT ?? '5173'}`

  const missing = [
    supabaseUrl ? undefined : 'E2E_SUPABASE_URL or VITE_SUPABASE_URL',
    supabaseAnonKey ? undefined : 'E2E_SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY',
  ].filter((value): value is string => Boolean(value))

  if (missing.length > 0) {
    throw new Error(`Missing required E2E environment: ${missing.join(', ')}`)
  }

  return {
    baseURL,
    supabaseAnonKey,
    supabaseServiceRoleKey,
    supabaseUrl,
  }
}

export function hasServiceRoleKey(): boolean {
  return Boolean(getE2eEnv().supabaseServiceRoleKey)
}
