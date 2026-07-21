/// <reference types="node" />

import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

const cssPath = path.resolve(process.cwd(), 'src/index.css')
const css = fs.readFileSync(cssPath, 'utf8')

const requiredTokens = [
  '--color-canvas',
  '--color-surface-1',
  '--color-surface-2',
  '--color-line-subtle',
  '--color-line-strong',
  '--color-text-strong',
  '--color-text-body',
  '--color-text-muted',
  '--color-accent-action',
  '--color-status-correct',
  '--color-status-present',
  '--color-status-absent',
  '--color-status-danger',
  '--color-status-neutral',
  '--color-ember-atmosphere',
  '--color-frost-atmosphere',
  '--color-focus-ring',
  '--space-1',
  '--space-2',
  '--space-3',
  '--space-4',
  '--space-6',
  '--space-8',
  '--space-12',
  '--radius-sm',
  '--radius-md',
  '--radius-lg',
  '--border-default',
  '--border-emphasis',
  '--font-family-ui',
  '--font-size-body',
  '--font-size-metadata',
  '--line-height-body',
  '--font-numeric',
  '--motion-duration-fast',
  '--motion-duration-standard',
  '--motion-ease-functional',
] as const

function parseHexColor(css: string, token: string): string {
  const match = new RegExp(`${token}:\\s*(#[0-9a-f]{6})`, 'iu').exec(css)
  expect(match, `${token} must use a deterministic six-digit hex value`).not.toBeNull()
  return match?.[1] ?? '#000000'
}

function channelToLinear(channel: number): number {
  const normalized = channel / 255
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16))
  const [red = 0, green = 0, blue = 0] = channels.map(channelToLinear)
  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue)
}

function contrastRatio(first: string, second: string): number {
  const firstLuminance = luminance(first)
  const secondLuminance = luminance(second)
  const lighter = Math.max(firstLuminance, secondLuminance)
  const darker = Math.min(firstLuminance, secondLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

describe('Wave 01 semantic token contract', () => {
  test('declares every accepted semantic foundation role', () => {
    for (const token of requiredTokens) {
      expect(css, `missing ${token}`).toContain(`${token}:`)
    }
  })

  test('keeps legacy shell variables as semantic compatibility aliases', () => {
    expect(css).toContain('--color-polar-night: var(--color-canvas);')
    expect(css).toContain('--color-deep-ice: var(--color-surface-1);')
    expect(css).toContain('--color-ice-100: var(--color-text-strong);')
    expect(css).toContain('--color-ice-200: var(--color-accent-action);')
    expect(css).toContain('--color-ice-300: var(--color-line-strong);')
    expect(css).toContain('--brrrdle-line: var(--color-line-subtle);')
  })

  test('meets the accepted normal-text and visible-focus contrast floors', () => {
    const canvas = parseHexColor(css, '--color-canvas')
    const surfaceOne = parseHexColor(css, '--color-surface-1')
    const surfaceTwo = parseHexColor(css, '--color-surface-2')

    expect(contrastRatio(canvas, parseHexColor(css, '--color-text-body'))).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(surfaceOne, parseHexColor(css, '--color-text-muted'))).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(surfaceTwo, parseHexColor(css, '--color-text-strong'))).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(canvas, parseHexColor(css, '--color-accent-action'))).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(surfaceOne, parseHexColor(css, '--color-focus-ring'))).toBeGreaterThanOrEqual(3)
  })
})
