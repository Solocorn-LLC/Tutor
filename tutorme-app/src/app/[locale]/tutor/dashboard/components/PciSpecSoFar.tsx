'use client'

/**
 * PciSpecSoFar — a compact, read-only "policy so far" panel for the PCI
 * assistant chat. As the tutor answers the assistant's probing questions, the
 * model reports what it has captured (a partial PciSpec) each turn; this shows
 * those fields filling in so the tutor can see the marking policy taking shape
 * and catch anything wrong early. It does NOT finalize anything — the saved PCI
 * is still only written when the tutor applies it.
 */

import { ListChecks } from 'lucide-react'
import { PCI_SPEC_FIELDS, type PciSpec } from '@/lib/assessment/pci-spec'

interface PciSpecSoFarProps {
  spec?: PciSpec
  board?: string
  subject?: string
}

export function PciSpecSoFar({ spec, board, subject }: PciSpecSoFarProps) {
  const filled = PCI_SPEC_FIELDS.filter(f => spec?.[f.key]?.trim())
  const hasContext = !!board?.trim() || !!subject?.trim()
  if (filled.length === 0 && !hasContext) return null

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 px-3 py-2">
      <p className="mb-1.5 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
        <ListChecks className="h-3.5 w-3.5" /> Your policy so far
      </p>
      <ul className="space-y-1.5">
        {hasContext && (
          <li className="text-xs">
            <span className="font-medium text-slate-600">Board / Subject:</span>{' '}
            <span className="text-slate-700">
              {[board?.trim(), subject?.trim()].filter(Boolean).join(' · ')}
            </span>
          </li>
        )}
        {filled.map(f => (
          <li key={f.key} className="text-xs">
            <span className="font-medium text-slate-600">{f.label}:</span>{' '}
            <span className="text-slate-700">{spec?.[f.key]}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
