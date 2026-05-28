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

  const bioText =
    rawBio.length > BIO_MAX_DISPLAY
      ? rawBio.slice(0, BIO_MAX_DISPLAY) + '…'
      : rawBio

  const avatarUrl = resolvePublicUrl(tutor.avatar)

  const cardContent = (
    <div
      className={cn(
        'card-translucent relative flex h-full w-full flex-col gap-3 overflow-hidden rounded-[20px] p-4 text-card-foreground',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {/* Header Row: Avatar | Info */}
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-border/30 bg-muted shadow-md">
          {avatarUrl ? (
            <img src={avatarUrl} alt={tutor.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-base font-semibold text-muted-foreground">
              {initials}
            </div>
          )}
        </div>

        {/* Info Block */}
        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className="truncate text-lg font-bold text-foreground">{tutor.name}</h3>
          <p className="truncate text-xs text-muted-foreground">@{tutor.username || tutor.id}</p>
          <p className="mt-0.5 truncate text-xs font-medium text-foreground/80">{displaySubject}</p>
          <div className="mt-1 flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-warning text-warning" />
            <span className="text-xs font-semibold text-foreground">{tutor.rating.toFixed(1)}</span>
            <span className="text-[11px] text-muted-foreground">({tutor.reviewCount})</span>
          </div>
        </div>
      </div>

      {/* Pills Row */}
      {(categories.length > 0 || countries.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {categories.map(cat => (
            <span
              key={cat}
              className="rounded-full border border-border/30 bg-muted/60 px-2 py-0.5 text-[11px] text-foreground/80"
            >
              {cat}
            </span>
          ))}
          {countries.map(country => (
            <span
              key={country}
              className="rounded-full border border-border/30 bg-muted/60 px-2 py-0.5 text-[11px] text-foreground/80"
            >
              {country}
            </span>
          ))}
        </div>
      )}

      {/* Bio */}
      <div className="flex min-h-[140px] flex-1 flex-col rounded-[14px] border border-border/20 bg-muted/40 px-4 py-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Bio</p>
          <span className="text-[11px] text-muted-foreground/60">
            {rawBio.length} / {BIO_MAX_DISPLAY}
          </span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{bioText}</p>
      </div>

      {/* Stats */}
      <div className="flex gap-3">
        <div className="flex h-10 flex-1 items-center gap-2 rounded-full border border-border/20 bg-muted/40 px-4">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Courses</span>
          <span className="ml-auto text-base font-bold text-foreground">{tutor.totalClasses}</span>
        </div>
        <div className="flex h-10 flex-1 items-center gap-2 rounded-full border border-border/20 bg-muted/40 px-4">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Enrollments</span>
          <span className="ml-auto text-base font-bold text-foreground">{tutor.totalStudents}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {bookHref ? (
          <Link
            href={bookHref}
            onClick={e => e.stopPropagation()}
            className={cn(
              'flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all duration-200 hover:brightness-110 hover:shadow-lg hover:shadow-primary/30 active:scale-[0.98]'
            )}
          >
            <Video className="h-4 w-4" />
            Book 1 on 1
          </Link>
        ) : (
          <div className="flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-muted/50 text-sm font-semibold text-muted-foreground/50">
            <CalendarDays className="h-4 w-4" />
            Book 1 on 1
          </div>
        )}

        {onFollowToggle ? (
          <button
            type="button"
            onClick={e => {
              e.stopPropagation()
              onFollowToggle()
            }}
            className={cn(
              'flex h-10 min-w-[120px] items-center justify-center gap-2 rounded-full border px-5 text-sm font-semibold transition-all duration-200 active:scale-[0.98]',
              followState === 'following'
                ? 'border-success/40 bg-success/15 text-success hover:bg-success/25'
                : 'border-border/40 bg-muted/50 text-foreground hover:bg-muted/70'
            )}
          >
            <UserPlus className="h-4 w-4" />
            {followState === 'following' ? 'Following' : 'Follow'}
          </button>
        ) : (
          <Button
            asChild
            variant="outline"
            className="flex h-10 min-w-[120px] items-center justify-center gap-2 rounded-full border-border/40 bg-muted/50 px-5 text-sm font-semibold text-foreground transition-all duration-200 hover:bg-muted/70 hover:text-foreground"
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
