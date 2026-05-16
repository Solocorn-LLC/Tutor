'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  HelpCircle,
  Search,
  BookOpen,
  MessageCircle,
  Video,
  Mail,
  ChevronRight,
} from 'lucide-react'

const faqs = [
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

const guides = [
  { title: 'Getting Started', icon: BookOpen, description: 'Learn how to use the platform' },
  { title: 'Video Tutorials', icon: Video, description: 'Watch helpful tutorial videos' },
  { title: 'Site Policies', icon: BookOpen, description: 'Platform terms and guidelines' },
]

export default function StudentHelpPage() {
  const sectionCardClass = 'border border-slate-200 bg-white shadow-[0_14px_45px_rgba(0,0,0,0.12)]'

  return (
    <div className="min-h-screen w-full bg-white px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 min-h-[52px] shrink-0">
        <div className="flex h-full w-full items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 px-4 shadow-[0_10px_30px_rgba(0,0,0,0.10)]">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-[#2563EB]" />
            <h1 className="text-sm font-semibold text-slate-900">Support</h1>
          </div>
          <p className="hidden text-xs text-slate-500 sm:block">Find answers and get support</p>
        </div>
      </div>

      {/* Search */}
      <Card className={`mb-8 ${sectionCardClass}`}>
        <CardContent className="pt-6">
          <div className="relative mx-auto max-w-2xl">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <Input placeholder="Search" className="py-6 pl-10 text-lg" />
          </div>
        </CardContent>
      </Card>

      {/* Guides */}
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        {guides.map(guide => {
          const Icon = guide.icon
          return (
            <Card key={guide.title} className={sectionCardClass}>
              <CardContent className="p-6">
                <Icon className="mb-4 h-10 w-10 text-blue-500" />
                <h3 className="font-semibold text-gray-900">{guide.title}</h3>
                <p className="mt-1 text-sm text-gray-500">{guide.description}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* FAQs */}
        <div className="lg:col-span-2">
          <Card className={sectionCardClass}>
            <CardHeader>
              <CardTitle>Frequently Asked Questions</CardTitle>
              <CardDescription>Quick answers to common questions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {faqs.map((faq, index) => (
                <div key={index} className="border-b pb-4 last:border-0 last:pb-0">
                  <h4 className="mb-2 font-medium text-gray-900">{faq.question}</h4>
                  <p className="text-sm text-gray-600">{faq.answer}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Contact Support */}
        <div>
          <Card className={sectionCardClass}>
            <CardHeader>
              <CardTitle>Need More Help?</CardTitle>
              <CardDescription>Contact our support team</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button variant="outline" className="w-full justify-start gap-3">
                <MessageCircle className="h-5 w-5" />
                Live Chat
              </Button>
              <Button variant="outline" className="w-full justify-start gap-3">
                <Mail className="h-5 w-5" />
                Email Support
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
