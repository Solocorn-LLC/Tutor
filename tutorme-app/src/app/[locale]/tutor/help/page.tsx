'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  HelpCircle,
  Search,
  Rocket,
  PlayCircle,
  FileText,
  ShieldCheck,
  LucideIcon,
} from 'lucide-react'

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
    question: 'How do I create a new session?',
    answer:
      'Go to your Dashboard and click "Create New Session" or use the Quick Actions menu. Fill in the session details and schedule.',
  },
  {
    question: 'How do I use the Course Builder?',
    answer:
      'Navigate to Courses > Course Builder. Select a course to edit, then use the drag-and-drop interface to organize modules and lessons.',
  },
  {
    question: 'How do students join my sessions?',
    answer:
      'Share the session join link with your students. You can find the link in the My Sessions section or copy it directly from the session card.',
  },
  {
    question: 'Can I schedule recurring sessions?',
    answer:
      'Yes! When creating a session, you can set it to repeat weekly or monthly. Manage all schedules from the Calendar page.',
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
    title: 'Getting Started Guide',
    description: 'Learn the basics of Solocorn',
    icon: Rocket,
    items: [
      { title: 'Welcome to Solocorn', description: 'An overview of the platform for new tutors.' },
      { title: 'Setting up your profile', description: 'How to complete your tutor profile and add a photo.' },
      { title: 'Creating your first course', description: 'Build a course using the Course Builder.' },
      { title: 'Understanding the dashboard', description: 'Navigate your schedule, sessions, and students.' },
    ],
  },
  {
    value: 'videos',
    title: 'Video Tutorials',
    description: 'Watch step-by-step tutorials',
    icon: PlayCircle,
    items: [
      { title: 'Course Builder walkthrough', description: 'A video guide to building courses.' },
      { title: 'Scheduling live sessions', description: 'How to set up and manage live classes.' },
      { title: 'Managing students', description: 'Track progress, attendance, and feedback.' },
      { title: 'Billing and payouts', description: 'Set up payment methods and withdraw earnings.' },
    ],
  },
  {
    value: 'best-practices',
    title: 'Teaching Best Practices',
    description: 'Tips for effective online teaching',
    icon: FileText,
    items: [
      { title: 'Engaging students online', description: 'Techniques to keep students active and motivated.' },
      { title: 'Structuring a lesson', description: 'A framework for clear and effective lessons.' },
      { title: 'Using the whiteboard', description: 'Make the most of the live whiteboard tools.' },
      { title: 'Providing feedback', description: 'How to give constructive feedback after sessions.' },
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
      { title: 'Content guidelines', description: 'Standards for courses, materials, and communication.' },
      { title: 'Refund and cancellation', description: 'Policies for refunds, cancellations, and disputes.' },
    ],
  },
]

export default function TutorHelpPage() {
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
          item =>
            item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q)
        ),
      }))
      .filter(topic => topic.items.length > 0)
  }, [searchQuery])

  return (
    <div className="flex min-h-full flex-col bg-white px-6 pb-6 pt-2">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-[20px] border border-white/10 bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] p-5 shadow-[0_24px_72px_rgba(0,0,0,0.20)] ring-1 ring-white/20">
        <div className="text-center">
          <h1 className="text-xl font-bold text-white">Support</h1>
          <p className="mt-1 text-sm text-white/60">Find answers, tutorials, and get support</p>
        </div>
      </section>

      {/* Content */}
      <div className="space-y-4 py-4 sm:py-6">
            {/* Search */}
            <Card className={sectionCardClass}>
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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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
            <Card className={sectionCardClass}>
              <CardHeader>
                <CardTitle>
                  {searchQuery.trim() ? 'Search Results' : activeTopicData.title}
                </CardTitle>
                <CardDescription>
                  {searchQuery.trim()
                    ? `Showing results for "${searchQuery}"`
                    : activeTopicData.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
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
  )
}
