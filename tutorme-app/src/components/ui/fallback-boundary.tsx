'use client'

import { Component, type ReactNode } from 'react'

interface FallbackBoundaryProps {
  children: ReactNode
  /** Rendered instead of children if they throw during render. */
  fallback: ReactNode
  /** For logs, e.g. "session classroom". */
  label?: string
}

interface FallbackBoundaryState {
  hasError: boolean
}

/**
 * Minimal error boundary that swaps in a caller-provided `fallback` node when its
 * subtree throws — so a crash in one region degrades gracefully instead of taking
 * down the whole page. (PanelErrorBoundary renders its own generic message; this
 * one lets the caller decide the fallback, e.g. a plain video call.)
 */
export class FallbackBoundary extends Component<FallbackBoundaryProps, FallbackBoundaryState> {
  state: FallbackBoundaryState = { hasError: false }

  static getDerivedStateFromError(): FallbackBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.error(`[${this.props.label ?? 'FallbackBoundary'}] render error:`, error)
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children
  }
}
