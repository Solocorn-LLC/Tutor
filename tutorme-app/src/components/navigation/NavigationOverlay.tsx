'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// ============================================
// NAVIGATION OVERLAY CONTEXT
// ============================================

type NavigationOverlayContextValue = {
  showOverlay: () => void
  hideOverlay: () => void
  isVisible: boolean
}

const NavigationOverlayContext = React.createContext<NavigationOverlayContextValue | null>(null)

export function useNavigationOverlay() {
  const context = React.useContext(NavigationOverlayContext)
  if (!context) {
    throw new Error('useNavigationOverlay must be used within a NavigationOverlayProvider')
  }
  return context
}

// ============================================
// NAVIGATION OVERLAY PROVIDER
// ============================================

export function NavigationOverlayProvider({ children }: { children: React.ReactNode }) {
  const [isVisible, setIsVisible] = React.useState(false)
  const pathname = usePathname()
  const prevPathnameRef = React.useRef(pathname)

  const showOverlay = React.useCallback(() => {
    setIsVisible(true)
  }, [])

  const hideOverlay = React.useCallback(() => {
    setIsVisible(false)
  }, [])

  // Auto-hide overlay when pathname changes (navigation completed)
  // We use a small delay to ensure the new page has started rendering
  React.useEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname
      const timer = setTimeout(() => {
        setIsVisible(false)
      }, 400)
      return () => clearTimeout(timer)
    }
  }, [pathname])

  return (
    <NavigationOverlayContext.Provider value={{ showOverlay, hideOverlay, isVisible }}>
      {children}
      <NavigationOverlay isVisible={isVisible} />
    </NavigationOverlayContext.Provider>
  )
}

// ============================================
// NAVIGATION OVERLAY UI
// ============================================

function NavigationOverlay({ isVisible }: { isVisible: boolean }) {
  return (
    <div
      className={cn(
        'fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-300',
        isVisible ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
      )}
      style={{ background: '#ffffff' }}
      aria-hidden={!isVisible}
    >
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-[#0057ff]" />
        <span className="text-sm font-medium text-slate-600">Loading...</span>
      </div>
    </div>
  )
}
