'use client'

import Link from 'next/link'
import { Star, UserPlus, CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { resolvePublicUrl } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { CountryFlag } from '@/components/country-flag'

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
  onClick?: () => void
  followState?: 'following' | 'not-following'
  onFollowToggle?: () => void
  bookHref?: string
  className?: string
  compact?: boolean
  countryLabel?: string
}

export function TutorCard({
  tutor,
  onClick,
  followState = 'not-following',
  onFollowToggle,
  bookHref,
  className,
  compact = false,
  countryLabel,
}: TutorCardProps) {
  const initials = tutor.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const categories = (tutor.specialties || []).slice(0, 2)
  const countries = (tutor.countries || []).slice(0, 1)

  const bioText = tutor.bio || "This area is for the tutor's bio information."

  const avatarUrl = resolvePublicUrl(tutor.avatar)

  // Check if any category badge would be too long for the card width
  const maxBadgeChars = compact ? 22 : 28
  const visibleCategories = categories.filter(cat => cat.length <= maxBadgeChars)

  const cardContent = (
    <div
      className={cn(
        'relative flex w-full flex-col overflow-hidden rounded-[20px] bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] text-white shadow-[0_14px_45px_rgba(0,0,0,0.14)]',
        compact ? 'h-[280px] gap-2 p-4' : 'h-[420px] gap-4 p-5',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {/* Header Row: Avatar | Info | Country Pills */}
      <div className="flex items-start gap-3">
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
          <h3 className={cn('truncate font-bold text-white', compact ? 'text-base' : 'text-xl')}>
            {tutor.name}
          </h3>
          <p className={cn('truncate text-white/70', compact ? 'text-xs' : 'text-sm')}>
            @{tutor.username || tutor.id}
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

        {/* Country Pills — Top Right */}
        <div className="hidden flex-col items-end gap-1.5 sm:flex">
          {countries.length > 0 && (
            <div className="flex flex-wrap justify-end gap-1.5">
              {countries.map(country => (
                <span
                  key={country}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/10 text-white/90 backdrop-blur-sm',
                    compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-[11px]'
                  )}
                >
                  <CountryFlag countryName={country} size="xs" showLabel />
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Category Badges Row — below header, above bio */}
      {visibleCategories.length > 0 && (
        <div className="hidden flex-wrap gap-1.5 sm:flex">
          {visibleCategories.map(cat => (
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

      {/* Mobile pills — shown below header on narrow viewports */}
      {(visibleCategories.length > 0 || countries.length > 0) && (
        <div className="flex flex-wrap gap-1.5 sm:hidden">
          {visibleCategories.map(cat => (
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
                'inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/10 text-white/90',
                compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-[11px]'
              )}
            >
              <CountryFlag countryName={country} size="xs" />
              {country}
            </span>
          ))}
        </div>
      )}

      {/* Bio */}
      <div
        className={cn(
          'flex flex-col overflow-hidden rounded-[14px] border border-white/15 bg-white/5',
          compact ? 'h-[108px] px-3 py-2' : 'h-[144px] px-4 py-3'
        )}
      >
        <p
          className={cn(
            'text-white/80',
            compact ? 'line-clamp-4 text-xs leading-tight' : 'line-clamp-5 text-sm leading-relaxed'
          )}
        >
          {bioText}
        </p>
      </div>

      {/* Divider */}
      <div className="border-t border-white/10" />

      {/* Stats — text only, single line */}
      <div
        className={cn(
          'flex flex-nowrap items-center gap-x-2 text-white/70',
          compact ? 'text-xs' : 'text-sm'
        )}
      >
        <span className="shrink-0">
          Courses: <span className="font-semibold text-white">{tutor.totalClasses}</span>
        </span>
        <span className="shrink-0 text-white/30">·</span>
        <span className="shrink-0">
          Enrollments: <span className="font-semibold text-white">{tutor.totalStudents}</span>
        </span>
        {countryLabel !== undefined && countryLabel !== '--' && (
          <>
            <span className="shrink-0 text-white/30">·</span>
            <span className="inline-flex shrink-0 items-center gap-1">
              <CountryFlag
                countryName={countryLabel}
                size="xs"
                showLabel
                labelClassName="font-semibold text-white"
              />
            </span>
          </>
        )}
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
