import React from 'react'
import { GraduationCap, BookOpen } from 'lucide-react'

const TUTORS = [
  { name: 'Dr. Aris', subject: 'Quantum Physics', image: 'https://picsum.photos/seed/tutor1/400/400' },
  { name: 'Sarah Jenkins', subject: 'Creative Writing', image: 'https://picsum.photos/seed/tutor2/400/400' },
  { name: 'Chef Marco', subject: 'Culinary Arts', image: 'https://picsum.photos/seed/tutor3/400/400' },
  { name: 'Elena Rossi', subject: 'Digital Marketing', image: 'https://picsum.photos/seed/tutor4/400/400' },
  { name: 'Prof. Zhang', subject: 'Mandarin', image: 'https://picsum.photos/seed/tutor5/400/400' },
  { name: 'David Miller', subject: 'Financial Literacy', image: 'https://picsum.photos/seed/tutor6/400/400' },
]

const COURSES = [
  { title: 'Quantum Physics Bootcamp', category: 'Physics', tutor: 'Dr. Aris' },
  { title: 'Creative Writing Workshop', category: 'Writing', tutor: 'Sarah Jenkins' },
  { title: 'Culinary Arts Fundamentals', category: 'Culinary', tutor: 'Chef Marco' },
  { title: 'Digital Marketing 101', category: 'Marketing', tutor: 'Elena Rossi' },
  { title: 'Mandarin for Beginners', category: 'Languages', tutor: 'Prof. Zhang' },
  { title: 'Personal Finance Basics', category: 'Finance', tutor: 'David Miller' },
]

const matches = (query: string, fields: string[]) => {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return fields.some(f => f.toLowerCase().includes(q))
}

// Two horizontal result strips (tutors + courses), filtered by the hero search query.
// An empty query shows everything; a query with no hits shows a single empty state.
export function SearchResultsPanel({ query }: { query: string }) {
  const tutors = TUTORS.filter(t => matches(query, [t.name, t.subject]))
  const courses = COURSES.filter(c => matches(query, [c.title, c.category, c.tutor]))

  if (tutors.length === 0 && courses.length === 0) {
    return (
      <div className="flex h-full min-h-[40vh] flex-col items-center justify-center px-6 text-center">
        <p className="text-sm text-white/70">
          No tutors or courses match &ldquo;{query}&rdquo;.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-8 overflow-hidden px-4 py-8">
      {/* Tutors strip */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/80">
          <GraduationCap className="h-4 w-4" />
          Tutors
        </h2>
        <div className="scrollbar-hide flex gap-4 overflow-x-auto pb-2">
          {tutors.map(tutor => (
            <div
              key={tutor.name}
              className="w-44 shrink-0 rounded-[20px] border border-white/10 bg-[rgba(30,40,50,0.65)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_10px_25px_rgba(0,0,0,0.30)] backdrop-blur-[12px]"
            >
              <div className="mx-auto mb-3 h-16 w-16 overflow-hidden rounded-full border border-white/15">
                <img
                  src={tutor.image}
                  alt={tutor.name}
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="text-center">
                <div className="text-sm font-bold text-slate-100">{tutor.name}</div>
                <div className="text-xs text-slate-300">{tutor.subject}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Courses strip */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/80">
          <BookOpen className="h-4 w-4" />
          Courses
        </h2>
        <div className="scrollbar-hide flex gap-4 overflow-x-auto pb-2">
          {courses.map(course => (
            <div
              key={course.title}
              className="w-44 shrink-0 rounded-[20px] border border-blue-400/30 bg-gradient-to-br from-blue-500/25 to-blue-900/35 p-4"
            >
              <BookOpen className="mb-3 h-6 w-6 text-white/80" />
              <div className="text-sm font-bold text-white">{course.title}</div>
              <div className="text-xs text-white/70">{course.category}</div>
              <div className="mt-1 text-[10px] uppercase tracking-wide text-white/50">
                {course.tutor}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
