import { setRequestLocale } from 'next-intl/server'
import { hasLocale } from 'next-intl'
import { notFound } from 'next/navigation'
import { routing } from '@/lib/i18n/config'
import { ThemeProvider } from '@/components/ui/theme-provider'
import { Toaster } from 'sonner'
import { PWAInstallPrompt } from '@/components/pwa/PWAInstallPrompt'
import { FloatingVideoOverlay } from '@/components/class/floating-video-overlay'
import { SessionLauncher } from '@/components/one-on-one/session-launcher'
import { NavigationOverlayProvider } from '@/components/navigation/NavigationOverlay'

type Props = {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}

export function generateStaticParams() {
  return routing.locales.map(locale => ({ locale }))
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params

  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }

  setRequestLocale(locale)

  return (
    <ThemeProvider defaultTheme="aura" defaultMode="system">
      <NavigationOverlayProvider>{children}</NavigationOverlayProvider>
      <FloatingVideoOverlay />
      <SessionLauncher />
      <PWAInstallPrompt />
      <Toaster position="top-right" />
    </ThemeProvider>
  )
}
