'use client'

import Link from 'next/link'
import { Star, BookOpen, Users, UserPlus, CalendarDays, Video } from 'lucide-react'
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

const BIO_MAX_INPUT = 500
const BIO_MAX_DISPLAY = 300

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
  const rawBio = tutor.bio || "This area is for the tutor's bio information."

  // Bio display: truncate at 300 chars
  const bioText =
    rawBio.length > BIO_MAX_DISPLAY
      ? rawBio.slice(0, BIO_MAX_DISPLAY) + '…'
      : rawBio

  const avatarUrl = resolvePublicUrl(tutor.avatar)

  const cardContent = (
    <div
      className={cn(
        'relative flex h-full w-full flex-col gap-3 overflow-hidden rounded-[20px] bg-[#1e3a5f] p-4 text-white shadow-[0_12px_30px_rgba(0,0,0,0.25)]',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {/* Header Row: Avatar | Info */}
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-white/20 bg-white/10 shadow-lg">
          {avatarUrl ? (
            <img src={avatarUrl} alt={tutor.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-base font-semibold text-white/70">
              {initials}
            </div>
          )}
        </div>

        {/* Info Block — takes all remaining width */}
        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className="truncate text-lg font-bold text-white">{tutor.name}</h3>
          <p className="truncate text-xs text-white/70">@{tutor.username || tutor.id}</p>
          <p className="mt-0.5 truncate text-xs font-medium text-white/90">{displaySubject}</p>
          <div className="mt-1 flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
            <span className="text-xs font-semibold text-white">{tutor.rating.toFixed(1)}</span>
            <span className="text-[11px] text-white/60">({tutor.reviewCount})</span>
          </div>
        </div>
      </div>

      {/* Pills Row — full width, below header */}
      {(categories.length > 0 || countries.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {categories.map(cat => (
            <span
              key={cat}
              className="rounded-full border border-white/25 bg-white/10 px-2 py-0.5 text-[11px] text-white/90"
            >
              {cat}
            </span>
          ))}
          {countries.map(country => (
            <span
              key={country}
              className="rounded-full border border-white/25 bg-white/10 px-2 py-0.5 text-[11px] text-white/90"
            >
              {country}
            </span>
          ))}
        </div>
      )}

      {/* Bio — clean box, no icon */}
      <div className="flex min-h-[140px] flex-1 flex-col rounded-[14px] border border-white/15 bg-white/5 px-4 py-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-white">Bio</p>
          <span className="text-[11px] text-white/40">
            {rawBio.length} / {BIO_MAX_INPUT}
          </span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-white/70">{bioText}</p>
      </div>

      {/* Stats — pill style */}
      <div className="flex gap-3">
        <div className="flex h-10 flex-1 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4">
          <BookOpen className="h-4 w-4 text-white/70" />
          <span className="text-xs text-white/80">Courses</span>
          <span className="ml-auto text-base font-bold text-white">{tutor.totalClasses}</span>
        </div>
        <div className="flex h-10 flex-1 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4">
          <Users className="h-4 w-4 text-white/70" />
          <span className="text-xs text-white/80">Enrollments</span>
          <span className="ml-auto text-base font-bold text-white">{tutor.totalStudents}</span>
        </div>
      </div>

      {/* Actions — Book 1 on 1 (left, white) | Follow (right, outline) */}
      <div className="flex items-center gap-3">
        {bookHref ? (
          <Link
            href={bookHref}
            onClick={e => e.stopPropagation()}
            className={cn(
              'flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold text-[#1e3a5f] transition-all duration-200 hover:bg-white/90'
            )}
          >
            <Video className="h-4 w-4" />
            Book 1 on 1
          </Link>
        ) : (
          <div className="flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-white/10 text-sm font-semibold text-white/50">
            <CalendarDays className="h-4 w-4" />
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
              'flex h-10 min-w-[120px] items-center justify-center gap-2 rounded-full border px-5 text-sm font-semibold transition-all duration-200',
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
            className="flex h-10 min-w-[120px] items-center justify-center gap-2 rounded-full border-white/40 bg-white/10 px-5 text-sm font-semibold text-white hover:bg-white/20 hover:text-white"
          >
            <Link href={`/u/${tutor.username || tutor.id}`} onClick={e => e.stopPropagation()}>
              <UserPlus className="h-4 w-4" />
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
