'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useRealmSession } from '@/hooks/use-realm-session'
import { Button } from '@/components/ui/button'
import { UserNav } from '@/components/user-nav'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import {
  LayoutDashboard,
  BarChart3,
  MessageSquare,
  Settings,
  Wrench,
  Menu,
  X,
  HelpCircle,
  Globe,
  PanelLeftClose,
  PanelLeftOpen,
  ClipboardCheck,
  LogOut,
  User,
  FileText,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { routing } from '@/i18n/routing'

type NavItem = {
  href: string
  label: string
  icon: typeof LayoutDashboard
  inactive?: boolean
  iconColor: string
}

// Main Navigation - Flat list (no groups)
const navItems: NavItem[] = [
  {
    href: '/tutor/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    iconColor: 'text-[#2563EB]',
  },
  { href: '/tutor/my-page', label: 'My Page', icon: Globe, iconColor: 'text-[#7C3AED]' },
  { href: '/tutor/insights', label: 'Course Builder', icon: Wrench, iconColor: 'text-[#EA580C]' },
  {
    href: '/tutor/communications',
    label: 'Communications',
    icon: MessageSquare,
    iconColor: 'text-[#EC4899]',
  },
  {
    href: '/tutor/submissions',
    label: 'Grading',
    icon: ClipboardCheck,
    iconColor: 'text-[#16A34A]',
  },
  { href: '/tutor/reports', label: 'Analytics', icon: BarChart3, iconColor: 'text-[#F59E0B]' },
  { href: '/tutor/support', label: 'Support', icon: HelpCircle, iconColor: 'text-[#8B5CF6]' },

  // Whiteboard audit links
]

const bottomNavItems: NavItem[] = [
  { href: '/tutor/settings', label: 'Account', icon: User, iconColor: 'text-[#64748B]' },
]

export default function TutorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { data: session, status } = useSession()
  const { data: realmSession, status: realmStatus } = useRealmSession('tutor')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isPeeking, setIsPeeking] = useState(false)
  const localePrefix = useMemo(() => {
    const segments = pathname?.split('/').filter(Boolean) ?? []
    const first = segments[0]
    return first && routing.locales.includes(first as (typeof routing.locales)[number])
      ? `/${first}`
      : ''
  }, [pathname])

  // Compute isMyPage and isReportsPage before useState so SSR/CSR initial state matches (prevents hydration mismatch)
  const isMyPage =
    pathname === `${localePrefix}/tutor/my-page` ||
    pathname?.startsWith(`${localePrefix}/tutor/my-page/`) ||
    /\/tutor\/my-page(\/|$)/.test(pathname || '')
  const isReportsPage = pathname?.includes('/tutor/reports')
  const isDashboardPage = pathname?.includes('/tutor/dashboard')
  const isCommunicationsPage = pathname?.includes('/tutor/communications')
  const isSubmissionsPage = pathname?.includes('/tutor/submissions')
  const isAccountPage = pathname?.includes('/tutor/settings')
  const isSupportPage = pathname?.includes('/tutor/support') || pathname?.includes('/tutor/help')
  const isGroupSessionsPage = pathname?.includes('/tutor/group-sessions')

  // Use a robust pathname check for insights page detection that works across
  // SSR and client-side hydration, handling both prefixed and non-prefixed paths.
  // With next-intl localePrefix: 'as-needed', the pathname may include the locale
  // segment during SSR (e.g., /en/tutor/insights) but not on the client.
  const isInsightsPage =
    pathname === '/tutor/insights' ||
    pathname?.startsWith('/tutor/insights/') ||
    pathname?.endsWith('/tutor/insights') ||
    pathname?.includes('/tutor/insights/') ||
    /\/tutor\/insights(\/|$)/.test(pathname || '')

  const isFloatingPage =
    isDashboardPage ||
    isReportsPage ||
    isCommunicationsPage ||
    isSubmissionsPage ||
    isAccountPage ||
    isMyPage ||
    isSupportPage ||
    isGroupSessionsPage ||
    isInsightsPage
  const [desktopNavOpen, setDesktopNavOpen] = useState(
    !isMyPage &&
      !isReportsPage &&
      !isAccountPage &&
      !isSupportPage &&
      !isCommunicationsPage &&
      !isSubmissionsPage
  )

  // Use realm session (tutor tab) first; only redirect if we don't have a tutor session and default session is another role
  useEffect(() => {
    const realmRole = (realmSession?.user as { role?: string })?.role ?? ''
    const defaultRole = (session?.user as { role?: string })?.role ?? ''
    const isTutorRealm = realmRole.toUpperCase() === 'TUTOR'
    const isTutorDefault = defaultRole.toUpperCase() === 'TUTOR'
    if (realmStatus === 'loading' && status === 'loading') return
    if (isTutorRealm) return
    if (!isTutorRealm && isTutorDefault) return
    const role = defaultRole || realmRole
    if (role && role.toUpperCase() !== 'TUTOR') {
      if (role.toUpperCase() === 'STUDENT') router.replace('/student/dashboard')
      else if (role.toUpperCase() === 'PARENT') router.replace('/parent/dashboard')
      else if (role.toUpperCase() === 'ADMIN') router.replace('/admin')
      else router.replace('/')
    }
  }, [realmStatus, realmSession?.user, status, session?.user, router])

  // Check if we're on the Course Builder page - if so, don't render the tutor nav
  // The Course Builder has its own layout
  const isCourseBuilder = pathname?.includes('/courses/') && pathname?.includes('/builder')

  // Check if we're on the Course Publish page (course detail page) - hide sidebar for focused editing
  // Pattern: /tutor/courses/[id] or /:locale/tutor/courses/[id] but not sub-paths like /tasks or /enrollments
  const isCoursePublishPage = pathname?.match(/^(\/[^\/]+)?\/tutor\/courses\/[^\/]+$/) !== null

  // Auto-close on My Page, Reports, Account Settings, and Support; auto-open elsewhere
  useEffect(() => {
    setDesktopNavOpen(
      !isMyPage &&
        !isReportsPage &&
        !isAccountPage &&
        !isSupportPage &&
        !isCommunicationsPage &&
        !isSubmissionsPage
    )
  }, [
    isMyPage,
    isReportsPage,
    isAccountPage,
    isSupportPage,
    isCommunicationsPage,
    isSubmissionsPage,
  ])
  // Periodic peek animation for sidebar toggle
  useEffect(() => {
    const interval = setInterval(() => {
      setIsPeeking(true)
      setTimeout(() => setIsPeeking(false), 600)
    }, 8000)
    return () => clearInterval(interval)
  }, [])

  // Force insights pages and classroom pages to have no nav and no wrapper
  // Use a robust check that handles locale-prefixed paths during SSR
  const isInsightsPageForce = pathname?.includes('/tutor/insights')
  // Also check for classroom paths in case redirect hasn't completed
  const isClassroomPage = pathname?.includes('/tutor/classroom')
  // Check for classroom view mode via search params as a fallback
  const isClassroomView = searchParams?.get('view') === 'classroom'

  if (
    isCourseBuilder ||
    isInsightsPage ||
    isInsightsPageForce ||
    isClassroomPage ||
    isClassroomView
  ) {
    return <div className="isolate flex h-screen w-full overflow-hidden bg-white">{children}</div>
  }

  // Course Publish/Details page needs scrollable content, not fixed height
  if (isCoursePublishPage) {
    return <div className="isolate min-h-screen w-full bg-white">{children}</div>
  }

  return (
    <div className="isolate flex h-screen overflow-hidden bg-white">
      {/* Visual sidebar — fixed overlay, animates with transform only */}
      <aside
        className={cn(
          'z-fixed fixed left-0 top-0 hidden h-screen lg:flex',
          desktopNavOpen ? 'pointer-events-auto' : 'pointer-events-none'
        )}
      >
        <div
          className={cn(
            'm-4 flex h-[calc(100%-2rem)] w-60 flex-col rounded-2xl bg-white shadow-[0_18px_60px_rgba(0,0,0,0.16)] ring-1 ring-black/5 transition-all duration-500 ease-in-out',
            desktopNavOpen
              ? 'pointer-events-auto translate-x-0 opacity-100'
              : 'pointer-events-none -translate-x-[calc(100%+1rem)] opacity-0'
          )}
        >
          <div className="flex h-full w-60 flex-col">
            <div className="flex min-w-[240px] shrink-0 items-center justify-between px-4 py-2">
              <div className="flex items-center gap-2">
                <Link href="/tutor/dashboard" className="text-xl font-bold text-blue-600"></Link>
              </div>
              <div className="flex items-center gap-2">
                <div onClick={e => e.stopPropagation()}>
                  <NotificationBell viewAllHref="/tutor/communications" />
                </div>
              </div>
            </div>

            <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-4 pt-2">
              {navItems.map(item => {
                const Icon = item.icon
                const href =
                  item.href === '/tutor/insights'
                    ? `${localePrefix}/tutor/insights?mode=edit`
                    : item.href
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                return (
                  <Link
                    key={`${item.href}-${item.label}`}
                    href={href}
                    onClick={e => e.stopPropagation()}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors',
                      item.inactive && 'pointer-events-none opacity-50',
                      isActive
                        ? 'bg-blue-50 font-medium text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    )}
                  >
                    <Icon className={cn('h-5 w-5 flex-shrink-0', item.iconColor)} />
                    <span className="text-sm font-medium">{item.label}</span>
                  </Link>
                )
              })}
            </nav>

            <div className="shrink-0 space-y-1 px-4 pb-4">
              {bottomNavItems.map(item => {
                const Icon = item.icon
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                return (
                  <Link
                    key={`${item.href}-${item.label}`}
                    href={item.href}
                    onClick={e => e.stopPropagation()}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                      isActive
                        ? 'bg-blue-50 font-medium text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    )}
                  >
                    <Icon className={cn('h-5 w-5 flex-shrink-0', item.iconColor)} />
                    <span className="font-medium">{item.label}</span>
                  </Link>
                )
              })}
              <button
                onClick={e => {
                  e.stopPropagation()
                  signOut({ callbackUrl: '/' })
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
              >
                <LogOut className="h-5 w-5 flex-shrink-0 text-[#EF4444]" />
                <span className="font-medium">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Floating collapsed/expanded pill */}
      <div
        className={cn(
          'fixed top-1/2 z-[400] hidden h-16 -translate-y-1/2 cursor-pointer items-center justify-center rounded-r-full border border-l-0 shadow-[2px_0_8px_rgba(0,0,0,0.08)] transition-all duration-500 ease-in-out hover:w-10 lg:flex',
          desktopNavOpen ? 'left-64' : 'left-0',
          desktopNavOpen
            ? 'border-[#E5E7EB] bg-white'
            : 'border-[#1D4ED8]/30 bg-[linear-gradient(135deg,#0B3A9B_0%,#1D4ED8_35%,#0A2F78_100%)]',
          isPeeking ? 'w-10' : 'w-8'
        )}
        onClick={() => setDesktopNavOpen(!desktopNavOpen)}
        title={desktopNavOpen ? 'Hide navigation' : 'Show navigation'}
      >
        {desktopNavOpen ? (
          <ChevronLeft
            className={cn('h-5 w-5', desktopNavOpen ? 'text-[#2B5FB8]' : 'text-white')}
          />
        ) : (
          <ChevronRight
            className={cn('h-5 w-5', desktopNavOpen ? 'text-[#2B5FB8]' : 'text-white')}
          />
        )}
      </div>

      {/* Mobile Navigation Header */}
      <div className="fixed left-0 right-0 top-0 z-50 border-b bg-white lg:hidden">
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <Link href="/tutor/dashboard" className="text-xl font-bold text-blue-600"></Link>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/tutor/settings">
              <Button variant="ghost" size="icon">
                <Settings className="h-5 w-5" />
              </Button>
            </Link>
            <UserNav />
          </div>
        </div>
      </div>

      {/* Mobile Navigation Menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 top-16 z-40 overflow-y-auto bg-white p-4 lg:hidden">
          <nav className="space-y-0.5">
            {navItems.map(item => {
              const Icon = item.icon
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
              return (
                <Link
                  key={`${item.href}-${item.label}`}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-3 transition-colors',
                    isActive
                      ? 'bg-blue-50 font-medium text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100'
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{item.label}</span>
                </Link>
              )
            })}
          </nav>
        </div>
      )}

      {/* Main Content */}
      <main
        className={cn(
          'relative z-0 h-screen flex-1 overflow-hidden pt-16',
          'transition-[margin] duration-500 ease-in-out lg:my-4 lg:h-[calc(100vh-2rem)] lg:w-[calc(100%-17rem)]',
          desktopNavOpen ? 'lg:ml-64 lg:mr-4' : 'lg:ml-[8.5rem] lg:mr-[8.5rem]',
          isFloatingPage && 'lg:pt-0',
          !isFloatingPage &&
            'lg:rounded-2xl lg:bg-white lg:pt-4 lg:shadow-[0_18px_60px_rgba(0,0,0,0.16)] lg:ring-1 lg:ring-black/5'
        )}
      >
        <div className="scrollbar-hide h-full overflow-y-auto [&>*:last-child]:mb-0 [&>*:last-child]:pb-0">
          {children}
        </div>
      </main>
    </div>
  )
}
