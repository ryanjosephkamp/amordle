/**
 * Build pre-filled GitHub "new issue" URLs for the amordle repository.
 *
 * The helpers below never submit anything on the user's behalf; they only
 * construct the URL that the user will open in a new tab and review on
 * github.com before clicking "Submit new issue". All values are percent-
 * encoded via `URLSearchParams`.
 */

export const BRRRDLE_REPO_OWNER = 'ryanjosephkamp'
export const BRRRDLE_REPO_NAME = 'amordle'

export interface NewIssueInput {
  readonly title: string
  readonly body: string
  readonly labels?: readonly string[]
}

export function buildNewIssueUrl(input: NewIssueInput): string {
  const params = new URLSearchParams()
  params.set('title', input.title)
  params.set('body', input.body)
  if (input.labels && input.labels.length > 0) {
    params.set('labels', input.labels.join(','))
  }

  return `https://github.com/${BRRRDLE_REPO_OWNER}/${BRRRDLE_REPO_NAME}/issues/new?${params.toString()}`
}

export interface WordRequestInput {
  readonly word: string
  readonly length: number
  readonly date: string
  readonly reason?: string
}

export function buildWordRequestIssueUrl(input: WordRequestInput): string {
  const normalizedWord = input.word.trim()
  const title = `Word request: "${normalizedWord}" (length ${input.length})`
  const reasonBlock = input.reason && input.reason.trim().length > 0
    ? input.reason.trim()
    : '<!-- Optional: tell us why this word matters to you. -->'

  const body = [
    `**Requested word:** \`${normalizedWord}\``,
    `**Length:** ${input.length}`,
    `**Date:** ${input.date}`,
    '',
    'This request was submitted from the in-game Word Explorer.',
    '',
    '### Why this word?',
    reasonBlock,
  ].join('\n')

  return buildNewIssueUrl({ title, body, labels: ['word-request'] })
}

export type FeedbackCategory = 'Bug Report' | 'Feature Request' | 'Other'

export interface FeedbackInput {
  readonly category: FeedbackCategory
  readonly description: string
  readonly details?: string
  readonly email?: string
  readonly date: string
}

const CATEGORY_LABEL_MAP: Record<FeedbackCategory, readonly string[]> = {
  'Bug Report': ['feedback', 'bug'],
  'Feature Request': ['feedback', 'enhancement'],
  Other: ['feedback'],
}

export function buildFeedbackIssueUrl(input: FeedbackInput): string {
  const trimmedDescription = input.description.trim()
  const summary = trimmedDescription.length > 60
    ? `${trimmedDescription.slice(0, 57)}...`
    : trimmedDescription
  const title = `[${input.category}] ${summary}`

  const sections: string[] = [
    `**Category:** ${input.category}`,
    `**Date:** ${input.date}`,
  ]
  if (input.email && input.email.trim().length > 0) {
    sections.push(`**Email (optional):** ${input.email.trim()}`)
  }
  sections.push('', '### Description', trimmedDescription)
  if (input.details && input.details.trim().length > 0) {
    sections.push('', '### Optional details', input.details.trim())
  }
  sections.push('', '_Submitted via the in-game Feedback tab._')

  return buildNewIssueUrl({
    title,
    body: sections.join('\n'),
    labels: CATEGORY_LABEL_MAP[input.category],
  })
}
