import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AboutBrrrdlePanel, RANKED_ELO_ABOUT_SECTION_ID } from './App'

describe('AboutBrrrdlePanel', () => {
  it('keeps deeper current-surface reference content on About instead of Help', () => {
    const html = renderToStaticMarkup(<AboutBrrrdlePanel />)

    expect(html).toContain('Current amordle reference')
    expect(html).toContain('Daily games are fixed shared puzzles')
    expect(html).toContain('Practice games are configurable before the first submitted guess')
    expect(html).toContain('OG is one board')
    expect(html).toContain('GO is a chain of boards')
    expect(html).toContain('Practice Multiplayer supports OG, GO, lobbies, private Practice requests')
    expect(html).toContain('Daily Multiplayer stays asynchronous, five letters, UTC-day keyed')
    expect(html).toContain('Public profile links use approved public fields only')
    expect(html).toContain('Stats separates private local play from aggregate site totals')
    expect(html).toContain('Daily spectator access excluded')
  })

  it('contains the expanded ranked Elo explanation in a stable About anchor', () => {
    const html = renderToStaticMarkup(<AboutBrrrdlePanel />)

    expect(html).toContain(`id="${RANKED_ELO_ABOUT_SECTION_ID}"`)
    expect(html).toContain('How Elo is calculated')
    expect(html).toContain('Ranked matchmaking is signed-in only')
    expect(html).toContain('Ranked Daily uses fixed five-letter, no-clock OG and GO queues')
    expect(html).toContain('canonical five-minute Practice, and ranked Daily OG/GO use separate rating buckets')
    expect(html).not.toContain('timed Practice ranked remain deferred')
    expect(html).toContain('Every bucket starts at 1200')
    expect(html).toContain('K is the rating-movement multiplier')
    expect(html).toContain('first 10 ranked Practice games')
    expect(html).toContain('provisional and use K=40')
    expect(html).toContain('established games use K=24')
    expect(html).toContain('standard 400-point Elo curve')
    expect(html).toContain('aria-label="Expected score formula"')
    expect(html).toContain('expected score = 1 / (1 + 10 ^ ((opponent rating - your rating) / 400))')
    expect(html).toContain('Wins count as 1, draws count as 0.5, and losses count as 0')
    expect(html).toContain('Match points decide the match result first')
    expect(html).toContain('trusted settlement confirms server-authorized ranked Practice or ranked Daily evidence')
    expect(html).toContain('unsupported timed Practice games')
  })
})
