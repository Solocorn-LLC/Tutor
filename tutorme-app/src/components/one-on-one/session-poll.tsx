'use client'

import { useState } from 'react'
import type { Socket } from 'socket.io-client'
import { X, Plus, BarChart3, Send, Trash2 } from 'lucide-react'
import type { SessionActivePoll } from './use-session-room-state'

/**
 * Live in-session poll — an ephemeral pulse-check. The tutor launches a question
 * with 2–8 options (`poll:launch`); students vote (`poll:vote`); everyone sees the
 * live tally; the tutor closes it (`poll:close`). State is owned by the classroom
 * (`useSessionRoomState.activePoll`, hydrated on join) and passed in.
 */

export function SessionPollPanel({
  sessionId,
  socket,
  activePoll,
  onClose,
}: {
  sessionId: string
  socket: Socket | null
  activePoll: SessionActivePoll | null
  onClose: () => void
}) {
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState<string[]>(['', ''])

  const setOption = (i: number, v: string) =>
    setOptions(prev => prev.map((o, idx) => (idx === i ? v : o)))
  const addOption = () => setOptions(prev => (prev.length >= 8 ? prev : [...prev, '']))
  const removeOption = (i: number) =>
    setOptions(prev => (prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== i)))

  const launch = () => {
    const q = question.trim()
    const opts = options.map(o => o.trim()).filter(Boolean)
    if (!q || opts.length < 2 || !socket) return
    socket.emit('poll:launch', { roomId: sessionId, question: q, options: opts })
    setQuestion('')
    setOptions(['', ''])
  }
  const close = () => {
    if (activePoll && socket)
      socket.emit('poll:close', { roomId: sessionId, pollId: activePoll.id })
  }

  return (
    <div className="pointer-events-auto flex h-full w-80 flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          <BarChart3 className="h-4 w-4 text-blue-600" />
          Poll
        </h3>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {activePoll ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-semibold text-slate-900">{activePoll.question}</p>
            <PollResults poll={activePoll} />
            <button
              onClick={close}
              className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-500"
            >
              End poll
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Question
            </label>
            <input
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="Ask the room a question…"
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
            />
            <label className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Options
            </label>
            {options.map((o, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input
                  value={o}
                  onChange={e => setOption(i, e.target.value)}
                  placeholder={`Option ${i + 1}`}
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
                />
                {options.length > 2 ? (
                  <button
                    onClick={() => removeOption(i)}
                    aria-label="Remove option"
                    className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            ))}
            {options.length < 8 ? (
              <button
                onClick={addOption}
                className="inline-flex w-fit items-center gap-1 rounded-lg px-1 py-0.5 text-xs font-medium text-blue-600 hover:bg-blue-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Add option
              </button>
            ) : null}
            <button
              onClick={launch}
              disabled={!socket || !question.trim() || options.filter(o => o.trim()).length < 2}
              className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              Launch poll
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Auto-shown to students while a poll is active: tap an option to vote, then see the
 * live results. Uses the hydrated `myOptionIndex` so a reconnect resumes the vote.
 */
export function SessionPollCard({
  sessionId,
  socket,
  poll,
}: {
  sessionId: string
  socket: Socket | null
  poll: SessionActivePoll
}) {
  const [voted, setVoted] = useState<number | null>(poll.myOptionIndex ?? null)

  const vote = (i: number) => {
    if (voted != null || !socket) return
    socket.emit('poll:vote', { roomId: sessionId, pollId: poll.id, optionIndex: i })
    setVoted(i)
  }

  return (
    <div className="pointer-events-auto w-[22rem] max-w-[92vw] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
      <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-blue-500">
        <BarChart3 className="h-3 w-3" /> Live poll
      </p>
      <p className="mb-3 text-sm font-semibold text-slate-900">{poll.question}</p>
      {voted == null ? (
        <ul className="flex flex-col gap-1.5">
          {poll.options.map((o, i) => (
            <li key={i}>
              <button
                onClick={() => vote(i)}
                disabled={!socket}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm text-slate-800 hover:border-blue-500 hover:bg-blue-50 disabled:opacity-60"
              >
                {o}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <PollResults poll={poll} highlight={voted} />
          <p className="mt-2 text-center text-[11px] text-slate-400">Your answer is in.</p>
        </>
      )}
    </div>
  )
}

/** Horizontal tally bars with per-option count + percentage. */
function PollResults({ poll, highlight }: { poll: SessionActivePoll; highlight?: number }) {
  const counts = poll.tally?.counts ?? poll.options.map(() => 0)
  const total = poll.tally?.total ?? 0
  return (
    <div className="flex flex-col gap-1.5">
      {poll.options.map((o, i) => {
        const count = counts[i] ?? 0
        const pct = total > 0 ? Math.round((count / total) * 100) : 0
        return (
          <div key={i}>
            <div className="mb-0.5 flex items-center justify-between text-xs">
              <span className={highlight === i ? 'font-semibold text-blue-700' : 'text-slate-700'}>
                {o}
              </span>
              <span className="shrink-0 text-slate-400">
                {count} · {pct}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={highlight === i ? 'h-full bg-blue-600' : 'h-full bg-blue-400'}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })}
      <p className="mt-0.5 text-[11px] text-slate-400">
        {total} vote{total === 1 ? '' : 's'}
      </p>
    </div>
  )
}
