'use client'

import { useEffect, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { motion, AnimatePresence } from 'framer-motion'
import { scrollElementIntoView } from '@/lib/scroll-into-view'

const DISMISS_KEY = 'pwa-install-dismissed'
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

interface BeforeInstallPromptEvent extends Event {
  readonly prompt: () => Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function PWAInstallPrompt() {
  const t = useTranslations('pwa')
  const locale = useLocale()

  const [showPrompt, setShowPrompt] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstallable, setIsInstallable] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then(registration => {
          registration.update().catch(() => {
            // Service worker update check failed - non-critical
          })
          registration.waiting?.postMessage({ type: 'SKIP-WAITING' })
        })
        .catch(() => {
          // Service worker registration failed - PWA features unavailable
        })
    }

    // Trigger offline sync when coming back online
    const handleOnline = () => {
      navigator.serviceWorker?.controller?.postMessage({
        type: 'OFFLINE_SYNC_REQUEST',
      })
    }
    window.addEventListener('online', handleOnline)

    // Check if PWA is already installed
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true

    if (isStandalone) {
      return () => window.removeEventListener('online', handleOnline)
    }

    // Check dismissal with cooldown
    try {
      const stored = localStorage.getItem(DISMISS_KEY)
      if (stored) {
        const { timestamp } = JSON.parse(stored)
        if (Date.now() - timestamp < DISMISS_COOLDOWN_MS) {
          return
        }
      }
    } catch {
      /* ignore */
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setIsInstallable(true)
      setTimeout(() => setShowPrompt(true), 3000)
    }

    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !(window as unknown as { MSStream?: boolean }).MSStream
    const isSafari = /^((?!CriOS|FxiOS|EdgiOS).)*Safari/.test(navigator.userAgent)

    if (isIOS && isSafari) {
      setTimeout(() => {
        setShowPrompt(true)
        setIsInstallable(false)
      }, 5000)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [])

  const handleInstall = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt()
        const { outcome } = await deferredPrompt.userChoice
        if (outcome === 'accepted') {
          setShowPrompt(false)
        }
        setDeferredPrompt(null)
      } catch (err) {
        console.error('[PWA] Install prompt error:', err)
      }
    }
    setShowPrompt(false)
  }

  const handleDismiss = () => {
    setShowPrompt(false)
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify({ timestamp: Date.now(), locale }))
    } catch {
      /* ignore */
    }
  }

  return (
    <AnimatePresence>
      {showPrompt && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border border-gray-200 bg-white p-4 shadow-lg dark:border-gray-700 dark:bg-gray-800"
          role="dialog"
          aria-labelledby="pwa-install-title"
          aria-describedby="pwa-install-desc"
        >
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
                <svg
                  className="h-6 w-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
                  />
                </svg>
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <h3
                id="pwa-install-title"
                className="text-sm font-semibold text-gray-900 dark:text-white"
              >
                {t('install_title')}
              </h3>

              <p id="pwa-install-desc" className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {isInstallable ? t('install_description') : t('ios_install_description')}
              </p>

              {isInstallable ? (
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleInstall}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {t('install_button')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleDismiss}>
                    {t('install_dismiss')}
                  </Button>
                </div>
              ) : (
                <div className="mt-3">
                  <details
                    className="group"
                    onToggle={e => {
                      if (e.currentTarget.open) {
                        scrollElementIntoView(e.currentTarget, { margin: 16 })
                      }
                    }}
                  >
                    <summary className="cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
                      {t('ios_how_to_install')}
                    </summary>
                    <div className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
                      <p>1. {t('ios_step_1')}</p>
                      <p>2. {t('ios_step_2')}</p>
                      <p>3. {t('ios_step_3')}</p>
                    </div>
                  </details>

                  <Button size="sm" variant="outline" className="mt-2" onClick={handleDismiss}>
                    {t('install_got_it')}
                  </Button>
                </div>
              )}
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={handleDismiss}
              aria-label={t('install_dismiss')}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
