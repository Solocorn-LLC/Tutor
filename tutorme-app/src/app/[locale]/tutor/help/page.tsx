'use client'

import { HelpCircle, Rocket, ShieldCheck, PlayCircle } from 'lucide-react'
import { SupportPage, type Topic } from '@/components/support/support-page'

interface FaqItem {
  question: string
  answer: string
}

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
      {
        title: 'Setting up your profile',
        description: 'How to complete your tutor profile and add a photo.',
      },
      {
        title: 'Creating your first course',
        description: 'Build a course using the Course Builder.',
      },
      {
        title: 'Understanding the dashboard',
        description: 'Navigate your schedule, sessions, and students.',
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
      {
        title: 'Content guidelines',
        description: 'Standards for courses, materials, and communication.',
      },
      {
        title: 'Refund and cancellation',
        description: 'Policies for refunds, cancellations, and disputes.',
      },
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
      {
        title: 'Billing and payouts',
        description: 'Set up payment methods and withdraw earnings.',
      },
    ],
  },
]

export default function TutorHelpPage() {
  return (
    <SupportPage
      subtitle="Find answers, tutorials, and get support"
      heroGradient="bg-gradient-to-br from-[#2563EB] to-[#1D4ED8]"
      topics={topics}
    />
  )
}
