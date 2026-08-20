'use client'

import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export interface StudentNeedingAttention {
  id: string
  name: string
  initial: string
  color: string
  issue: string
}

interface Props {
  students: StudentNeedingAttention[]
  loading?: boolean
}

export function StudentsNeedingAttentionCard({ students, loading }: Props) {
  const router = useRouter()
  return (
    <Card className="border border-slate-200 bg-white/95 shadow-xl backdrop-blur-md">
      <CardHeader>
        <CardTitle>Students Needing Attention</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3" aria-busy="true">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 animate-pulse rounded-full bg-gray-200" />
                  <div className="space-y-2">
                    <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
                    <div className="h-3 w-40 animate-pulse rounded bg-gray-200" />
                  </div>
                </div>
                <div className="h-8 w-20 animate-pulse rounded bg-gray-200" />
              </div>
            ))}
          </div>
        ) : students.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-500">
            No students need attention right now.
          </p>
        ) : (
          <div className="space-y-3">
            {students.map(s => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white/50 p-3 shadow-sm transition-all hover:shadow-md"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 font-semibold text-blue-600">
                    {s.initial}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{s.name}</p>
                    <p className="text-sm text-gray-500">{s.issue}</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-blue-200 text-blue-600 hover:bg-blue-50"
                  onClick={() => router.push(`/tutor/reports/${s.id}`)}
                >
                  View Details
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
