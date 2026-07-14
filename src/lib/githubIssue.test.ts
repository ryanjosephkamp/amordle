import { describe, expect, it } from 'vitest'
import {
  BRRRDLE_REPO_NAME,
  BRRRDLE_REPO_OWNER,
  buildFeedbackIssueUrl,
  buildNewIssueUrl,
  buildWordRequestIssueUrl,
} from './githubIssue'

describe('buildNewIssueUrl', () => {
  it('produces a URL pointing at the amordle repo', () => {
    const url = buildNewIssueUrl({ title: 't', body: 'b' })
    expect(url.startsWith(`https://github.com/${BRRRDLE_REPO_OWNER}/${BRRRDLE_REPO_NAME}/issues/new?`)).toBe(true)
  })

  it('percent-encodes special characters in title, body, and labels', () => {
    const url = buildNewIssueUrl({
      title: 'Hello "world" & friends',
      body: 'line1\nline2 with #hash',
      labels: ['word-request', 'needs triage'],
    })
    const parsed = new URL(url)
    expect(parsed.searchParams.get('title')).toBe('Hello "world" & friends')
    expect(parsed.searchParams.get('body')).toBe('line1\nline2 with #hash')
    expect(parsed.searchParams.get('labels')).toBe('word-request,needs triage')
  })

  it('omits the labels parameter when no labels are supplied', () => {
    const url = buildNewIssueUrl({ title: 't', body: 'b' })
    expect(new URL(url).searchParams.has('labels')).toBe(false)
  })
})

describe('buildWordRequestIssueUrl', () => {
  it('includes the word, length, and word-request label', () => {
    const url = buildWordRequestIssueUrl({ word: 'igloo', length: 5, date: '2026-05-27' })
    const parsed = new URL(url)
    expect(parsed.searchParams.get('title')).toBe('Word request: "igloo" (length 5)')
    expect(parsed.searchParams.get('labels')).toBe('word-request')
    const body = parsed.searchParams.get('body') ?? ''
    expect(body).toContain('igloo')
    expect(body).toContain('**Length:** 5')
    expect(body).toContain('2026-05-27')
    expect(body).toContain('in-game Word Explorer')
  })

  it('uses the user reason when provided', () => {
    const url = buildWordRequestIssueUrl({ word: 'cat', length: 3, date: '2026-05-27', reason: 'My favourite pet.' })
    const body = new URL(url).searchParams.get('body') ?? ''
    expect(body).toContain('My favourite pet.')
  })

  it('handles words with quotes and unicode safely', () => {
    const url = buildWordRequestIssueUrl({ word: "don't", length: 5, date: '2026-05-27' })
    const parsed = new URL(url)
    expect(parsed.searchParams.get('title')).toBe('Word request: "don\'t" (length 5)')
  })
})

describe('buildFeedbackIssueUrl', () => {
  it('labels Bug Report with feedback and bug', () => {
    const url = buildFeedbackIssueUrl({ category: 'Bug Report', description: 'crash on submit', date: '2026-05-27' })
    expect(new URL(url).searchParams.get('labels')).toBe('feedback,bug')
  })

  it('labels Feature Request with feedback and enhancement', () => {
    const url = buildFeedbackIssueUrl({ category: 'Feature Request', description: 'add dark mode', date: '2026-05-27' })
    expect(new URL(url).searchParams.get('labels')).toBe('feedback,enhancement')
  })

  it('labels Other with feedback only', () => {
    const url = buildFeedbackIssueUrl({ category: 'Other', description: 'misc', date: '2026-05-27' })
    expect(new URL(url).searchParams.get('labels')).toBe('feedback')
  })

  it('includes optional email and details when supplied', () => {
    const url = buildFeedbackIssueUrl({
      category: 'Other',
      description: 'desc',
      details: 'extra info',
      email: 'user@example.com',
      date: '2026-05-27',
    })
    const body = new URL(url).searchParams.get('body') ?? ''
    expect(body).toContain('user@example.com')
    expect(body).toContain('extra info')
  })

  it('omits optional email and details when absent', () => {
    const url = buildFeedbackIssueUrl({ category: 'Other', description: 'desc', date: '2026-05-27' })
    const body = new URL(url).searchParams.get('body') ?? ''
    expect(body).not.toContain('Email (optional):')
    expect(body).not.toContain('Optional details')
  })
})
