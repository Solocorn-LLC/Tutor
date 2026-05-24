'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { ReactNode } from 'react'

interface GlassCardProps {
  children: ReactNode
  title?: string
  icon?: React.ComponentType<{ className?: string }>
  className?: string
  headerClassName?: string
  gradient?: 'purple' | 'blue' | 'green' | 'orange' | 'pink' | 'none'
  badge?: string | number
  action?: ReactNode
}

export function GlassCard({
  children,
  title,
  icon: Icon,
  className,
  headerClassName,
  gradient = 'none',
  badge,
  action,
}: GlassCardProps) {
  return (
    <Card
      className={cn(
        'overflow-hidden rounded-[18px] border border-white/10 bg-[#1e3a5f] shadow-[0_8px_24px_rgba(0,0,0,0.10)]',
        className
      )}
    >
      {title && (
        <CardHeader className={cn('pb-3', headerClassName)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {Icon && (
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-lg',
                    gradient === 'purple'
                      ? 'bg-white/10 text-purple-300'
                      : gradient === 'blue'
                        ? 'bg-white/10 text-blue-300'
                        : gradient === 'green'
                          ? 'bg-white/10 text-emerald-300'
                          : gradient === 'orange'
                            ? 'bg-white/10 text-orange-300'
                            : gradient === 'pink'
                              ? 'bg-white/10 text-pink-300'
                              : 'bg-white/10 text-white/80'
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
              )}
              <CardTitle className="text-base font-semibold text-white">{title}</CardTitle>
              {badge !== undefined && (
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-medium',
                    gradient === 'purple'
                      ? 'bg-white/10 text-purple-300'
                      : gradient === 'blue'
                        ? 'bg-white/10 text-blue-300'
                        : gradient === 'green'
                          ? 'bg-white/10 text-emerald-300'
                          : gradient === 'orange'
                            ? 'bg-white/10 text-orange-300'
                            : gradient === 'pink'
                              ? 'bg-white/10 text-pink-300'
                              : 'bg-white/10 text-white/80'
                  )}
                >
                  {badge}
                </span>
              )}
            </div>
            {action && <div>{action}</div>}
          </div>
        </CardHeader>
      )}
      <CardContent className={cn('pt-0', !title && 'pt-6')}>{children}</CardContent>
    </Card>
  )
}
