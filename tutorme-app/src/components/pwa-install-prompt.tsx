'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

const DISMISS_KEY = 'tutorme-pwa-prompt-dismissed'

export function PWAInstallPrompt() {
  const [show, setShow] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<{
    prompt: () => Promise<{ outcome: string }>
  } | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Service worker registration failed - PWA features unavailable
    })
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (localStorage.getItem(DISMISS_KEY)) return

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as unknown as { prompt: () => Promise<{ outcome: string }> })
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    setShow(false)
    setDeferredPrompt(null)
    localStorage.setItem(DISMISS_KEY, '1')
  }

  const handleDismiss = () => {
    setShow(false)
    localStorage.setItem(DISMISS_KEY, '1')
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="bg-background fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-lg border p-4 shadow-lg sm:left-auto sm:right-4"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-foreground text-sm">将 Solocorn 添加到主屏幕，离线也能使用。</p>
            <Button
              variant="ghost"
              size="icon"
              className="touch-target h-9 min-h-[44px] w-9 min-w-[44px] shrink-0"
              onClick={handleDismiss}
              aria-label="关闭"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" className="touch-target min-h-[44px]" onClick={handleInstall}>
              添加
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="touch-target min-h-[44px]"
              onClick={handleDismiss}
            >
              暂不
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
