/* eslint-disable react-refresh/only-export-components -- this module intentionally exports a lazy-route HOC factory */
import { Component, Suspense, lazy, type ComponentType, type ReactNode } from 'react'
import { Button, Panel } from '../ui'

function RouteLoadingPanel({ label }: { readonly label: string }) {
  return (
    <Panel aria-busy className="min-h-32 space-y-2" tone="muted">
      <p aria-live="polite" className="text-sm font-semibold text-cyan-100">Loading {label}…</p>
    </Panel>
  )
}

class RouteChunkErrorBoundary extends Component<{
  readonly children: ReactNode
  readonly label: string
  readonly onRetry: () => void
}, { readonly error?: Error }> {
  state: { readonly error?: Error } = {}

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(): void {
    // The user-facing state is intentionally answer-free and retryable.
  }

  render() {
    if (this.state.error) {
      return (
        <Panel className="min-h-32 space-y-3" tone="muted">
          <h2 className="text-lg font-bold text-white">{this.props.label} could not load</h2>
          <p className="text-sm text-slate-300">The interface chunk was unavailable. Retry reloads the app at Home while preserving saved game progress.</p>
          <Button onClick={this.props.onRetry} variant="primary">Retry</Button>
        </Panel>
      )
    }
    return this.props.children
  }
}

export function createRetryableLazyRoute<Props extends object>(
  importer: () => Promise<{ readonly default: ComponentType<Props> }>,
  label: string,
): ComponentType<Props> {
  const LazyComponent = lazy(importer)

  return function RetryableLazyRoute(props: Props) {
    const retry = () => window.location.reload()

    return (
      <RouteChunkErrorBoundary label={label} onRetry={retry}>
        <Suspense fallback={<RouteLoadingPanel label={label} />}>
          <LazyComponent {...props} />
        </Suspense>
      </RouteChunkErrorBoundary>
    )
  }
}
