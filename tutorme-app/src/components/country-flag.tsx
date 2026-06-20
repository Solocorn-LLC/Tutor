'use client'

import { useState } from 'react'
import { Globe } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getCountryCode, getCountryName } from '@/lib/country-flags'

export type CountryFlagSize = 'xs' | 'sm' | 'md'

export interface CountryFlagProps {
  countryName?: string | null
  code?: string | null
  size?: CountryFlagSize
  showLabel?: boolean
  className?: string
  labelClassName?: string
  fallback?: 'globe' | 'text' | 'none'
}

const sizeClasses: Record<CountryFlagSize, string> = {
  xs: 'h-3.5',
  sm: 'h-4',
  md: 'h-5',
}

export function CountryFlag({
  countryName,
  code: codeProp,
  size = 'sm',
  showLabel = false,
  className,
  labelClassName,
  fallback = 'globe',
}: CountryFlagProps) {
  const [failed, setFailed] = useState(false)

  const resolvedCode = codeProp ? codeProp.trim().toLowerCase() : getCountryCode(countryName)

  const resolvedName =
    countryName || getCountryName(resolvedCode) || resolvedCode?.toUpperCase() || ''

  const isGlobal = resolvedCode === 'gl' || resolvedName.toLowerCase() === 'global'
  const hasFlag = resolvedCode && !isGlobal && !failed

  if (!resolvedName && !resolvedCode) return null

  const renderFallback = () => {
    if (fallback === 'none') {
      return showLabel ? <span className={labelClassName}>{resolvedName}</span> : null
    }
    if (fallback === 'text') {
      return <span className={labelClassName}>{resolvedName}</span>
    }
    return (
      <>
        <Globe className={cn('h-auto w-auto text-current', sizeClasses[size])} />
        {showLabel && <span className={labelClassName}>{resolvedName}</span>}
      </>
    )
  }

  return (
    <span
      className={cn('inline-flex items-center gap-1.5 align-text-bottom', className)}
      title={resolvedName}
    >
      {hasFlag ? (
        <img
          src={`/flags/${resolvedCode}.svg`}
          alt={resolvedName}
          className={cn('h-auto w-auto object-contain', sizeClasses[size])}
          onError={() => setFailed(true)}
        />
      ) : (
        renderFallback()
      )}
      {hasFlag && showLabel && <span className={labelClassName}>{resolvedName}</span>}
    </span>
  )
}
