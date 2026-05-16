'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function InsightsReportView({
  type,
  onMentionStudent,
}: {
  type: 'poll' | 'question'
  onMentionStudent: (studentName: string) => void
}) {
  const [reportType, setReportType] = useState<'simple' | 'detailed'>('simple')
  const [selectedGroup, setSelectedGroup] = useState<{ label: string; students: string[] } | null>(
    null
  )

  const simpleData = [
    {
      label: 'Option A',
      count: 12,
      percent: 40,
      students: ['Alice', 'Bob', 'Charlie', 'Dave', 'Eve'],
    },
    { label: 'Option B', count: 9, percent: 30, students: ['Frank', 'Grace', 'Heidi'] },
    { label: 'Option C', count: 6, percent: 20, students: ['Ivan', 'Judy'] },
    { label: 'Option D', count: 3, percent: 10, students: ['Mallory'] },
  ]

  const detailedData = [
    {
      group: 'Male',
      data: [
        { label: 'Option A', count: 5, students: ['Alice', 'Bob'] },
        { label: 'Option B', count: 4, students: ['Charlie'] },
      ],
    },
    {
      group: 'Female',
      data: [
        { label: 'Option A', count: 7, students: ['Dave', 'Eve'] },
        { label: 'Option B', count: 5, students: ['Frank'] },
      ],
    },
    {
      group: 'US',
      data: [
        { label: 'Option A', count: 8, students: ['Grace', 'Heidi'] },
        { label: 'Option B', count: 3, students: ['Ivan'] },
      ],
    },
    {
      group: 'UK',
      data: [
        { label: 'Option A', count: 4, students: ['Judy'] },
        { label: 'Option B', count: 6, students: ['Mallory'] },
      ],
    },
  ]

  return (
    <div className="mb-2 flex flex-1 flex-col overflow-hidden rounded-2xl border border-blue-100 bg-white/60 p-3 shadow-sm backdrop-blur-md">
      <div className="mb-3 flex items-center justify-between border-b border-blue-100 pb-2">
        <span className="text-sm font-semibold uppercase tracking-wider text-blue-800">
          {type === 'poll' ? 'Poll Results' : 'Question Results'}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 bg-white text-xs text-blue-700 hover:bg-blue-50"
          onClick={() => setReportType(r => (r === 'simple' ? 'detailed' : 'simple'))}
        >
          {reportType === 'simple' ? 'Detailed Report' : 'Simple Report'}
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto pr-2">
        {reportType === 'simple' ? (
          <div className="space-y-4">
            {simpleData.map(item => (
              <div
                key={item.label}
                className="cursor-pointer rounded-xl border border-transparent p-2 shadow-sm transition-colors hover:border-blue-100 hover:bg-white"
                onClick={() => setSelectedGroup({ label: item.label, students: item.students })}
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
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            {detailedData.map(group => (
              <div key={group.group} className="rounded-xl border border-slate-100 bg-white/50 p-2">
                <h4 className="mb-2 text-xs font-semibold text-slate-700">{group.group}</h4>
                <div className="space-y-2">
                  {group.data.map(item => (
                    <div
                      key={item.label}
                      className="group/item flex cursor-pointer items-center justify-between rounded-lg p-1.5 transition-colors hover:bg-white"
                      onClick={() =>
                        setSelectedGroup({
                          label: `${group.group} - ${item.label}`,
                          students: item.students,
                        })
                      }
                    >
                      <span className="text-xs text-slate-600 group-hover/item:text-blue-700">
                        {item.label}
                      </span>
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                        {item.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!selectedGroup} onOpenChange={o => !o && setSelectedGroup(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-lg">Students in {selectedGroup?.label}</DialogTitle>
          </DialogHeader>
          <div className="mt-2 max-h-[300px] overflow-y-auto">
            <div className="space-y-2 pr-4">
              {selectedGroup?.students.map(s => (
                <div
                  key={s}
                  className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-100 p-3 transition-colors hover:bg-slate-50"
                  onClick={() => {
                    onMentionStudent(s)
                    setSelectedGroup(null)
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-700">
                      {s.charAt(0)}
                    </div>
                    <span className="text-sm font-medium text-slate-700">{s}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                  >
                    @ Mention
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
