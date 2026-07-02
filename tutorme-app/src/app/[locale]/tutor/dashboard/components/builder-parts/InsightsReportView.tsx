'use client'

export interface PollResultOption {
  label: string
  count: number
  percent: number
  students: string[]
}

export interface QuestionAnswerEntry {
  studentName: string
  answer: string
}

/** One sent poll + its tallied options. */
export interface PollResultBlock {
  id: string
  question: string
  totalResponses: number
  options: PollResultOption[]
}

/** One sent question + its answers. */
export interface QuestionResultBlock {
  id: string
  prompt: string
  answers: QuestionAnswerEntry[]
}

/**
 * Live poll / free-response results for the active task. Shows the FULL history
 * of polls/questions sent for this task (newest first) — sending a new one no
 * longer hides the previous. All data is real, derived from the deployed task's
 * socket responses (see CourseBuilder). Clicking a student name @-mentions them.
 */
export function InsightsReportView({
  type,
  pollResults = [],
  questionResults = [],
  onMentionStudent,
}: {
  type: 'poll' | 'question'
  pollResults?: PollResultBlock[]
  questionResults?: QuestionResultBlock[]
  onMentionStudent: (studentName: string) => void
}) {
  const isPoll = type === 'poll'
  const hasData = isPoll ? pollResults.length > 0 : questionResults.length > 0
  const count = isPoll ? pollResults.length : questionResults.length

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-blue-100 bg-white/60 p-3 shadow-sm backdrop-blur-md">
      <div className="mb-3 flex items-center justify-between border-b border-blue-100 pb-2">
        <span className="text-sm font-semibold uppercase tracking-wider text-blue-800">
          {isPoll ? 'Poll Results' : 'Question Results'}
        </span>
        {count > 0 && (
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600">
            {count} sent
          </span>
        )}
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto pr-2">
        {!hasData ? (
          <p className="py-8 text-center text-xs text-slate-400">
            {isPoll
              ? 'No polls sent yet. Send a poll to the class to see results here.'
              : 'No questions sent yet. Ask the class a question to see answers here.'}
          </p>
        ) : isPoll ? (
          pollResults.map(poll => (
            <div
              key={poll.id}
              className="rounded-2xl border border-blue-100 bg-white/70 p-2.5 shadow-sm"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <p className="text-xs font-semibold text-slate-800">{poll.question}</p>
                <span className="shrink-0 text-[11px] text-slate-400">
                  {poll.totalResponses} {poll.totalResponses === 1 ? 'vote' : 'votes'}
                </span>
              </div>
              <div className="space-y-2.5">
                {poll.options.map((item, i) => (
                  <div
                    key={`${poll.id}-${i}`}
                    className="rounded-lg p-1.5 transition-colors hover:bg-blue-50/50"
                  >
                    <div className="mb-1 flex justify-between text-xs font-medium text-slate-700">
                      <span>{item.label}</span>
                      <span className="text-blue-600">
                        {item.count} ({item.percent}%)
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{ width: `${item.percent}%` }}
                      />
                    </div>
                    {item.students.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {item.students.map((s, si) => (
                          <button
                            key={`${poll.id}-${i}-${si}`}
                            type="button"
                            onClick={() => onMentionStudent(s)}
                            className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700 hover:bg-blue-100"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          questionResults.map(q => (
            <div
              key={q.id}
              className="rounded-2xl border border-blue-100 bg-white/70 p-2.5 shadow-sm"
            >
              <p className="mb-2 text-xs font-semibold text-slate-800">{q.prompt}</p>
              {q.answers.length === 0 ? (
                <p className="text-[11px] text-slate-400">No answers yet.</p>
              ) : (
                <div className="space-y-2">
                  {q.answers.map((a, i) => (
                    <div
                      key={`${q.id}-${a.studentName}-${i}`}
                      className="rounded-xl border border-slate-100 bg-white/50 p-2"
                    >
                      <button
                        type="button"
                        onClick={() => onMentionStudent(a.studentName)}
                        className="text-xs font-semibold text-blue-700 hover:underline"
                      >
                        {a.studentName}
                      </button>
                      <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">
                        {a.answer}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
