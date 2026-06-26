'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'

interface PanelErrorBoundaryProps {
  children: ReactNode
  /** When any value here changes, a caught error is cleared and children re-render. */
  resetKeys?: unknown[]
  /** Label shown in the fallback, e.g. "this view" (default) or "the Test panel". */
  label?: string
}

interface PanelErrorBoundaryState {
  error: Error | null
}

/**
 * Contains a render error within a single panel instead of letting it crash the
 * whole app into the blank "Application error" screen. Shows a compact, retryable
 * message and logs the error + component stack to the console for diagnosis.
 * Auto-clears when `resetKeys` change (e.g. switching tabs) so a transient error
 * doesn't get stuck.
 *
 * Dependency-free (React's built-in error boundary API) — `react-error-boundary`
 * is not installed in this project.
 */
export class PanelErrorBoundary extends Component<
  PanelErrorBoundaryProps,
  PanelErrorBoundaryState
> {
  state: PanelErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): Partial<PanelErrorBoundaryState> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[PanelErrorBoundary] render error contained:', error, info.componentStack)
  }

  componentDidUpdate(prevProps: PanelErrorBoundaryProps) {
    if (!this.state.error) return
    const prev = prevProps.resetKeys ?? []
    const next = this.props.resetKeys ?? []
    if (prev.length !== next.length || prev.some((v, i) => !Object.is(v, next[i]))) {
      this.setState({ error: null })
    }
  }

  private reset = () => this.setState({ error: null })

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-md border bg-white p-6 text-center">
          <p className="text-sm font-medium text-slate-800">
            Couldn&rsquo;t display {this.props.label ?? 'this view'}.
          </p>
          <p className="max-w-md text-xs text-slate-500">
            {this.state.error.message || 'An unexpected error occurred while rendering.'}
          </p>
          <button
            onClick={this.reset}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
