'use client'

import { HelpCircle, BookOpen, Video, ShieldCheck } from 'lucide-react'
import { SupportPage, type Topic } from '@/components/support/support-page'

interface FaqItem {
  question: string
  answer: string
}

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
]

export default function StudentHelpPage() {
  return (
    <SupportPage
      subtitle="Find answers and get support"
      heroGradient="bg-gradient-to-br from-[#F97316] to-[#EA580C]"
      topics={topics}
    />
  )
}
