'use client'

import { useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Minimal "Ask the AI tutor about this task" helper shown under a deployed
 * task's questions. Passes the task id to `/api/ai/tutor` so the tutor applies
 * that task's PCI (TASK-6). Academic integrity is enforced server-side: while an
 * assessment is in progress the tutor gives procedural-only help (ASMT-15).
 */
export function TaskAiHelper({ taskId, subject }: { taskId: string | null; subject: string }) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (!taskId) return null

  const ask = async () => {
    const message = question.trim()
    if (!message || loading) return
    setLoading(true)
    setError('')
    setAnswer('')
    try {
      const res = await fetch('/api/ai/tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          message,
          subject: subject || 'General',
          mode: 'socratic',
          taskId,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        response?: string
        error?: string
      }
      if (!res.ok || !data.response) {
        setError(data.error || 'The AI tutor is unavailable right now.')
        return
      }
      setAnswer(data.response)
    } catch {
      setError('Could not reach the AI tutor. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-indigo-700">
        <Sparkles className="h-3.5 w-3.5" />
        Ask the AI tutor about this task
      </div>
      <textarea
        value={question}
        onChange={e => setQuestion(e.target.value)}
        onKeyDown={e => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') ask()
        }}
        rows={2}
        placeholder="Stuck? Ask for a hint on how to approach this…"
        className="w-full resize-none rounded-md border border-gray-200 bg-white p-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none"
        disabled={loading}
      />
      <div className="mt-2 flex justify-end">
        <Button size="sm" onClick={ask} disabled={loading || !question.trim()}>
          {loading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
          {loading ? 'Thinking…' : 'Ask'}
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {answer && (
        <div className="mt-2 whitespace-pre-wrap rounded-md border border-indigo-100 bg-white p-2 text-sm text-gray-800">
          {answer}
        </div>
      )}
    </div>
  )
}
