'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { HelpCircle, Search, BookOpen, Video, ShieldCheck, LucideIcon } from 'lucide-react'

interface FaqItem {
  question: string
  answer: string
}

interface TopicItem {
  title: string
  description: string
}

interface Topic {
  value: string
  title: string
  description: string
  icon: LucideIcon
  items: TopicItem[]
}

const sectionCardClass = 'border border-slate-200 bg-white shadow-[0_14px_45px_rgba(0,0,0,0.12)]'

const faqs: FaqItem[] = [
  {
    question: 'How do I join a live session?',
    answer:
      'Go to My Sessions and click on the "Join" button for your scheduled session. You can also join from the Dashboard.',
  },
  {
    question: 'How do I access the AI Tutor?',
    answer:
      'Click on AI Tutor in the left navigation or use the Quick Actions menu. You can ask questions anytime!',
  },
  {
    question: 'Where can I find my assignments?',
    answer:
      "All your homework and assignments are in the Assignments section. You'll also see reminders on your Dashboard.",
  },
  {
    question: 'How do I track my progress?',
    answer:
      'Visit the Progress page to see detailed statistics about your learning journey and achievements.',
  },
]

const topics: Topic[] = [
  {
    value: 'faq',
    title: 'FAQ',
    description: 'Quick answers to common questions',
    icon: HelpCircle,
    items: faqs.map(f => ({ title: f.question, description: f.answer })),
  },
  {
    value: 'getting-started',
    title: 'Getting Started',
    description: 'Learn how to use the platform',
    icon: BookOpen,
    items: [
      {
        title: 'Welcome to Solocorn',
        description: 'An overview of the platform for new students.',
      },
      {
        title: 'Navigating your dashboard',
        description: 'Find your sessions, assignments, and progress at a glance.',
      },
      {
        title: 'Booking a tutor',
        description: 'Search for tutors and schedule your first session.',
      },
      {
        title: 'Joining your first live class',
        description: 'How to enter the classroom and use the tools.',
      },
    ],
  },
  {
    value: 'videos',
    title: 'Video Tutorials',
    description: 'Watch helpful tutorial videos',
    icon: Video,
    items: [
      { title: 'Dashboard walkthrough', description: 'A quick guide to your student dashboard.' },
      {
        title: 'Joining a live session',
        description: 'Step-by-step instructions for entering class.',
      },
      { title: 'Using the AI Tutor', description: 'Get help with homework and concepts anytime.' },
      { title: 'Tracking progress', description: 'Understand your stats and achievements.' },
    ],
  },
  {
    value: 'policies',
    title: 'Site Policies',
    description: 'Platform terms and guidelines',
    icon: ShieldCheck,
    items: [
      { title: 'Terms of Service', description: 'The rules and agreements for using Solocorn.' },
      { title: 'Privacy Policy', description: 'How we collect, use, and protect your data.' },
      { title: 'Code of Conduct', description: 'Behavior expectations for students and tutors.' },
      {
        title: 'Refund and cancellation',
        description: 'Policies for refunds, cancellations, and disputes.',
      },
    ],
  },
]

export default function StudentHelpPage() {
  const [activeTopic, setActiveTopic] = useState('faq')
  const [searchQuery, setSearchQuery] = useState('')

  const activeTopicData = useMemo(
    () => topics.find(t => t.value === activeTopic) || topics[topics.length - 1],
    [activeTopic]
  )

  const filteredResults = useMemo(() => {
    if (!searchQuery.trim()) return null
    const q = searchQuery.toLowerCase()
    return topics
      .map(topic => ({
        ...topic,
        items: topic.items.filter(
          item => item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q)
        ),
      }))
      .filter(topic => topic.items.length > 0)
  }, [searchQuery])

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      <div className="flex h-full w-full flex-col px-3 lg:px-4">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[18px] border border-white/10 bg-white shadow-[0_14px_45px_rgba(0,0,0,0.12)]">
          {/* Header */}
          <div className="relative overflow-hidden rounded-[18px] border border-white/10 bg-gradient-to-br from-[#F97316] to-[#EA580C] p-5 shadow-[0_24px_72px_rgba(0,0,0,0.20)] ring-1 ring-white/20">
            <div className="text-center">
              <h1 className="text-xl font-bold text-white">Support</h1>
              <p className="mt-1 text-sm text-white/70">Find answers and get support</p>
            </div>
          </div>

          {/* Content */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white p-4 sm:p-6">
            {/* Search */}
            <Card className={`mb-4 shrink-0 ${sectionCardClass}`}>
              <CardContent className="py-3">
                <div className="relative mx-auto max-w-2xl">
                  <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="Search"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="h-10 pl-10"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Topic cards */}
            <div className="mb-4 grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-4">
              {topics.map(topic => {
                const Icon = topic.icon
                const isActive = activeTopic === topic.value && !searchQuery.trim()
                return (
                  <Card
                    key={topic.value}
                    onClick={() => {
                      setActiveTopic(topic.value)
                      setSearchQuery('')
                    }}
                    className={`cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg ${sectionCardClass} ${
                      isActive ? 'ring-2 ring-[#2563EB]' : ''
                    }`}
                  >
                    <CardContent className="p-4">
                      <Icon className="mb-2 h-8 w-8 text-blue-500" />
                      <h3 className="text-sm font-semibold text-gray-900">{topic.title}</h3>
                      <p className="mt-0.5 text-xs text-gray-500">{topic.description}</p>
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            {/* Content panel */}
            <div className="min-h-0 flex-1 overflow-hidden">
              <Card className={`flex h-full flex-col ${sectionCardClass}`}>
                <CardHeader className="shrink-0">
                  <CardTitle>
                    {searchQuery.trim() ? 'Search Results' : activeTopicData.title}
                  </CardTitle>
                  <CardDescription>
                    {searchQuery.trim()
                      ? `Showing results for "${searchQuery}"`
                      : activeTopicData.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="min-h-0 flex-1 overflow-y-auto scrollbar-hide">
                  {searchQuery.trim() ? (
                    <div className="space-y-6">
                      {filteredResults?.length ? (
                        filteredResults.map(topic => (
                          <div key={topic.value}>
                            <h4 className="mb-2 text-sm font-semibold text-slate-700">
                              {topic.title}
                            </h4>
                            <div className="space-y-4">
                              {topic.items.map((item, idx) => (
                                <div
                                  key={idx}
                                  className="rounded-xl border border-slate-100 bg-slate-50/50 p-4"
                                >
                                  <h5 className="font-medium text-gray-900">{item.title}</h5>
                                  <p className="mt-1 text-sm text-gray-600">{item.description}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-gray-500">No results found.</p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {activeTopicData.items.map((item, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl border border-slate-100 bg-slate-50/50 p-4"
                        >
                          <h4 className="font-medium text-gray-900">{item.title}</h4>
                          <p className="mt-1 text-sm text-gray-600">{item.description}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
