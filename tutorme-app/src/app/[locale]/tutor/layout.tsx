'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { useEffect, useMemo } from 'react'
import { useRealmSession } from '@/hooks/use-realm-session'
import { Button } from '@/components/ui/button'
import { UserNav } from '@/components/user-nav'
import {
  LayoutDashboard,
  BarChart3,
  MessageSquare,
  Settings,
  Lightbulb,
  Menu,
  X,
  Bell,
  HelpCircle,
  Globe,
  PanelLeftClose,
  PanelLeftOpen,
  GraduationCap,
  LogOut,
  User,
  FileText,
  ChevronRight,
  ChevronLeft,
  Video,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { routing } from '@/i18n/routing'

type NavItem = {
  href: string
  label: string
  icon: typeof LayoutDashboard
  inactive?: boolean
}

// Main Navigation - Flat list (no groups)
const navItems: NavItem[] = [
  { href: '/tutor/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/tutor/my-page', label: 'My Page', icon: Globe },
  { href: '/tutor/insights', label: 'Course Builder', icon: Lightbulb },
  { href: '/tutor/classes', label: 'Live Sessions', icon: Video },
  { href: '/tutor/messages', label: 'Messages', icon: MessageSquare },
  { href: '/tutor/reports', label: 'Analytics', icon: BarChart3 },
  { href: '/tutor/training', label: 'Training', icon: GraduationCap },
  { href: '/tutor/support', label: 'Support', icon: HelpCircle },

  // Whiteboard audit links
]

const bottomNavItems = [{ href: '/tutor/settings', label: 'Account', icon: User }]

export default function TutorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session, status } = useSession()
  const { data: realmSession, status: realmStatus } = useRealmSession('tutor')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [desktopNavOpen, setDesktopNavOpen] = useState(() => {
    // Initialize based on current path to prevent sidebar flash on My Page
    const path = typeof window !== 'undefined' ? window.location.pathname : ''
    return !(path === '/tutor/my-page' || path.startsWith('/tutor/my-page/'))
  })
  const localePrefix = useMemo(() => {
    const segments = pathname?.split('/').filter(Boolean) ?? []
    const first = segments[0]
    return first && routing.locales.includes(first as (typeof routing.locales)[number])
      ? `/${first}`
      : ''
  }, [pathname])

  // Scope scrollbar-gutter override to tutor pages (nested scroll containers, not html)
  useEffect(() => {
    document.documentElement.classList.add('tutor-scroll-layout')
    return () => document.documentElement.classList.remove('tutor-scroll-layout')
  }, [])

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
  // Pattern: /tutor/courses/[id] but not sub-paths like /tasks or /enrollments
  const isCoursePublishPage = pathname?.match(/^\/tutor\/courses\/[^\/]+$/) !== null

  // Check if we're on My Page - hide sidebar and show back button instead
  const isMyPage = pathname === '/tutor/my-page' || pathname?.startsWith('/tutor/my-page/')

  // Insights page has its own layout with course builder integrated
  const isInsightsPage = pathname === '/tutor/insights' || pathname?.startsWith('/tutor/insights/')

  const isAccountPage = pathname === '/tutor/settings' || pathname?.startsWith('/tutor/settings/')

  const isReportsPage = pathname === '/tutor/reports' || pathname?.startsWith('/tutor/reports/')

  const isDashboard = pathname === `${localePrefix}/tutor/dashboard`

  useEffect(() => {
    if (isMyPage) {
      setDesktopNavOpen(false)
    } else {
      setDesktopNavOpen(true)
    }
  }, [isMyPage])

  if (isCourseBuilder || isCoursePublishPage || isInsightsPage || isAccountPage || isReportsPage) {
    return <>{children}</>
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 isolate">
      {/* Left Navigation Sidebar - Desktop */}
      <aside
        className={cn(
          'relative hidden h-screen shrink-0 flex-col transition-all duration-300 lg:flex',
          desktopNavOpen ? 'w-64' : 'w-0 overflow-hidden'
        )}
      >
        <div
          className={cn(
            'fixed bottom-4 left-4 top-4 z-fixed hidden flex-col rounded-2xl bg-white shadow-[0_18px_60px_rgba(0,0,0,0.16)] ring-1 ring-black/5 transition-all duration-300 lg:flex transform-gpu',
            desktopNavOpen ? 'w-60' : 'w-0 overflow-hidden ring-0'
          )}
        >
          <div className="flex h-full w-60 flex-col">
            <div className="flex min-w-[240px] shrink-0 items-center justify-between px-4 py-2">
              <div className="flex items-center gap-2">
                <Link href="/tutor/dashboard" className="text-xl font-bold text-blue-600"></Link>
              </div>
              <div className="flex items-center gap-2">
                <Link href="/tutor/notifications" onClick={e => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-5 w-5" />
                    <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />
                  </Button>
                </Link>
              </div>
            </div>

            <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pt-2 pb-4">
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
                    <Icon className="h-5 w-5 flex-shrink-0" />
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
                    <Icon className="h-5 w-5 flex-shrink-0" />
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
                <LogOut className="h-5 w-5 flex-shrink-0" />
                <span className="font-medium">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Floating collapsed/expanded pill */}
      <div
        className={cn(
          'fixed top-1/2 z-fixed hidden h-16 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-r-full border border-l-0 border-[#E5E7EB] bg-white shadow-[2px_0_8px_rgba(0,0,0,0.08)] transition-all duration-300 hover:w-10 hover:bg-slate-50 lg:flex',
          desktopNavOpen ? 'left-64' : 'left-0'
        )}
        onClick={() => setDesktopNavOpen(!desktopNavOpen)}
        title={desktopNavOpen ? 'Hide navigation' : 'Show navigation'}
      >
        {desktopNavOpen ? (
          <ChevronLeft className="h-5 w-5 text-[#2B5FB8]" />
        ) : (
          <ChevronRight className="h-5 w-5 text-[#2B5FB8]" />
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
      <main className="relative z-0 h-screen flex-1 overflow-hidden pt-16 lg:pt-4 lg:pb-4">
        <div className={cn('h-full overflow-y-auto', isDashboard && 'tutor-dashboard-scroll', isMyPage && 'tutor-mypage-scroll')}>{children}</div>
      </main>
    </div>
  )
}
