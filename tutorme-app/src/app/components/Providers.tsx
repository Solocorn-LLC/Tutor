'use client'

import { ReactNode, useEffect, useState } from 'react'
import { NextIntlClientProvider } from 'next-intl'
import { SessionProvider } from 'next-auth/react'

interface ProvidersProps {
  children: ReactNode
  locale: string
  messages: Record<string, unknown>
}

function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

export function Providers({ children, locale, messages }: ProvidersProps) {
  const [timeZone, setTimeZone] = useState('UTC')

  useEffect(() => {
    // First try to get from localStorage (if user has set a preference)
    const stored = localStorage.getItem('user-timezone')
    if (stored) {
      setTimeZone(stored)
      return
    }

    // Fall back to browser detection
    setTimeZone(getBrowserTimezone())
  }, [])

  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone}>
      <SessionProvider refetchInterval={0} refetchOnWindowFocus={false}>
        {children}
      </SessionProvider>
    </NextIntlClientProvider>
  )
}
