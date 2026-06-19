'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { UserNav } from '@/components/user-nav'
import {
  LayoutDashboard,
  GraduationCap,
  ClipboardList,
  MessageSquare,
  HelpCircle,
  Menu,
  X,
  Video,
  Bell,
  ArrowLeft,
  CalendarDays,
  User,
  ChevronRight,
  ChevronLeft,
  LogOut,
  Settings,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { StudentNavProvider } from './StudentNavContext'

type NavItem = {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  iconColor: string
}

const navItems: NavItem[] = [
  {
    href: '/student/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    iconColor: 'text-[#2563EB]',
  },
  {
    href: '/student/tutors',
    label: 'Book a Tutor',
    icon: CalendarDays,
    iconColor: 'text-[#7C3AED]',
  },
  { href: '/student/courses', label: 'Courses', icon: GraduationCap, iconColor: 'text-[#06B6D4]' },
  { href: '/student/feedback', label: 'Classroom', icon: Video, iconColor: 'text-[#16A34A]' },
  {
    href: '/student/communications',
    label: 'Communications',
    icon: MessageSquare,
    iconColor: 'text-[#EC4899]',
  },
  { href: '/student/help', label: 'Support', icon: HelpCircle, iconColor: 'text-[#8B5CF6]' },
]

const bottomNavItems: NavItem[] = [
  { href: '/student/account', label: 'Account', icon: User, iconColor: 'text-[#64748B]' },
]

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const isLiveClassRoute = pathname.includes('/student/feedback')
  const isFeedbackRoute = pathname.includes('/student/feedback')
  const isSupportPage = pathname?.includes('/student/help')
  const isAccountPage = pathname?.includes('/student/account')
  const isBookTutorPage = pathname?.includes('/student/tutors')
  const isCommunicationsPage = pathname?.includes('/student/communications')
  const isCoursesPage = pathname?.includes('/student/courses')
  const isDashboardPage = pathname?.includes('/student/dashboard')
  const isFloatingPage =
    isDashboardPage ||
    isBookTutorPage ||
    isCoursesPage ||
    isCommunicationsPage ||
    isAccountPage ||
    isSupportPage
  const isNavClosedPage =
    isSupportPage ||
    isFeedbackRoute ||
    isAccountPage ||
    isBookTutorPage ||
    isCommunicationsPage ||
    isCoursesPage
  const [desktopNavOpen, setDesktopNavOpen] = useState(!isNavClosedPage)
  const [isPeeking, setIsPeeking] = useState(false)

  useEffect(() => {
    const peekInterval = setInterval(() => {
      setIsPeeking(true)
      setTimeout(() => setIsPeeking(false), 600)
    }, 8000)
    return () => clearInterval(peekInterval)
  }, [])

  // Auto-close on Support, Account, Book a Tutor, Courses, Communications, and Live Classroom/Feedback
  useEffect(() => {
    setDesktopNavOpen(!isNavClosedPage)
  }, [isNavClosedPage])
  const liveSessionId = ''
  const liveClassNavItems: NavItem[] = [
    {
      href: '/student/feedback',
      label: 'Live Classroom',
      icon: Video,
      iconColor: 'text-[#16A34A]',
    },
    {
      href: '/student/assignments',
      label: 'Visible Tasks',
      icon: ClipboardList,
      iconColor: 'text-[#F59E0B]',
    },
    {
      href: '/student/dashboard',
      label: 'Leave Class',
      icon: ArrowLeft,
      iconColor: 'text-[#64748B]',
    },
  ]

  return (
    <div className="isolate flex h-screen overflow-hidden bg-white">
      {/* Visual sidebar — fixed overlay, animates with transform only */}
      {!isFeedbackRoute && (
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
                  <Link
                    href="/student/dashboard"
                    className="text-lg font-bold text-blue-600"
                    aria-label="Student dashboard"
                  ></Link>
                </div>
                <div className="flex items-center gap-2">
                  <Link href="/student/communications" onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="relative">
                      <Bell className="h-5 w-5" />
                      <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />
                    </Button>
                  </Link>
                </div>
              </div>

              <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-4 pt-2">
                {isLiveClassRoute ? (
                  <div>
                    <p className="mb-1.5 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                      Live Session
                    </p>
                    <div className="space-y-0.5">
                      {liveClassNavItems.map(item => {
                        const Icon = item.icon
                        const isActive =
                          pathname === item.href || pathname.startsWith(item.href + '/')
                        return (
                          <Link
                            key={`${item.label}:${item.href}`}
                            href={item.href}
                            onClick={e => e.stopPropagation()}
                            className={cn(
                              'flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors',
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
                    </div>
                  </div>
                ) : (
                  navItems.map(item => {
                    const Icon = item.icon
                    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={e => e.stopPropagation()}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors',
                          isActive
                            ? 'bg-blue-50 font-medium text-blue-700'
                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                        )}
                      >
                        <Icon className={cn('h-5 w-5 flex-shrink-0', item.iconColor)} />
                        <span className="text-sm font-medium">{item.label}</span>
                      </Link>
                    )
                  })
                )}
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
      )}

      {/* Floating collapsed/expanded pill */}
      {!isFeedbackRoute && (
        <div
          className={cn(
            'fixed top-1/2 z-[400] hidden h-16 -translate-y-1/2 cursor-pointer items-center justify-center rounded-r-full border border-l-0 shadow-[2px_0_8px_rgba(0,0,0,0.08)] transition-all duration-500 ease-in-out hover:w-10 lg:flex',
            desktopNavOpen ? 'left-64' : 'left-0',
            desktopNavOpen
              ? 'border-[#E5E7EB] bg-white'
              : 'border-white/20 bg-gradient-to-br from-[#F97316] to-[#EA580C]',
            isPeeking ? 'w-10' : 'w-8'
          )}
          onClick={() => setDesktopNavOpen(!desktopNavOpen)}
          title={desktopNavOpen ? 'Hide navigation' : 'Show navigation'}
        >
          {desktopNavOpen ? (
            <ChevronLeft className="h-5 w-5 text-[#2B5FB8]" />
          ) : (
            <ChevronRight className="h-5 w-5 text-white" />
          )}
        </div>
      )}

      {/* Mobile Navigation Header */}
      {!isFeedbackRoute && (
        <div className="fixed left-0 right-0 top-0 z-50 border-b bg-white lg:hidden">
          <div className="flex h-16 items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
              <Link href="/student/dashboard" className="text-xl font-bold text-blue-600"></Link>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/student/account">
                <Button variant="ghost" size="icon">
                  <Settings className="h-5 w-5" />
                </Button>
              </Link>
              <UserNav />
            </div>
          </div>
        </div>
      )}

      {/* Mobile Navigation Menu */}
      {!isFeedbackRoute && mobileMenuOpen && (
        <div className="fixed inset-0 top-16 z-40 overflow-y-auto bg-white p-4 lg:hidden">
          <nav className="space-y-0.5">
            {isLiveClassRoute ? (
              <div>
                <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Live Session
                </p>
                <div className="space-y-0.5">
                  {liveClassNavItems.map(item => {
                    const Icon = item.icon
                    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                    return (
                      <Link
                        key={`${item.label}:${item.href}`}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-3 py-3 transition-colors',
                          isActive
                            ? 'bg-blue-50 font-medium text-blue-700'
                            : 'text-gray-600 hover:bg-gray-100'
                        )}
                      >
                        <Icon className={cn('h-5 w-5', item.iconColor)} />
                        <span className="font-medium">{item.label}</span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            ) : (
              <>
                {navItems.map(item => {
                  const Icon = item.icon
                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-3 transition-colors',
                        isActive
                          ? 'bg-blue-50 font-medium text-blue-700'
                          : 'text-gray-600 hover:bg-gray-100'
                      )}
                    >
                      <Icon className={cn('h-5 w-5', item.iconColor)} />
                      <span className="font-medium">{item.label}</span>
                    </Link>
                  )
                })}
                <div className="mt-2 border-t border-gray-100 pt-2">
                  {bottomNavItems.map(item => {
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
                        <Icon className={cn('h-5 w-5', item.iconColor)} />
                        <span className="font-medium">{item.label}</span>
                      </Link>
                    )
                  })}
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false)
                      signOut({ callbackUrl: '/' })
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-gray-600 transition-colors hover:bg-gray-100"
                  >
                    <LogOut className="h-5 w-5 text-[#EF4444]" />
                    <span className="font-medium">Logout</span>
                  </button>
                </div>
              </>
            )}
          </nav>
        </div>
      )}

      {/* Main Content */}
      <main
        className={cn(
          'relative z-0 h-screen flex-1 overflow-hidden',
          !isFeedbackRoute && [
            'pt-16 transition-[margin] duration-500 ease-in-out lg:my-4 lg:h-[calc(100vh-2rem)] lg:w-[calc(100%-17rem)]',
            desktopNavOpen ? 'lg:ml-64 lg:mr-4' : 'lg:ml-[8.5rem] lg:mr-[8.5rem]',
            isFloatingPage && 'lg:pt-0',
            !isFloatingPage &&
              'lg:rounded-2xl lg:bg-white lg:pt-4 lg:shadow-[0_18px_60px_rgba(0,0,0,0.16)] lg:ring-1 lg:ring-black/5',
          ]
        )}
      >
        <div
          className={cn(
            'scrollbar-hide h-full [&>*:last-child]:mb-0 [&>*:last-child]:pb-0',
            isFeedbackRoute ? 'overflow-hidden' : 'overflow-y-auto'
          )}
        >
          <StudentNavProvider desktopNavOpen={desktopNavOpen}>{children}</StudentNavProvider>
        </div>
      </main>
    </div>
  )
}
