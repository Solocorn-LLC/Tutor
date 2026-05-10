'use client'

import { useState, useEffect, createContext, useContext } from 'react'
import { useRouter, usePathname, useParams } from 'next/navigation'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AdminSidebar } from '@/components/admin/layout/AdminSidebar'
import { AdminHeader } from '@/components/admin/layout/AdminHeader'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
})

interface AdminSession {
  adminId: string
  email: string
  name: string | null
  roles: string[]
  permissions: string[]
}

interface AdminContextType {
  session: AdminSession | null
  logout: () => Promise<void>
}

const AdminContext = createContext<AdminContextType | null>(null)

export function useAdminContext() {
  const context = useContext(AdminContext)
  if (!context) {
    throw new Error('useAdminContext must be used within AdminLayout')
  }
  return context
}

function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useParams<{ locale?: string }>()
  const localePrefix = params?.locale ? `/${params.locale}` : ''
  const adminLoginPath = `${localePrefix}/admin/login`
  const isPublicAdminRoute =
    pathname.endsWith('/admin/login') || pathname.endsWith('/admin/forgot-password')
  const isTopologyRoute = pathname.endsWith('/admin/topology')
  const [session, setSession] = useState<AdminSession | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    // Check session on mount
    const checkSession = async () => {
      try {
        const res = await fetch('/api/admin/auth/session', {
          credentials: 'include',
        })

        if (res.ok) {
          const data = await res.json()
          setSession(data.session)
        } else {
          setSession(null)
        }
      } catch (error) {
        console.error('Session check failed:', error)
        setSession(null)
      } finally {
        setIsLoading(false)
      }
    }

    checkSession()
  }, [])

  useEffect(() => {
    // Redirect to login only when on a protected page without session
    if (!isLoading && !session && !isPublicAdminRoute) {
      router.replace(adminLoginPath)
    }
  }, [isLoading, session, isPublicAdminRoute, router, adminLoginPath])

  const logout = async () => {
    try {
      await fetch('/api/admin/auth/logout', {
        method: 'POST',
        credentials: 'include',
      })
    } catch (error) {
      console.error('Logout error:', error)
    }
    setSession(null)
    router.push(adminLoginPath)
  }

  const isAuthReady = !isLoading && session

  return (
    <AdminContext.Provider value={{ session, logout }}>
      <div className="min-h-screen bg-slate-50">
        {isAuthReady && (
          <>
            <AdminSidebar
              collapsed={sidebarCollapsed}
              onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
            />
            <AdminHeader collapsed={sidebarCollapsed} />
          </>
        )}
        <main
          className={cn(
            'pt-16 transition-all duration-300',
            isTopologyRoute ? 'fixed inset-0 pt-16' : '',
            isTopologyRoute ? 'ml-0' : sidebarCollapsed ? 'ml-16' : 'ml-64',
            isTopologyRoute ? (sidebarCollapsed ? 'left-16' : 'left-64') : 'left-0',
            !isAuthReady && 'ml-0'
          )}
        >
          <div className={cn(isTopologyRoute ? 'h-full w-full bg-slate-950 p-0' : 'p-6')}>
            {isAuthReady ? (
              children
            ) : (
              <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
              </div>
            )}
          </div>
        </main>
      </div>
    </AdminContext.Provider>
  )
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AdminLayoutContent>{children}</AdminLayoutContent>
    </QueryClientProvider>
  )
}
