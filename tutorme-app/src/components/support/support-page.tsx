'use client'

import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

export interface TopicItem {
  title: string
  description: string
}

export interface Topic {
  value: string
  title: string
  description: string
  icon: LucideIcon
  items: TopicItem[]
}

interface SupportPageProps {
  subtitle: string
  heroGradient: string
  topics: Topic[]
}

export function SupportPage({ subtitle, heroGradient, topics }: SupportPageProps) {
  const [activeTopic, setActiveTopic] = useState(topics[0]?.value ?? '')
  const activeTopicData = useMemo(
    () => topics.find(t => t.value === activeTopic) || topics[0],
    [activeTopic, topics]
  )

  return (
    <div className="flex h-full min-h-full flex-col bg-white px-6 pb-0 pt-2 lg:pt-0">
      {/* Hero */}
      <section
        className={cn(
          'relative mb-4 flex-shrink-0 overflow-hidden rounded-[20px] border border-white/10 p-5 shadow-elevation-3 ring-1 ring-white/20',
          heroGradient
        )}
      >
        <div className="text-center">
          <h1 className="text-xl font-bold text-white">Support</h1>
          <p className="mt-1 text-sm text-white/70">{subtitle}</p>
        </div>
      </section>

      {/* Lower panel */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden pb-0.5">
        <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_8px_20px_rgba(0,0,0,0.08)]">
          {/* Mode selector cards */}
          <div className="grid flex-shrink-0 grid-cols-2 gap-3 p-5 pb-3 sm:grid-cols-4">
            {topics.map(topic => {
              const Icon = topic.icon
              const isActive = activeTopic === topic.value
              return (
                <Card
                  key={topic.value}
                  onClick={() => setActiveTopic(topic.value)}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-xl border border-[#E5E7EB] bg-white p-3 shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-all hover:-translate-y-0.5 hover:shadow-lg',
                    isActive && 'ring-2 ring-[#2563EB]'
                  )}
                >
                  <Icon className="h-8 w-8 shrink-0 text-blue-500" />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-gray-900">{topic.title}</h3>
                    <p className="truncate text-xs text-gray-500">{topic.description}</p>
                  </div>
                </Card>
              )
            })}
          </div>

          {/* Content panel */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 pb-5">
            <div className="flex-shrink-0 pb-2">
              <h2 className="text-lg font-semibold text-slate-900">{activeTopicData.title}</h2>
              <p className="text-sm text-slate-500">{activeTopicData.description}</p>
            </div>
            <div className="scrollbar-hide flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
              {activeTopicData.items.map((item, idx) => (
                <div key={idx} className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                  <h4 className="font-medium text-gray-900">{item.title}</h4>
                  <p className="mt-1 text-sm text-gray-600">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
