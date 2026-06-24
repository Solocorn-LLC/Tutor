'use client'

import { useEffect } from 'react'

/**
 * Segment-level error boundary for /tutor/insights.
 *
 * Catches any client render error in this route (including ones thrown above the
 * in-tree PanelErrorBoundary, e.g. in the page component itself) so a crash
 * degrades to a recoverable message instead of the blank global "Application
 * error" screen. Logs the error (message + digest) for diagnosis.
 */
export default function InsightsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[insights/error] route error:', error, 'digest:', error?.digest)
  }, [error])

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-gray-50 p-6 text-center">
      <p className="text-base font-semibold text-slate-800">
        Something went wrong loading the insights builder.
      </p>
      <p className="max-w-md text-sm text-slate-500">
        {error?.message || 'An unexpected error occurred.'}
      </p>
      <div className="flex gap-2">
        <button
          onClick={reset}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Try again
        </button>
        <button
          onClick={() => {
            window.location.href = '/tutor/dashboard'
          }}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Back to dashboard
        </button>
      </div>
    </div>
  )
}
