import { useMemo, useState } from 'react'
import { Button, Panel } from '../ui'
import { buildFeedbackIssueUrl, type FeedbackCategory } from '../lib/githubIssue'

const CATEGORIES: readonly FeedbackCategory[] = ['Bug Report', 'Feature Request', 'Other']

function currentIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export function FeedbackPanel() {
  const [category, setCategory] = useState<FeedbackCategory>('Bug Report')
  const [description, setDescription] = useState<string>('')
  const [details, setDetails] = useState<string>('')
  const [email, setEmail] = useState<string>('')
  const [showError, setShowError] = useState<boolean>(false)

  const trimmedDescription = description.trim()
  const isValid = trimmedDescription.length > 0

  const issueUrl = useMemo(() => {
    if (!isValid) {
      return undefined
    }
    return buildFeedbackIssueUrl({
      category,
      description: trimmedDescription,
      details: details.trim() || undefined,
      email: email.trim() || undefined,
      date: currentIsoDate(),
    })
  }, [category, trimmedDescription, details, email, isValid])

  return (
    <section className="space-y-4" aria-labelledby="feedback-title">
      <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--color-ice-200)]">share your thoughts</p>
      <h2 id="feedback-title" className="text-3xl font-bold text-white">Feedback</h2>
      <p className="max-w-3xl text-base leading-7 text-slate-300">
        Send a bug report, feature request, or general note. Submitting opens a pre-filled GitHub issue in a new
        tab — you can review and edit it before posting. Nothing is sent automatically.
      </p>

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (!isValid || !issueUrl) {
            setShowError(true)
            return
          }
          setShowError(false)
          window.open(issueUrl, '_blank', 'noopener,noreferrer')
        }}
      >
        <Panel className="space-y-3 text-sm leading-6 text-slate-300" tone="muted">
          <label className="grid gap-1 font-semibold text-cyan-100">
            Category
            <select
              className="rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]"
              onChange={(event) => setCategory(event.target.value as FeedbackCategory)}
              value={category}
            >
              {CATEGORIES.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 font-semibold text-cyan-100">
            Description<span aria-hidden className="text-rose-300"> *</span>
            <textarea
              aria-invalid={showError && !isValid}
              aria-required="true"
              className="h-24 rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]"
              maxLength={2000}
              onChange={(event) => setDescription(event.target.value)}
              required
              value={description}
            />
            <span className="text-xs font-normal text-slate-400">{description.length} / 2000 characters</span>
          </label>

          <label className="grid gap-1 font-semibold text-cyan-100">
            Optional details
            <textarea
              className="h-20 rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]"
              maxLength={4000}
              onChange={(event) => setDetails(event.target.value)}
              value={details}
            />
          </label>

          <label className="grid gap-1 font-semibold text-cyan-100">
            Optional email
            <input
              className="rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              type="text"
              value={email}
            />
            <span className="text-xs font-normal text-slate-400">Embedded into the issue body only; never stored.</span>
          </label>

          {showError && !isValid ? (
            <p className="text-sm text-rose-300" role="alert">A description is required before submitting.</p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="primary">Open pre-filled GitHub issue</Button>
            <span className="text-xs text-slate-400">Opens in a new tab.</span>
          </div>
        </Panel>
      </form>
    </section>
  )
}
