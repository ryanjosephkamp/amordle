'use client';

import { useMemo, useState } from 'react';
import { WorkbenchRegion } from '@/components/workbench';

function sanitize(value: string): string {
  return value
    .replaceAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[email removed]')
    .replaceAll(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
      '[identifier removed]',
    )
    .replaceAll(/\b(?:token|secret|password|answer)\s*[:=]\s*\S+/gi, '[private value removed]')
    .replaceAll(/\b[A-Za-z0-9_-]{48,}\b/g, '[long value removed]')
    .slice(0, 4_000);
}

export function FeedbackBuilder() {
  const [category, setCategory] = useState('Bug');
  const [summary, setSummary] = useState('');
  const [details, setDetails] = useState('');
  const template = useMemo(
    () =>
      [
        `## ${sanitize(category)}`,
        '',
        `**Summary:** ${sanitize(summary) || '[add a short summary]'}`,
        '',
        '### What happened',
        sanitize(details) || '[describe what you saw and what you expected]',
        '',
        '### Safe context',
        '- Route: /feedback',
        '- Device/browser: [optional]',
        '',
        '> Do not include email, account IDs, match IDs, answers, passwords, tokens, or private game data.',
      ].join('\n'),
    [category, details, summary],
  );
  const issueUrl = `https://github.com/ryanjosephkamp/amordle/issues/new?${new URLSearchParams({
    title: `[${category}] ${sanitize(summary).slice(0, 100)}`,
    body: template,
  }).toString()}`;
  return (
    <div className="split-layout">
      <form className="form-panel field-stack" onSubmit={(event) => event.preventDefault()}>
        <h2>FEEDBACK DETAILS</h2>
        <label>
          Category
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option>Bug</option>
            <option>Accessibility</option>
            <option>Game rules</option>
            <option>Suggestion</option>
          </select>
        </label>
        <label>
          Short summary
          <input
            maxLength={140}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
          />
        </label>
        <label>
          What happened?
          <textarea
            rows={8}
            maxLength={4_000}
            value={details}
            onChange={(event) => setDetails(event.target.value)}
          />
        </label>
      </form>
      <WorkbenchRegion title="ISSUE PREVIEW" status="NOT SUBMITTED">
        <pre className="feedback-preview">{template}</pre>
        <div className="action-row">
          <button onClick={() => void navigator.clipboard.writeText(template)}>COPY PREVIEW</button>
          <a className="button primary" href={issueUrl} target="_blank" rel="noreferrer">
            OPEN GITHUB ISSUE
          </a>
        </div>
        <p className="prose">Nothing is submitted automatically.</p>
      </WorkbenchRegion>
    </div>
  );
}
