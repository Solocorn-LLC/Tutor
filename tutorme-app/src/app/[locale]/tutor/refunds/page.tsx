'use client'

import { DollarSign } from 'lucide-react'
import { BackButton } from '@/components/navigation'
import { PendingRefundsPanel } from '@/components/tutor/pending-refunds-panel'

export default function TutorRefundsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <DollarSign className="h-5 w-5" />
            Refunds
          </h1>
          <p className="text-muted-foreground text-sm">
            Pending refund requests across all your courses — approve to process via the payment
            gateway, or decline.
          </p>
        </div>
        <BackButton href="/tutor/dashboard" iconDirection="right" />
      </div>

      <PendingRefundsPanel showCourse hideWhenEmpty={false} />
    </div>
  )
}
