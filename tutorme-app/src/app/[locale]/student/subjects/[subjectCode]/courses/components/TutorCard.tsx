'use client'

import Link from 'next/link'
import { Star, BookOpen, Users, UserPlus, CalendarDays, User, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { resolvePublicUrl } from '@/lib/utils'
import { cn } from '@/lib/utils'

export interface Tutor {
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
  specialties?: string[]
  countries?: string[]
}

export interface TutorCardProps {
  tutor: Tutor
  subjectCode?: string
  onClick?: () => void
  followState?: 'following' | 'not-following'
  onFollowToggle?: () => void
  bookHref?: string
  className?: string
}

export function TutorCard({
  tutor,
  subjectCode,
  onClick,
  followState = 'not-following',
  onFollowToggle,
  bookHref,
  className,
}: TutorCardProps) {
  const initials = tutor.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const categories = (tutor.specialties || []).slice(0, 3)
  const countries = (tutor.countries || []).slice(0, 3)

  const displaySubject = subjectCode || categories[0] || 'General'
  const bioText = tutor.bio || "This area is for the tutor's bio information."
  const avatarUrl = resolvePublicUrl(tutor.avatar)

  const cardContent = (
    <div
      className={cn(
        'relative flex flex-col gap-4 overflow-hidden rounded-[20px] p-5 text-white shadow-[0_12px_30px_rgba(0,0,0,0.25)]',
        onClick && 'cursor-pointer',
        className
      )}
      style={{
        background: 'linear-gradient(145deg, #3b5f9e 0%, #2e4d7a 40%, #1e3a5f 100%)',
      }}
    >
      {/* Header Row: Avatar | Info | Pills */}
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-white/20 bg-white/10 shadow-lg sm:h-24 sm:w-24">
          {avatarUrl ? (
            <img src={avatarUrl} alt={tutor.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-white/70">
              {initials}
            </div>
          )}
        </div>

        {/* Info Block */}
        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className="text-xl font-bold text-white">{tutor.name}</h3>
          <p className="text-sm text-white/70">@{tutor.username || tutor.id}</p>
          <p className="mt-0.5 text-sm font-medium text-white/90">{displaySubject}</p>
          <div className="mt-1 flex items-center gap-1.5">
            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
            <span className="text-sm font-semibold text-white">{tutor.rating.toFixed(1)}</span>
            <span className="text-xs text-white/60">({tutor.reviewCount})</span>
          </div>
        </div>

        {/* Pills — Top Right, two rows, right-aligned */}
        <div className="hidden flex-col items-end gap-1.5 sm:flex">
          {categories.length > 0 && (
            <div className="flex flex-wrap justify-end gap-1.5">
              {categories.map(cat => (
                <span
                  key={cat}
                  className="rounded-full border border-white/25 bg-white/10 px-2.5 py-0.5 text-[11px] text-white/90 backdrop-blur-sm"
                >
                  {cat}
                </span>
              ))}
            </div>
          )}
          {countries.length > 0 && (
            <div className="flex flex-wrap justify-end gap-1.5">
              {countries.map(country => (
                <span
                  key={country}
                  className="rounded-full border border-white/25 bg-white/10 px-2.5 py-0.5 text-[11px] text-white/90 backdrop-blur-sm"
                >
                  {country}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mobile pills — shown below header on narrow viewports */}
      {(categories.length > 0 || countries.length > 0) && (
        <div className="flex flex-wrap gap-1.5 sm:hidden">
          {categories.map(cat => (
            <span
              key={cat}
              className="rounded-full border border-white/25 bg-white/10 px-2.5 py-0.5 text-[11px] text-white/90"
            >
              {cat}
            </span>
          ))}
          {countries.map(country => (
            <span
              key={country}
              className="rounded-full border border-white/25 bg-white/10 px-2.5 py-0.5 text-[11px] text-white/90"
            >
              {country}
            </span>
          ))}
        </div>
      )}

      {/* Bio — dashed box with icon */}
      <div className="flex items-start gap-3 rounded-xl border border-dashed border-white/20 bg-white/5 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10">
          <User className="h-5 w-5 text-white/70" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">Bio</p>
          <p className="mt-1 text-sm leading-relaxed text-white/70">{bioText}</p>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-white/10" />

      {/* Stats — icon + label + number */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/5 px-4 py-3">
          <BookOpen className="h-5 w-5 text-white/70" />
          <span className="text-sm text-white/80">Courses</span>
          <span className="ml-auto text-lg font-bold text-white">{tutor.totalClasses}</span>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/5 px-4 py-3">
          <Users className="h-5 w-5 text-white/70" />
          <span className="text-sm text-white/80">Enrollments</span>
          <span className="ml-auto text-lg font-bold text-white">{tutor.totalStudents}</span>
        </div>
      </div>

      {/* Actions — Book 1 on 1 (left) | Follow (right) */}
      <div className="flex items-center justify-between">
        {bookHref ? (
          <Link
            href={bookHref}
            onClick={e => e.stopPropagation()}
            className="flex items-center gap-2 text-sm text-white/80 hover:text-white"
          >
            <Video className="h-4 w-4 text-white/60" />
            Book 1 on 1
          </Link>
        ) : (
          <div className="flex items-center gap-2 text-sm text-white/80">
            <CalendarDays className="h-4 w-4 text-white/60" />
            Book 1 on 1
          </div>
        )}

        {onFollowToggle ? (
          <button
            onClick={e => {
              e.stopPropagation()
              onFollowToggle()
            }}
            className={cn(
              'flex h-10 items-center gap-1.5 rounded-xl border px-5 text-sm font-semibold transition-all duration-200',
              followState === 'following'
                ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-50 hover:bg-emerald-500/30'
                : 'border-white/40 bg-white/10 text-white hover:bg-white/20'
            )}
          >
            <UserPlus className="h-4 w-4" />
            {followState === 'following' ? 'Following' : 'Follow'}
          </button>
        ) : (
          <Button
            asChild
            variant="outline"
            className="h-10 rounded-xl border-white/40 bg-white/10 px-5 text-sm font-semibold text-white hover:bg-white/20 hover:text-white"
          >
            <Link href={`/u/${tutor.username || tutor.id}`} onClick={e => e.stopPropagation()}>
              <UserPlus className="mr-1.5 h-4 w-4" />
              Follow
            </Link>
          </Button>
        )}
      </div>
    </div>
  )

  if (onClick) {
    return (
      <div
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') onClick()
        }}
      >
        {cardContent}
      </div>
    )
  }

  return cardContent
}
