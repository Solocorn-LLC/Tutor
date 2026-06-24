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

/**
 * Live poll / free-response results for the active task. All data is real,
 * derived from the deployed task's socket responses (see CourseBuilder) — there
 * is no placeholder/mock data here. Clicking a student name @-mentions them.
 */
export function InsightsReportView({
  type,
  pollResults = [],
  questionAnswers = [],
  onMentionStudent,
}: {
  type: 'poll' | 'question'
  pollResults?: PollResultOption[]
  questionAnswers?: QuestionAnswerEntry[]
  onMentionStudent: (studentName: string) => void
}) {
  const isPoll = type === 'poll'
  const hasData = isPoll ? pollResults.length > 0 : questionAnswers.length > 0

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-blue-100 bg-white/60 p-3 shadow-sm backdrop-blur-md">
      <div className="mb-3 flex items-center justify-between border-b border-blue-100 pb-2">
        <span className="text-sm font-semibold uppercase tracking-wider text-blue-800">
          {isPoll ? 'Poll Results' : 'Question Results'}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto pr-2">
        {!hasData ? (
          <p className="py-8 text-center text-xs text-slate-400">
            {isPoll
              ? 'No poll responses yet. Send a poll to the class to see results here.'
              : 'No responses yet. Ask the class a question to see answers here.'}
          </p>
        ) : isPoll ? (
          <div className="space-y-4">
            {pollResults.map(item => (
              <div
                key={item.label}
                className="rounded-xl border border-transparent p-2 shadow-sm transition-colors hover:border-blue-100 hover:bg-white"
              >
                <div className="mb-1.5 flex justify-between text-xs font-medium text-slate-700">
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
                    {item.students.map(s => (
                      <button
                        key={s}
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
        ) : (
          <div className="space-y-2">
            {questionAnswers.map((a, i) => (
              <div
                key={`${a.studentName}-${i}`}
                className="rounded-xl border border-slate-100 bg-white/50 p-2"
              >
                <button
                  type="button"
                  onClick={() => onMentionStudent(a.studentName)}
                  className="text-xs font-semibold text-blue-700 hover:underline"
                >
                  {a.studentName}
                </button>
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">{a.answer}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
