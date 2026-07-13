import { Button, Panel } from '../../ui'

export function WordListPreparationPanel({ error, onRetry }: { readonly error?: string; readonly onRetry: () => void }) {
  return (
    <section aria-busy={error ? undefined : true} aria-live="polite" className="space-y-4" data-testid="word-list-preparation">
      <Panel className="space-y-3" tone="muted">
        <h2 className="text-xl font-bold text-white">{error ? 'Word data unavailable' : 'Preparing word data'}</h2>
        <p className="text-sm leading-6 text-slate-300">
          {error ?? 'Loading the selected word length…'}
        </p>
        {error ? <Button onClick={onRetry} variant="primary">Retry</Button> : null}
      </Panel>
    </section>
  )
}
