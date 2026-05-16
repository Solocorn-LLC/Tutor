'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import {
  Send,
  ArrowLeft,
  BookOpen,
  MessageCircle,
  Calculator,
  Atom,
  Microscope,
  Languages,
  Monitor,
  GraduationCap,
  Sparkles,
  Lightbulb,
  Settings,
  Menu,
  Mic,
  MicOff,
  PanelRight,
  PanelRightClose,
  ChevronRight,
  Target,
  Gamepad2,
  Clock,
  CheckCircle,
  Bookmark,
  HelpCircle,
  FileText,
  Play,
  Award,
  GraduationCap as LessonIcon,
  Brain,
  Dumbbell,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { BackButton } from '@/components/navigation'
import { AIWhiteboard, extractWhiteboardItems } from '@/components/ai-tutor/ai-whiteboard'
import { TopicSidebar } from '@/components/ai-tutor/topic-sidebar'
import { TutorPreferences } from '@/components/ai-tutor/tutor-preferences'
import dynamic from 'next/dynamic'
import { AIAvatarPlaceholder } from '@/components/ai-tutor/ai-avatar'
const AIAvatar = dynamic(() => import('@/components/ai-tutor/ai-avatar').then(m => m.AIAvatar), {
  ssr: false,
})
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  hintType?: 'socratic' | 'direct' | 'encouragement' | 'clarification'
  relevantConcepts?: string[]
}

interface WhiteboardItem {
  id: string
  type: 'text' | 'quote' | 'example' | 'tip'
  content: string
  timestamp: string
}

type TeachingMode = 'socratic' | 'direct' | 'lesson' | 'practice'

interface TeachingModeConfig {
  key: TeachingMode
  name: string
  description: string
  icon: React.ReactNode
}

const teachingModes: TeachingModeConfig[] = [
  {
    key: 'socratic',
    name: 'Socratic',
    description: 'Learn by answering questions',
    icon: <HelpCircle className="h-4 w-4" />,
  },
  {
    key: 'direct',
    name: 'Explain',
    description: 'Clear explanations',
    icon: <BookOpen className="h-4 w-4" />,
  },
  {
    key: 'lesson',
    name: 'Full Lesson',
    description: 'Structured learning',
    icon: <LessonIcon className="h-4 w-4" />,
  },
  {
    key: 'practice',
    name: 'Practice',
    description: 'Problem solving',
    icon: <Dumbbell className="h-4 w-4" />,
  },
]

// Subject configurations
const subjectConfig: Record<
  string,
  {
    name: string
    icon: React.ReactNode
    color: string
    bgColor: string
    borderColor: string
    greeting: string
    topics: any[]
    isLanguage: boolean
    preferences: {
      teachingAge: number
      voiceGender: 'male' | 'female'
      voiceAccent: string
    }
  }
> = {
  english: {
    name: 'English',
    icon: <Languages className="h-6 w-6" />,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    greeting:
      "Hello! I'm your English tutor. I can help with grammar, writing, literature analysis, and more. What would you like to work on today?",
    isLanguage: true,
    preferences: {
      teachingAge: 15,
      voiceGender: 'female',
      voiceAccent: 'US',
    },
    topics: [
      {
        id: 'essay_basics',
        name: 'Essay Basics',
        description: 'Introduction to essay structure',
        progress: 0,
        status: 'available',
        subtopics: ['Thesis Statements', 'Introductions', 'Conclusions'],
        icon: '📝',
      },
      {
        id: 'grammar_fundamentals',
        name: 'Grammar Fundamentals',
        description: 'Parts of speech and sentence structure',
        progress: 0,
        status: 'available',
        subtopics: ['Nouns & Verbs', 'Adjectives & Adverbs', 'Sentence Types'],
        icon: '✓',
      },
      {
        id: 'punctuation',
        name: 'Punctuation Mastery',
        description: 'Commas, periods, and more',
        progress: 0,
        status: 'available',
        subtopics: ['Commas', 'Semicolons', 'Apostrophes'],
        icon: '،',
      },
      {
        id: 'sentence_structure',
        name: 'Sentence Structure',
        description: 'Building strong sentences',
        progress: 0,
        status: 'available',
        subtopics: ['Simple Sentences', 'Compound Sentences', 'Complex Sentences'],
        icon: '🏗️',
      },
      {
        id: 'thesis_development',
        name: 'Thesis Development',
        description: 'Crafting arguable claims',
        progress: 0,
        status: 'available',
        subtopics: ['Arguable Claims', 'Specificity', 'Placement'],
        icon: '🎯',
      },
      {
        id: 'evidence_analysis',
        name: 'Evidence & Analysis',
        description: 'Supporting your arguments',
        progress: 0,
        status: 'available',
        subtopics: ['Quotations', 'Paraphrasing', 'Analysis Techniques'],
        icon: '💡',
      },
      {
        id: 'literary_analysis',
        name: 'Literary Analysis',
        description: 'Analyzing literature',
        progress: 0,
        status: 'available',
        subtopics: ['Themes', 'Symbols', 'Character Analysis'],
        icon: '📚',
      },
    ],
  },
  math: {
    name: 'Mathematics',
    icon: <Calculator className="h-6 w-6" />,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    greeting:
      "Hi! I'm your Math tutor. I can help with algebra, geometry, calculus, and problem solving. What math topic are you working on?",
    isLanguage: false,
    preferences: {
      teachingAge: 15,
      voiceGender: 'male',
      voiceAccent: 'US',
    },
    topics: [
      {
        id: 'algebra',
        name: 'Algebra',
        description: 'Equations and expressions',
        progress: 0,
        status: 'available',
        subtopics: ['Linear Equations', 'Quadratic Equations', 'Systems'],
        icon: '📐',
      },
      {
        id: 'geometry',
        name: 'Geometry',
        description: 'Shapes and proofs',
        progress: 0,
        status: 'available',
        subtopics: ['Triangles', 'Circles', 'Proofs'],
        icon: '📏',
      },
      {
        id: 'calculus',
        name: 'Calculus',
        description: 'Limits and derivatives',
        progress: 0,
        status: 'available',
        subtopics: ['Limits', 'Derivatives', 'Integrals'],
        icon: '📈',
      },
      {
        id: 'statistics',
        name: 'Statistics',
        description: 'Data analysis',
        progress: 0,
        status: 'available',
        subtopics: ['Probability', 'Distributions', 'Hypothesis Testing'],
        icon: '📊',
      },
      {
        id: 'trigonometry',
        name: 'Trigonometry',
        description: 'Sine, cosine, tangent',
        progress: 0,
        status: 'available',
        subtopics: ['Unit Circle', 'Trig Functions', 'Identities'],
        icon: '📐',
      },
    ],
  },
  precalculus: {
    name: 'Pre-calculus',
    icon: <Calculator className="h-6 w-6" />,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
    borderColor: 'border-indigo-200',
    greeting:
      "Hello! I'm your Pre-calculus tutor. Ready to master functions, trigonometry, and prepare for calculus?",
    isLanguage: false,
    preferences: {
      teachingAge: 16,
      voiceGender: 'male',
      voiceAccent: 'US',
    },
    topics: [
      {
        id: 'functions',
        name: 'Functions',
        description: 'Domain, range, transformations',
        progress: 0,
        status: 'available',
        subtopics: ['Domain & Range', 'Transformations', 'Composition'],
        icon: 'ƒ',
      },
      {
        id: 'trigonometry',
        name: 'Trigonometry',
        description: 'Trig functions and identities',
        progress: 0,
        status: 'available',
        subtopics: ['Unit Circle', 'Graphs', 'Identities'],
        icon: '📐',
      },
      {
        id: 'conics',
        name: 'Conic Sections',
        description: 'Parabolas, ellipses, hyperbolas',
        progress: 0,
        status: 'available',
        subtopics: ['Parabolas', 'Ellipses', 'Hyperbolas'],
        icon: '⭕',
      },
      {
        id: 'sequences',
        name: 'Sequences & Series',
        description: 'Arithmetic and geometric',
        progress: 0,
        status: 'available',
        subtopics: ['Arithmetic', 'Geometric', 'Summation'],
        icon: '∑',
      },
    ],
  },
  'ap-calculus-ab': {
    name: 'AP Calculus AB',
    icon: <Calculator className="h-6 w-6" />,
    color: 'text-violet-600',
    bgColor: 'bg-violet-50',
    borderColor: 'border-violet-200',
    greeting:
      'Welcome to AP Calculus AB! I can help you with limits, derivatives, integrals, and exam prep.',
    isLanguage: false,
    preferences: {
      teachingAge: 17,
      voiceGender: 'male',
      voiceAccent: 'US',
    },
    topics: [
      {
        id: 'limits',
        name: 'Limits',
        description: 'Understanding limits',
        progress: 0,
        status: 'available',
        subtopics: ['Definition', 'Properties', 'Infinity'],
        icon: 'lim',
      },
      {
        id: 'derivatives',
        name: 'Derivatives',
        description: 'Rates of change',
        progress: 0,
        status: 'available',
        subtopics: ['Definition', 'Rules', 'Applications'],
        icon: 'd/dx',
      },
      {
        id: 'integrals',
        name: 'Integrals',
        description: 'Accumulation',
        progress: 0,
        status: 'available',
        subtopics: ['Definite', 'Indefinite', 'FTC'],
        icon: '∫',
      },
      {
        id: 'exam_prep',
        name: 'Exam Prep',
        description: 'AP exam strategies',
        progress: 0,
        status: 'available',
        subtopics: ['MCQs', 'FRQs', 'Calculator'],
        icon: '📝',
      },
    ],
  },
  physics: {
    name: 'Physics',
    icon: <Atom className="h-6 w-6" />,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
    borderColor: 'border-indigo-200',
    greeting:
      "Hi! I'm your Physics tutor. I can help with mechanics, thermodynamics, electricity, and more.",
    isLanguage: false,
    preferences: {
      teachingAge: 16,
      voiceGender: 'male',
      voiceAccent: 'US',
    },
    topics: [
      {
        id: 'mechanics',
        name: 'Mechanics',
        description: 'Motion and forces',
        progress: 0,
        status: 'available',
        subtopics: ['Kinematics', 'Dynamics', 'Energy'],
        icon: '⚙️',
      },
      {
        id: 'thermodynamics',
        name: 'Thermodynamics',
        description: 'Heat and energy',
        progress: 0,
        status: 'available',
        subtopics: ['Laws', 'Heat Transfer', 'Engines'],
        icon: '🌡️',
      },
      {
        id: 'electricity',
        name: 'Electricity',
        description: 'Circuits and fields',
        progress: 0,
        status: 'available',
        subtopics: ['Circuits', 'Fields', 'Magnetism'],
        icon: '⚡',
      },
      {
        id: 'waves',
        name: 'Waves',
        description: 'Wave phenomena',
        progress: 0,
        status: 'available',
        subtopics: ['Properties', 'Sound', 'Light'],
        icon: '〰️',
      },
    ],
  },
  chemistry: {
    name: 'Chemistry',
    icon: <Microscope className="h-6 w-6" />,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    greeting:
      "Hello! I'm your Chemistry tutor. I can help with organic, inorganic, and physical chemistry.",
    isLanguage: false,
    preferences: {
      teachingAge: 16,
      voiceGender: 'female',
      voiceAccent: 'US',
    },
    topics: [
      {
        id: 'atomic_structure',
        name: 'Atomic Structure',
        description: 'Atoms and elements',
        progress: 0,
        status: 'available',
        subtopics: ['Models', 'Periodic Table', 'Bonding'],
        icon: '⚛️',
      },
      {
        id: 'stoichiometry',
        name: 'Stoichiometry',
        description: 'Calculations',
        progress: 0,
        status: 'available',
        subtopics: ['Moles', 'Equations', 'Yields'],
        icon: '⚖️',
      },
      {
        id: 'organic',
        name: 'Organic Chemistry',
        description: 'Carbon compounds',
        progress: 0,
        status: 'available',
        subtopics: ['Hydrocarbons', 'Functional Groups', 'Reactions'],
        icon: '🧪',
      },
      {
        id: 'equilibrium',
        name: 'Equilibrium',
        description: 'Chemical balance',
        progress: 0,
        status: 'available',
        subtopics: ['Kc', 'Kp', 'Le Chatelier'],
        icon: '⚖️',
      },
    ],
  },
  biology: {
    name: 'Biology',
    icon: <Microscope className="h-6 w-6" />,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    greeting:
      "Hi! I'm your Biology tutor. I can help with cell biology, genetics, ecology, and evolution.",
    isLanguage: false,
    preferences: {
      teachingAge: 15,
      voiceGender: 'female',
      voiceAccent: 'US',
    },
    topics: [
      {
        id: 'cells',
        name: 'Cell Biology',
        description: 'Cell structure',
        progress: 0,
        status: 'available',
        subtopics: ['Organelles', 'Membrane', 'Division'],
        icon: '🧬',
      },
      {
        id: 'genetics',
        name: 'Genetics',
        description: 'Heredity and DNA',
        progress: 0,
        status: 'available',
        subtopics: ['DNA', 'Inheritance', 'Mutations'],
        icon: '🧬',
      },
      {
        id: 'ecology',
        name: 'Ecology',
        description: 'Ecosystems',
        progress: 0,
        status: 'available',
        subtopics: ['Populations', 'Communities', 'Biomes'],
        icon: '🌍',
      },
      {
        id: 'evolution',
        name: 'Evolution',
        description: 'Natural selection',
        progress: 0,
        status: 'available',
        subtopics: ['Darwin', 'Speciation', 'Evidence'],
        icon: '🦎',
      },
    ],
  },
  ielts: {
    name: 'IELTS',
    icon: <GraduationCap className="h-6 w-6" />,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    greeting:
      'Welcome to IELTS preparation! I can help you practice all four sections: Listening, Reading, Writing, and Speaking.',
    isLanguage: true,
    preferences: {
      teachingAge: 18,
      voiceGender: 'female',
      voiceAccent: 'British',
    },
    topics: [
      {
        id: 'listening',
        name: 'Listening',
        description: 'Audio comprehension',
        progress: 0,
        status: 'available',
        subtopics: ['Section 1', 'Section 2', 'Section 3', 'Section 4'],
        icon: '🎧',
      },
      {
        id: 'reading',
        name: 'Reading',
        description: 'Text comprehension',
        progress: 0,
        status: 'available',
        subtopics: ['Academic', 'General', 'Strategies'],
        icon: '📖',
      },
      {
        id: 'writing_task1',
        name: 'Writing Task 1',
        description: 'Graphs and letters',
        progress: 0,
        status: 'available',
        subtopics: ['Graphs', 'Processes', 'Letters'],
        icon: '✍️',
      },
      {
        id: 'writing_task2',
        name: 'Writing Task 2',
        description: 'Essays',
        progress: 0,
        status: 'available',
        subtopics: ['Opinion', 'Discussion', 'Problem-Solution'],
        icon: '📝',
      },
      {
        id: 'speaking',
        name: 'Speaking',
        description: 'Oral exam',
        progress: 0,
        status: 'available',
        subtopics: ['Part 1', 'Part 2', 'Part 3'],
        icon: '🗣️',
      },
    ],
  },
  toefl: {
    name: 'TOEFL',
    icon: <GraduationCap className="h-6 w-6" />,
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    greeting: 'Welcome to TOEFL preparation! I can help you prepare for all sections of the test.',
    isLanguage: true,
    preferences: {
      teachingAge: 18,
      voiceGender: 'female',
      voiceAccent: 'US',
    },
    topics: [
      {
        id: 'reading',
        name: 'Reading',
        description: 'Academic texts',
        progress: 0,
        status: 'available',
        subtopics: ['Passages', 'Questions', 'Strategies'],
        icon: '📖',
      },
      {
        id: 'listening',
        name: 'Listening',
        description: 'Lectures and conversations',
        progress: 0,
        status: 'available',
        subtopics: ['Conversations', 'Lectures', 'Note-taking'],
        icon: '🎧',
      },
      {
        id: 'speaking',
        name: 'Speaking',
        description: 'Oral responses',
        progress: 0,
        status: 'available',
        subtopics: ['Independent', 'Integrated', 'Templates'],
        icon: '🗣️',
      },
      {
        id: 'writing',
        name: 'Writing',
        description: 'Essays',
        progress: 0,
        status: 'available',
        subtopics: ['Integrated', 'Independent', 'Structure'],
        icon: '✍️',
      },
    ],
  },
  cs: {
    name: 'Computer Science',
    icon: <Monitor className="h-6 w-6" />,
    color: 'text-gray-700',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
    greeting:
      "Hello! I'm your CS tutor. I can help with programming, algorithms, data structures, and more.",
    isLanguage: false,
    preferences: {
      teachingAge: 16,
      voiceGender: 'male',
      voiceAccent: 'US',
    },
    topics: [
      {
        id: 'programming',
        name: 'Programming',
        description: 'Coding basics',
        progress: 0,
        status: 'available',
        subtopics: ['Variables', 'Control Flow', 'Functions'],
        icon: '💻',
      },
      {
        id: 'algorithms',
        name: 'Algorithms',
        description: 'Problem solving',
        progress: 0,
        status: 'available',
        subtopics: ['Sorting', 'Searching', 'Complexity'],
        icon: '⚙️',
      },
      {
        id: 'data_structures',
        name: 'Data Structures',
        description: 'Organizing data',
        progress: 0,
        status: 'available',
        subtopics: ['Arrays', 'Lists', 'Trees', 'Graphs'],
        icon: '📊',
      },
      {
        id: 'databases',
        name: 'Databases',
        description: 'Data storage',
        progress: 0,
        status: 'available',
        subtopics: ['SQL', 'Tables', 'Queries'],
        icon: '🗄️',
      },
    ],
  },
}

// Quick Actions Component with Tabs
function QuickActionsPanel({
  subjectCode,
  config,
  collapsed = false,
  onToggleCollapse,
}: {
  subjectCode: string
  config: any
  collapsed?: boolean
  onToggleCollapse?: () => void
}) {
  const [activeTab, setActiveTab] = useState('quick-actions')
  const [savedItems, setSavedItems] = useState<string[]>([])

  const quickActions = [
    {
      id: 'details',
      label: 'View Subject Details',
      icon: BookOpen,
      href: `/student/subjects/${subjectCode}`,
    },
    { id: 'class', label: 'Book a Session', icon: MessageCircle, href: '/student/courses' },
    {
      id: 'study-groups',
      label: 'Join Study Group',
      icon: Sparkles,
      href: '/student/study-groups',
    },
    { id: 'missions', label: 'View Missions', icon: Target, href: '/student/missions' },
  ]

  const practiceModes = [
    { id: 'quiz', label: 'Quick Quiz', icon: HelpCircle, color: 'bg-blue-100 text-blue-600' },
    { id: 'flashcards', label: 'Flashcards', icon: BookOpen, color: 'bg-green-100 text-green-600' },
    { id: 'timed', label: 'Timed Practice', icon: Clock, color: 'bg-orange-100 text-orange-600' },
    {
      id: 'challenge',
      label: 'Challenge Mode',
      icon: Award,
      color: 'bg-purple-100 text-purple-600',
    },
  ]

  if (collapsed) {
    return (
      <Card className="flex w-16 flex-col items-center py-3">
        <Button variant="ghost" size="icon" onClick={onToggleCollapse} className="mb-2">
          <PanelRight className="h-4 w-4" />
        </Button>

        <div className="my-2 h-px w-8 bg-gray-200" />

        <div className="flex flex-col items-center gap-2 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
            <Target className="h-4 w-4 text-blue-600" />
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-4 w-4 text-green-600" />
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100">
            <Gamepad2 className="h-4 w-4 text-purple-600" />
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-purple-500" />
            Learning Hub
          </CardTitle>
          {onToggleCollapse && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggleCollapse}>
              <PanelRightClose className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-1 flex-col">
        <TabsList className="mx-4 mb-2 grid w-full grid-cols-3">
          <TabsTrigger value="quick-actions" className="text-xs">
            <Target className="mr-1 h-3 w-3" />
            Actions
          </TabsTrigger>
          <TabsTrigger value="practice" className="text-xs">
            <Gamepad2 className="mr-1 h-3 w-3" />
            Practice
          </TabsTrigger>
          <TabsTrigger value="saved" className="text-xs">
            <Bookmark className="mr-1 h-3 w-3" />
            Saved
          </TabsTrigger>
        </TabsList>

        <CardContent className="flex-1 p-4 pt-0">
          <ScrollArea className="h-[calc(100vh-380px)]">
            <TabsContent value="quick-actions" className="mt-0 space-y-2">
              {quickActions.map(action => (
                <Link key={action.id} href={action.href}>
                  <Button variant="outline" className="w-full justify-start text-sm" size="sm">
                    <action.icon className="mr-2 h-4 w-4" />
                    {action.label}
                    <ChevronRight className="ml-auto h-3 w-3" />
                  </Button>
                </Link>
              ))}
            </TabsContent>

            <TabsContent value="practice" className="mt-0">
              <div className="grid grid-cols-2 gap-2">
                {practiceModes.map(mode => (
                  <button
                    key={mode.id}
                    className="group rounded-lg border p-3 text-left transition-all hover:border-blue-300 hover:shadow-md"
                  >
                    <div
                      className={`h-8 w-8 rounded-full ${mode.color} mb-2 flex items-center justify-center`}
                    >
                      <mode.icon className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-medium group-hover:text-blue-600">
                      {mode.label}
                    </span>
                  </button>
                ))}
              </div>

              <div className="mt-4 rounded-lg border bg-gradient-to-r from-blue-50 to-purple-50 p-3">
                <h4 className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Play className="h-4 w-4 text-blue-500" />
                  Daily Challenge
                </h4>
                <p className="mb-2 text-xs text-gray-600">
                  Complete today&apos;s {config.name} challenge for bonus XP!
                </p>
                <Button size="sm" className="w-full text-xs">
                  Start Challenge
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="saved" className="mt-0">
              {savedItems.length === 0 ? (
                <div className="py-8 text-center text-gray-400">
                  <Bookmark className="mx-auto mb-2 h-8 w-8 opacity-50" />
                  <p className="text-sm">No saved items yet</p>
                  <p className="mt-1 text-xs">Important notes will appear here</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {savedItems.map((item, idx) => (
                    <div key={idx} className="rounded bg-gray-50 p-2 text-sm">
                      {item}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </ScrollArea>
        </CardContent>
      </Tabs>
    </Card>
  )
}

export default function SubjectChatPage() {
  const params = useParams()
  const router = useRouter()
  const subjectCode = params.subjectCode as string
  const scrollRef = useRef<HTMLDivElement>(null)

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [whiteboardItems, setWhiteboardItems] = useState<WhiteboardItem[]>([])
  const [currentTopic, setCurrentTopic] = useState<string | undefined>()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [whiteboardCollapsed, setWhiteboardCollapsed] = useState(false)
  const [quickActionsCollapsed, setQuickActionsCollapsed] = useState(false)
  const [showPreferences, setShowPreferences] = useState(false)
  const [showLevelUp, setShowLevelUp] = useState(false)
  const [xpGain, setXpGain] = useState({ amount: 0, reason: '' })

  // NEW: Teaching mode state
  const [teachingMode, setTeachingMode] = useState<TeachingMode>('socratic')
  const [conversationId, setConversationId] = useState<string | null>(null)

  // Background color theme
  const [backgroundColor, setBackgroundColor] = useState('light')

  const config = subjectConfig[subjectCode.toLowerCase()] || {
    name: subjectCode.charAt(0).toUpperCase() + subjectCode.slice(1),
    icon: <BookOpen className="h-6 w-6" />,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    greeting: `Hello! I'm your ${subjectCode} tutor. How can I help you today?`,
    isLanguage: false,
    preferences: {
      teachingAge: 15,
      voiceGender: 'male' as const,
      voiceAccent: 'US',
    },
    topics: [],
  }

  // Add greeting message on mount
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: 'greeting',
          role: 'assistant',
          content: config.greeting,
          timestamp: new Date().toISOString(),
        },
      ])
    }
  }, [config.greeting])

  // Auto-scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim()) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date().toISOString(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      // Use the NEW modular tutor API
      const res = await fetch('/api/ai/tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input,
          subject: subjectCode,
          topic: currentTopic || null,
          mode: teachingMode,
          teachingAge: config.preferences.teachingAge,
          voiceGender: config.preferences.voiceGender,
          voiceAccent: config.preferences.voiceAccent,
          conversationId,
        }),
      })

      if (!res.ok) {
        let errorMessage = 'Failed to get response'
        try {
          const errorData = await res.json()
          errorMessage = errorData.error || errorData.details || 'Failed to get response'
        } catch {
          // If JSON parsing fails, use status text
          errorMessage = res.statusText || 'Server error'
        }
        throw new Error(errorMessage)
      }

      const data = await res.json()

      // Store conversation ID for continuity
      if (data.conversationId && !conversationId) {
        setConversationId(data.conversationId)
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response,
        timestamp: new Date().toISOString(),
        hintType: data.isSocratic ? 'socratic' : 'direct',
      }

      setMessages(prev => [...prev, assistantMessage])

      // Add whiteboard items from response
      if (data.whiteboardItems && data.whiteboardItems.length > 0) {
        const newItems = data.whiteboardItems.map((item: any, idx: number) => ({
          id: `wb-${Date.now()}-${idx}`,
          type: item.type === 'formula' ? 'text' : (item.type as any),
          content: item.content,
          timestamp: new Date().toISOString(),
        }))
        setWhiteboardItems(prev => [...prev, ...newItems])
      }
    } catch (error) {
      console.error('AI tutor error:', error)
      toast.error('AI tutor temporarily unavailable. Please try again.')

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `I apologize, but I'm having trouble connecting right now. Please try again in a moment.`,
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleTopicSelect = (topicId: string) => {
    setCurrentTopic(topicId)
    const topic = config.topics.find(t => t.id === topicId || topicId.startsWith(t.id))
    if (topic) {
      setInput(`Can you help me with ${topic.name}? ${topic.description}`)
    }
  }

  const getMood = (hintType?: string): 'neutral' | 'happy' | 'thinking' | 'encouraging' => {
    switch (hintType) {
      case 'encouragement':
        return 'encouraging'
      case 'socratic':
        return 'thinking'
      default:
        return 'neutral'
    }
  }

  const lastAssistantMessage = messages.filter(m => m.role === 'assistant').pop()
  const currentMood = getMood(lastAssistantMessage?.hintType)

  // Get current mode config
  const currentModeConfig = teachingModes.find(m => m.key === teachingMode)

  // Background color classes mapping
  const bgColorClasses: Record<string, string> = {
    light: 'bg-gray-50',
    warm: 'bg-amber-50',
    cool: 'bg-slate-100',
    mint: 'bg-emerald-50',
    lavender: 'bg-purple-50',
    dark: 'bg-gray-900',
  }

  return (
    <div
      className={`min-h-screen ${bgColorClasses[backgroundColor] || 'bg-gray-50'} flex flex-col`}
    >
      {/* Header - Full Width */}
      <header className={`${config.bgColor} border-b ${config.borderColor}`}>
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <BackButton href={`/student/subjects/${subjectCode}`} />
              <div className={`rounded-lg p-2 ${config.color} bg-white`}>{config.icon}</div>
              <div>
                <h1 className="text-xl font-bold">{config.name} AI Tutor</h1>
                <p className="text-sm text-gray-600">
                  Teaching like a {config.preferences.teachingAge}-year-old with{' '}
                  {config.preferences.voiceGender} {config.preferences.voiceAccent} voice
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* NEW: Teaching Mode Selector */}
              <Select value={teachingMode} onValueChange={v => setTeachingMode(v as TeachingMode)}>
                <SelectTrigger className="w-[180px] bg-white">
                  <div className="flex items-center gap-2">
                    {currentModeConfig?.icon}
                    <span>{currentModeConfig?.name}</span>
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {teachingModes.map(mode => (
                    <SelectItem key={mode.key} value={mode.key}>
                      <div className="flex items-center gap-2">
                        {mode.icon}
                        <div className="flex flex-col">
                          <span className="font-medium">{mode.name}</span>
                          <span className="text-xs text-gray-500">{mode.description}</span>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Settings */}
              <Sheet open={showPreferences} onOpenChange={setShowPreferences}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Settings className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent>
                  <SheetTitle>Tutor Settings</SheetTitle>
                  <div className="mt-4">
                    <TutorPreferences
                      enrollmentId="demo"
                      currentPreferences={{
                        teachingAge: config.preferences.teachingAge,
                        voiceGender: config.preferences.voiceGender,
                        voiceAccent: config.preferences.voiceAccent,
                        avatarStyle: 'modern',
                        backgroundColor: backgroundColor,
                      }}
                      onUpdate={prefs => {
                        if (prefs.backgroundColor) {
                          setBackgroundColor(prefs.backgroundColor)
                        }
                        toast.success('Preferences updated!')
                        setShowPreferences(false)
                      }}
                    />
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content - Full Width Edge to Edge */}
      <div className="flex-1 overflow-hidden p-4">
        <div className="flex h-[calc(100vh-140px)] gap-4">
          {/* Left Sidebar - Topics */}
          <div
            className={cn(
              'hidden flex-shrink-0 transition-all duration-300 lg:block',
              sidebarCollapsed ? 'w-16' : 'w-72'
            )}
          >
            {config.topics.length > 0 ? (
              <TopicSidebar
                topics={config.topics}
                currentTopic={currentTopic}
                onSelectTopic={handleTopicSelect}
                collapsed={sidebarCollapsed}
                onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="h-full"
              />
            ) : (
              <Card className="flex h-full flex-col">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-blue-500" />
                    <CardTitle className="text-sm font-medium">Topics</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 items-center justify-center text-center text-gray-400">
                  <p className="text-sm">Topics coming soon</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Center Column - Avatar, Content Area, Chat - Expands Dynamically */}
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            {/* Mode Indicator Banner */}
            <div
              className={cn(
                'flex items-center justify-between rounded-lg px-4 py-2 text-sm',
                teachingMode === 'socratic' && 'border border-amber-200 bg-amber-50',
                teachingMode === 'direct' && 'border border-blue-200 bg-blue-50',
                teachingMode === 'lesson' && 'border border-purple-200 bg-purple-50',
                teachingMode === 'practice' && 'border border-green-200 bg-green-50'
              )}
            >
              <div className="flex items-center gap-2">
                {currentModeConfig?.icon}
                <span className="font-medium">{currentModeConfig?.name} Mode</span>
                <span className="text-gray-500">— {currentModeConfig?.description}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setTeachingMode('socratic')}
              >
                Reset to Socratic
              </Button>
            </div>

            {/* AI Avatar Section */}
            <Card className="p-6">
              <div className="flex flex-col items-center text-center">
                <AIAvatar isSpeaking={loading} mood={currentMood} size="md" />
                <div className="mt-4">
                  <h2 className="text-xl font-semibold">Your {config.name} Tutor</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    I&apos;m teaching you like a {config.preferences.teachingAge}-year-old with a{' '}
                    {config.preferences.voiceGender} {config.preferences.voiceAccent} voice.
                  </p>
                </div>
              </div>
            </Card>

            {/* Learning Content Area */}
            <Card className="min-h-[150px] flex-1 p-4">
              <div className="flex h-full flex-col items-center justify-center text-center text-gray-400">
                <FileText className="mb-2 h-10 w-10 opacity-50" />
                <p className="text-sm">Interactive Learning Space</p>
                <p className="mt-1 text-xs">Lessons, diagrams, and exercises will appear here</p>
              </div>
            </Card>

            {/* Chat Area */}
            <Card className="flex flex-col overflow-hidden" style={{ maxHeight: '350px' }}>
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {messages.map(message => (
                    <div
                      key={message.id}
                      className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {message.role === 'assistant' && (
                        <AIAvatarPlaceholder mood={getMood(message.hintType)} size="sm" />
                      )}

                      <div
                        className={`max-w-[80%] rounded-lg p-3 ${
                          message.role === 'user'
                            ? 'bg-blue-600 text-white'
                            : 'border bg-white shadow-sm'
                        }`}
                      >
                        <p className="whitespace-pre-wrap text-sm">{message.content}</p>

                        {message.hintType && (
                          <Badge variant="secondary" className="mt-2 text-xs capitalize">
                            {message.hintType}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}

                  {loading && (
                    <div className="flex justify-start gap-3">
                      <AIAvatarPlaceholder mood="thinking" size="sm" />
                      <div className="rounded-lg border bg-white p-3">
                        <div className="flex gap-1">
                          <span className="h-2 w-2 animate-bounce rounded-full bg-blue-500" />
                          <span className="h-2 w-2 animate-bounce rounded-full bg-blue-500 [animation-delay:0.1s]" />
                          <span className="h-2 w-2 animate-bounce rounded-full bg-blue-500 [animation-delay:0.2s]" />
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={scrollRef} />
                </div>
              </ScrollArea>

              {/* Input Area */}
              <CardContent className="border-t bg-gray-50 pt-4">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setIsRecording(!isRecording)}
                    className={isRecording ? 'text-red-500' : ''}
                  >
                    {isRecording ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                  </Button>
                  <Input
                    placeholder={`Ask about ${config.name}...`}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="flex-1"
                  />
                  <Button onClick={handleSend} disabled={loading || !input.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                <p className="mt-2 text-xs text-gray-400">
                  <Lightbulb className="mr-1 inline h-3 w-3" />
                  Tip: Be specific about what you need help with for better answers.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Whiteboard and Quick Actions (Independent Collapse to Right) */}
          <div
            className={cn(
              'hidden flex-shrink-0 flex-col items-end gap-4 transition-all duration-300 lg:flex',
              whiteboardCollapsed && quickActionsCollapsed ? 'w-16' : 'w-80'
            )}
          >
            {/* Whiteboard (Top) - Always collapses to right edge */}
            <div
              className={cn('transition-all duration-300', whiteboardCollapsed ? 'w-16' : 'w-full')}
            >
              <AIWhiteboard
                items={whiteboardItems}
                onClear={() => setWhiteboardItems([])}
                collapsed={whiteboardCollapsed}
                onToggleCollapse={() => setWhiteboardCollapsed(!whiteboardCollapsed)}
                collapseDirection="right"
              />
            </div>

            {/* Quick Actions (Bottom) - Always collapses to right edge */}
            <div
              className={cn(
                'min-h-0 flex-1 transition-all duration-300',
                quickActionsCollapsed ? 'w-16' : 'w-full'
              )}
            >
              <QuickActionsPanel
                subjectCode={subjectCode}
                config={config}
                collapsed={quickActionsCollapsed}
                onToggleCollapse={() => setQuickActionsCollapsed(!quickActionsCollapsed)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Topic Menu */}
      <div className="fixed bottom-4 left-4 z-50 lg:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm">
              <Menu className="mr-2 h-4 w-4" />
              Topics
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[300px] sm:w-[400px]">
            <SheetTitle>Topics</SheetTitle>
            <div className="mt-4 h-full">
              <TopicSidebar
                topics={config.topics}
                currentTopic={currentTopic}
                onSelectTopic={handleTopicSelect}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  )
}
