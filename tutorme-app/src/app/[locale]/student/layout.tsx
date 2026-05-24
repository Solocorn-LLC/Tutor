'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
  FileText,
  Compass,
  UserCircle,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }> }

const navItems: NavItem[] = [
  { href: '/student/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/student/tutors', label: 'Book a Tutor', icon: Compass },
  { href: '/student/courses', label: 'Courses', icon: GraduationCap },
  { href: '/student/feedback', label: 'Live Classroom', icon: Video },
  { href: '/student/messages', label: 'Messages', icon: MessageSquare },
  { href: '/student/help', label: 'Support', icon: HelpCircle },
  { href: '/student/account', label: 'Account', icon: UserCircle },
]

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [desktopNavOpen, setDesktopNavOpen] = useState(true)

  const isLiveClassRoute = pathname.includes('/student/feedback')
  const isTutorDirectoryRoute = pathname.startsWith('/student/tutors')
  const isFeedbackRoute = pathname.includes('/student/feedback')
  const liveSessionId = ''
  const liveClassNavItems: NavItem[] = [
    {
      href: '/student/feedback',
      label: 'Live Classroom',
      icon: Video,
    },
    { href: '/student/assignments', label: 'Visible Tasks', icon: ClipboardList },
    { href: '/student/dashboard', label: 'Leave Class', icon: ArrowLeft },
  ]

  if (isTutorDirectoryRoute) {
    return (
      <div className="min-h-screen bg-white">
        <header className="sticky top-0 z-40 border-b bg-white">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
            <Link
              href="/student/dashboard"
              className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to dashboard
            </Link>
            <div className="flex items-center gap-3">
              <Link href="/student/notifications">
                <Button variant="ghost" size="icon" className="relative">
                  <Bell className="h-5 w-5" />
                  <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />
                </Button>
              </Link>
              <UserNav />
            </div>
          </div>
        </header>
        <main className="bg-white px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Left Navigation Sidebar - Desktop */}
      {!isFeedbackRoute && (
        <aside
          className={cn(
            'relative z-40 hidden h-screen shrink-0 flex-col transition-all duration-300 lg:flex',
            desktopNavOpen ? 'w-64' : 'w-0 overflow-hidden'
          )}
        >
          {/* Inner content wrapper with fixed width to prevent layout shifts when collapsing */}
          <div
            className={cn(
              'fixed bottom-4 left-4 top-4 z-40 hidden flex-col rounded-2xl bg-white shadow-[0_18px_60px_rgba(0,0,0,0.16)] ring-1 ring-black/5 transition-all duration-300 lg:flex',
              desktopNavOpen ? 'w-60' : 'w-0 overflow-hidden ring-0'
            )}
          >
            <div className="flex h-full w-60 flex-col">
              <div className="flex min-w-[240px] shrink-0 items-center justify-between p-4">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={e => {
                      e.stopPropagation()
                      setDesktopNavOpen(false)
                    }}
                    title="Hide Navigation"
                    className="text-gray-400"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <Link
                    href="/student/dashboard"
                    className="text-lg font-bold text-blue-600"
                    aria-label="Student dashboard"
                  ></Link>
                </div>
              </div>

              <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
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
                            <Icon className="h-5 w-5 flex-shrink-0" />
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
                        <Icon className="h-5 w-5 flex-shrink-0" />
                        <span className="text-sm font-medium">{item.label}</span>
                      </Link>
                    )
                  })
                )}
              </nav>

              <div className="shrink-0 space-y-2 p-4">
                <div className="pt-2">
                  <UserNav />
                </div>
              </div>
            </div>
          </div>
        </aside>
      )}

      {/* Floating collapsed pill */}
      {!isFeedbackRoute && !desktopNavOpen && (
        <div
          className="fixed left-0 top-1/2 z-50 hidden h-16 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-r-full border border-l-0 border-[#E5E7EB] bg-white shadow-[2px_0_8px_rgba(0,0,0,0.08)] transition-all hover:w-10 hover:bg-slate-50 lg:flex"
          onClick={() => setDesktopNavOpen(true)}
          title="Show navigation"
        >
          <ChevronRight className="h-5 w-5 text-[#2B5FB8]" />
        </div>
      )}

      {!isFeedbackRoute && (
        <>
          <div className="fixed left-4 top-4 z-50 flex items-center gap-2 lg:hidden">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="h-10 w-10 rounded-full bg-white shadow-[0_12px_30px_rgba(0,0,0,0.14)] ring-1 ring-black/5 hover:bg-slate-50"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
          <div className="fixed right-4 top-4 z-50 lg:hidden">
            <div className="rounded-full bg-white p-1 shadow-[0_12px_30px_rgba(0,0,0,0.14)] ring-1 ring-black/5">
              <UserNav />
            </div>
          </div>
        </>
      )}

      {/* Mobile Navigation Menu */}
      {!isFeedbackRoute && mobileMenuOpen && (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-white p-4 pt-20 lg:hidden">
          <nav className="space-y-3">
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
                        <Icon className="h-5 w-5" />
                        <span className="font-medium">{item.label}</span>
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
              })
            )}
          </nav>
        </div>
      )}

      {/* Main Content */}
      <main className={cn('h-screen flex-1 overflow-hidden', 'pt-4')}>
        <div className="h-full overflow-y-auto">{children}</div>
      </main>
    </div>
  )
}
