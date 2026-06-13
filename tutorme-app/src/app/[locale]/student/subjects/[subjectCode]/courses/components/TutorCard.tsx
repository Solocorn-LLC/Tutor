'use client'

import Link from 'next/link'
import { Star, UserPlus, CalendarDays } from 'lucide-react'
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
  compact?: boolean
}

const BIO_MAX_DISPLAY = 400

export function TutorCard({
  tutor,
  subjectCode,
  onClick,
  followState = 'not-following',
  onFollowToggle,
  bookHref,
  className,
  compact = false,
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
  const bioText = rawBio.length > BIO_MAX_DISPLAY ? rawBio.slice(0, BIO_MAX_DISPLAY) + '…' : rawBio

  const avatarUrl = resolvePublicUrl(tutor.avatar)

  const cardContent = (
    <div
      className={cn(
        'relative flex w-full flex-col overflow-hidden rounded-[20px] bg-[#1e3a5f] text-white shadow-[0_12px_30px_rgba(0,0,0,0.25)]',
        compact ? 'h-[360px] gap-3 p-4' : 'h-[460px] gap-4 p-5',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {/* Header Row: Avatar | Info | Pills */}
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div
          className={cn(
            'shrink-0 overflow-hidden border border-white/20 bg-white/10 shadow-lg',
            compact ? 'h-14 w-14 rounded-xl' : 'h-20 w-20 rounded-2xl'
          )}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt={tutor.name} className="h-full w-full object-cover" />
          ) : (
            <div
              className={cn(
                'flex h-full w-full items-center justify-center font-semibold text-white/70',
                compact ? 'text-sm' : 'text-lg'
              )}
            >
              {initials}
            </div>
          )}
        </div>

        {/* Info Block */}
        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className={cn('font-bold text-white', compact ? 'text-base' : 'text-xl')}>
            {tutor.name}
          </h3>
          <p className={cn('text-white/70', compact ? 'text-xs' : 'text-sm')}>
            @{tutor.username || tutor.id}
          </p>
          <p className={cn('mt-0.5 font-medium text-white/90', compact ? 'text-xs' : 'text-sm')}>
            {displaySubject}
          </p>
          <div className="mt-1 flex items-center gap-1.5">
            <Star
              className={cn('fill-yellow-400 text-yellow-400', compact ? 'h-3 w-3' : 'h-4 w-4')}
            />
            <span className={cn('font-semibold text-white', compact ? 'text-xs' : 'text-sm')}>
              {tutor.rating.toFixed(1)}
            </span>
            <span className={cn('text-white/60', compact ? 'text-[10px]' : 'text-xs')}>
              ({tutor.reviewCount})
            </span>
          </div>
        </div>

        {/* Pills — Top Right, two rows, right-aligned */}
        <div className="hidden flex-col items-end gap-1.5 sm:flex">
          {categories.length > 0 && (
            <div className="flex flex-wrap justify-end gap-1.5">
              {categories.map(cat => (
                <span
                  key={cat}
                  className={cn(
                    'rounded-full border border-white/25 bg-white/10 text-white/90 backdrop-blur-sm',
                    compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-[11px]'
                  )}
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
                  className={cn(
                    'rounded-full border border-white/25 bg-white/10 text-white/90 backdrop-blur-sm',
                    compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-[11px]'
                  )}
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
              className={cn(
                'rounded-full border border-white/25 bg-white/10 text-white/90',
                compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-[11px]'
              )}
            >
              {cat}
            </span>
          ))}
          {countries.map(country => (
            <span
              key={country}
              className={cn(
                'rounded-full border border-white/25 bg-white/10 text-white/90',
                compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-[11px]'
              )}
            >
              {country}
            </span>
          ))}
        </div>
      )}

      {/* Bio */}
      <div
        className={cn(
          'flex flex-1 flex-col rounded-[14px] border border-white/15 bg-white/5',
          compact ? 'min-h-[80px] px-3 py-2' : 'min-h-[120px] px-4 py-3'
        )}
      >
        <p className={cn('text-white/80', compact ? 'text-xs leading-snug' : 'text-sm leading-relaxed')}>
          {bioText}
        </p>
      </div>

      {/* Divider */}
      <div className="border-t border-white/10" />

      {/* Stats — text only */}
      <div className={cn('flex items-center gap-4 text-white/70', compact ? 'text-xs' : 'text-sm')}>
        <span>Courses: <span className="font-semibold text-white">{tutor.totalClasses}</span></span>
        <span className="text-white/30">·</span>
        <span>Enrollments: <span className="font-semibold text-white">{tutor.totalStudents}</span></span>
      </div>

      {/* Actions — Book 1 on 1 (left, white) | Follow (right, outline) */}
      <div className="flex items-center gap-3">
        {bookHref ? (
          <Link
            href={bookHref}
            onClick={e => e.stopPropagation()}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-full bg-white font-semibold text-[#1e3a5f] transition-all duration-200 hover:bg-white/90',
              compact ? 'h-8 text-xs' : 'h-9 text-sm'
            )}
          >
            <CalendarDays className={cn(compact ? 'h-3 w-3' : 'h-4 w-4')} />
            Book 1-on-1
          </Link>
        ) : (
          <div
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-full bg-white/10 font-semibold text-white/50',
              compact ? 'h-8 text-xs' : 'h-9 text-sm'
            )}
          >
            <CalendarDays className={cn(compact ? 'h-3 w-3' : 'h-4 w-4')} />
            Book 1-on-1
          </div>
        )}

        {onFollowToggle ? (
          <button
            onClick={e => {
              e.stopPropagation()
              onFollowToggle()
            }}
            className={cn(
              'flex items-center justify-center gap-2 rounded-full border px-5 font-semibold transition-all duration-200',
              compact ? 'h-8 min-w-[100px] text-xs' : 'h-9 min-w-[120px] text-sm',
              followState === 'following'
                ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-50 hover:bg-emerald-500/30'
                : 'border-white/40 bg-white/10 text-white hover:bg-white/20'
            )}
          >
            <UserPlus className={cn(compact ? 'h-3 w-3' : 'h-4 w-4')} />
            {followState === 'following' ? 'Following' : 'Follow'}
          </button>
        ) : (
          <Button
            asChild
            variant="outline"
            className={cn(
              'flex items-center justify-center gap-2 rounded-full border-white/40 bg-white/10 px-5 font-semibold text-white hover:bg-white/20 hover:text-white',
              compact ? 'h-8 min-w-[100px] text-xs' : 'h-9 min-w-[120px] text-sm'
            )}
          >
            <Link href={`/u/${tutor.username || tutor.id}`} onClick={e => e.stopPropagation()}>
              <UserPlus className={cn(compact ? 'h-3 w-3' : 'h-4 w-4')} />
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
