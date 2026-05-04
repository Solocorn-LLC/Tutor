'use client'

import Link from 'next/link'
import { Star, Video, Users, BookOpen, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Tutor {
  id: string
  username?: string
  name: string
  avatar: string | null
  bio: string
  rating: number
  reviewCount: number
  hourlyRate: number | null
  currency: string
  nextAvailableSlot: string | null
  totalStudents: number
  totalClasses: number
}

interface TutorCardProps {
  tutor: Tutor
  subjectCode: string
}

export function TutorCard({ tutor, subjectCode }: TutorCardProps) {
  // Generate initials for avatar fallback
  const initials = tutor.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  // Format price display
  const formatPrice = () => {
    if (tutor.hourlyRate === null) {
      return <span className="text-slate-300">Contact for pricing</span>
    }
    return (
      <span className="font-semibold text-slate-100">
        {tutor.currency} {tutor.hourlyRate.toFixed(2)}
        <span className="text-sm font-normal text-slate-400">/hr</span>
      </span>
    )
  }

  return (
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-[20px] text-left transition-all duration-300',
        'border border-[rgba(255,255,255,0.12)]',
        'bg-[rgba(30,40,50,0.65)] backdrop-blur-[12px]',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_12px_30px_rgba(0,0,0,0.35)]',
        'hover:-translate-y-[2px] hover:brightness-105',
        'hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_14px_30px_rgba(0,0,0,0.40)]'
      )}
      style={{
        backgroundImage:
          'linear-gradient(120deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 40%, rgba(255,255,255,0.00) 65%), linear-gradient(145deg, rgba(70, 110, 180, 0.75), rgba(25, 55, 110, 0.95))',
      }}
    >
      <div className="flex flex-col p-5">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[16px] border border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.03)] shadow-[0_6px_16px_rgba(0,0,0,0.35)] sm:h-24 sm:w-24">
            <img
              src={tutor.avatar || undefined}
              alt={tutor.name}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col pt-1">
            <h3 className="truncate text-lg font-semibold leading-tight text-slate-50">
              {tutor.name}
            </h3>
            <p className="text-xs font-medium text-slate-300">
              @{tutor.username || tutor.name.toLowerCase().replace(/\s+/g, '')}
            </p>
            <p className="mt-1 truncate text-xs text-slate-300">
              {subjectCode ? `${subjectCode} Tutor` : 'Experienced tutor ready to help'}
            </p>
          </div>
        </div>

        {/* Bio — supports up to ~500 chars */}
        <div className="mt-3 text-sm leading-relaxed text-slate-100">
          {tutor.bio || 'Experienced tutor ready to help you improve quickly.'}
        </div>

        {/* Rating */}
        <div className="mt-3 flex items-center gap-1">
          <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
          <span className="ml-1 text-base font-medium text-slate-100">
            {tutor.rating.toFixed(1)}
          </span>
          <span className="ml-1 text-slate-400">({tutor.reviewCount})</span>
        </div>

        {/* Tags */}
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-full border border-[rgba(255,255,255,0.2)] px-2.5 py-0.5 text-[11px] text-slate-200">
              IGCSE Physics
            </span>
            <span className="rounded-full border border-[rgba(255,255,255,0.2)] px-2.5 py-0.5 text-[11px] text-slate-200">
              TOEFL iBT
            </span>
            <span className="rounded-full border border-[rgba(255,255,255,0.2)] px-2.5 py-0.5 text-[11px] text-slate-200">
              General
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-full border border-[rgba(255,255,255,0.2)] px-2.5 py-0.5 text-[11px] text-slate-200">
              Kuwait
            </span>
            <span className="rounded-full border border-[rgba(255,255,255,0.2)] px-2.5 py-0.5 text-[11px] text-slate-200">
              Qatar
            </span>
            <span className="rounded-full border border-[rgba(255,255,255,0.2)] px-2.5 py-0.5 text-[11px] text-slate-200">
              Global
            </span>
          </div>
        </div>

        {/* Divider */}
        <div className="my-3 border-b border-[rgba(255,255,255,0.1)]" />

        {/* Stats — icon + label + number on one line */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] px-3 py-2">
            <BookOpen className="h-4 w-4 text-slate-300" />
            <span className="text-xs text-slate-300">Courses</span>
            <span className="ml-auto text-sm font-semibold text-slate-100">
              {tutor.totalClasses}
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] px-3 py-2">
            <Users className="h-4 w-4 text-slate-300" />
            <span className="text-xs text-slate-300">Enrollments</span>
            <span className="ml-auto text-sm font-semibold text-slate-100">
              {tutor.totalStudents}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Link
            href={`/u/${tutor.username || tutor.id}?book=1`}
            className="flex items-center justify-center gap-2 rounded-xl bg-white py-2.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50"
          >
            <Video className="h-4 w-4" />
            Book 1 on 1
          </Link>
          <Link
            href={`/u/${tutor.username || tutor.id}`}
            className="flex items-center justify-center gap-2 rounded-xl border border-white/30 bg-blue-600/40 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-600/50"
          >
            <UserPlus className="h-4 w-4" />
            Follow
          </Link>
        </div>

        {/* Price & availability row (preserved from original) */}
        <div className="mt-3 flex items-center justify-between text-xs text-slate-300">
          <span>{formatPrice()}</span>
          <span className="text-slate-400">
            {tutor.nextAvailableSlot
              ? `Available ${new Date(tutor.nextAvailableSlot).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
              : 'Check availability'}
          </span>
        </div>
      </div>
    </div>
  )
}
