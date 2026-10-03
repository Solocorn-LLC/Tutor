/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Search, QrCode, Settings } from 'lucide-react'
import { Navbar, LaunchCard, View } from './components/Layout'
import { RegistrationPage } from './components/RegistrationPage'
import { ProfilePage } from './components/ProfilePage'
import { ContactModal } from './components/ContactModal'
import { SearchResultsPanel } from './components/SearchResultsPanel'

// Full-page background video on the landing page. When disabled, the hero uses the
// tutor hero panel blue (#3B82F6) instead and the gradient overlay is not rendered.
const SHOW_BACKGROUND_VIDEO = false

export default function App() {
  const [view, setView] = useState<View>('home')
  const [userProfile, setUserProfile] = useState<any>(null)
  const [isContactOpen, setIsContactOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const handleRegistration = (data: any) => {
    setUserProfile({ ...data, isVerified: true })
    setView('profile')
  }

  const scrollToResults = () => {
    document.getElementById('search-results-panel')?.scrollIntoView({ behavior: 'smooth' })
  }

  // Wheel-driven panel lock (stacked layout only): a wheel gesture while resting at the top
  // of the hero snaps to the top of the search results panel, and vice versa. Scrolling
  // past the results panel (to the launch card) is left to native scrolling, as is
  // touch/trackpad momentum — CSS scroll-snap (snap-proximity on <main>) covers those.
  const mainRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const main = mainRef.current
    if (!main) return
    let animating = false
    const onWheel = (e: WheelEvent) => {
      if (animating || window.matchMedia('(min-width: 1024px)').matches) return
      const results = document.getElementById('search-results-panel')
      if (!results) return
      const resultsTop = results.offsetTop - 80 // clear the fixed navbar (scroll-pt-20)
      const atHero = main.scrollTop < 40
      const atResults = Math.abs(main.scrollTop - resultsTop) < 40
      if (e.deltaY > 0 && atHero) {
        e.preventDefault()
        animating = true
        main.scrollTo({ top: resultsTop, behavior: 'smooth' })
      } else if (e.deltaY < 0 && atResults) {
        e.preventDefault()
        animating = true
        main.scrollTo({ top: 0, behavior: 'smooth' })
      } else {
        return
      }
      window.setTimeout(() => {
        animating = false
      }, 600)
    }
    main.addEventListener('wheel', onWheel, { passive: false })
    return () => main.removeEventListener('wheel', onWheel)
  }, [view])

  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-white">
      {/* Background Video */}
      {SHOW_BACKGROUND_VIDEO && (
        <>
          <video
            autoPlay
            muted
            loop
            playsInline
            className="fixed inset-0 h-full w-full object-cover"
          >
            <source src="/landing-bg-video.mp4" type="video/mp4" />
          </video>

          {/* Gradient overlay for readability */}
          <div className="fixed inset-0 bg-gradient-to-br from-blue-900/25 via-blue-800/30 to-blue-950/45" />
        </>
      )}
      {!SHOW_BACKGROUND_VIDEO && <div className="fixed inset-0 bg-[#3B82F6]" />}

      <div className="relative z-10">
        <Navbar setView={setView} />

        <AnimatePresence mode="wait">
          {view === 'home' && (
            <motion.main
              key="home"
              ref={mainRef}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={`relative flex h-screen snap-y snap-proximity flex-col overflow-y-auto scroll-pt-20 lg:h-screen lg:min-h-0 lg:snap-none lg:overflow-hidden ${
                SHOW_BACKGROUND_VIDEO ? '' : 'bg-[#3B82F6]'
              }`}
            >
              <div className="flex min-h-0 flex-1 flex-col pt-20 lg:flex-row">
                {/* Panel 1 — Hero: headline, search, How It Works shortcut */}
                <section className="flex min-h-[calc(100vh-5rem)] snap-start flex-col items-center justify-center border-white/10 px-6 py-12 lg:w-5/12 lg:overflow-y-auto lg:border-r">
                  <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.2, duration: 0.6 }}
                    className="mx-auto w-full max-w-3xl text-center"
                  >
                    <h1 className="mb-10 font-sans text-3xl font-medium tracking-tight text-white md:text-5xl">
                      Live AI-Augmented Instruction Platform
                    </h1>

                    {/* Search Bar */}
                    <motion.div
                      initial={{ y: 10, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.35, duration: 0.2 }}
                      className="relative mx-auto mb-6 max-w-2xl"
                    >
                      <div className="flex h-14 items-center rounded-full bg-white px-5 shadow-lg">
                        <Search className="h-5 w-5 flex-shrink-0 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search tutors, courses, categories..."
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                          className="flex-1 border-none bg-transparent px-3 text-base text-gray-800 placeholder-gray-400 outline-none"
                        />
                        <QrCode className="h-5 w-5 flex-shrink-0 text-gray-400" />
                      </div>
                    </motion.div>

                    {/* How It Works Button */}
                    <motion.div
                      initial={{ y: 10, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.45, duration: 0.5 }}
                    >
                      <button
                        onClick={scrollToResults}
                        className="group relative min-w-[140px] overflow-hidden rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-blue-700 shadow-md transition-colors hover:bg-white/90"
                      >
                        <span className="block opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                          How It Works
                        </span>
                        <span className="absolute inset-0 flex items-center justify-center gap-0.5 transition-opacity duration-300 group-hover:opacity-0">
                          <motion.span
                            className="inline-flex h-5 w-5"
                            animate={{ rotate: 360 }}
                            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                          >
                            <Settings className="h-full w-full" />
                          </motion.span>
                          <motion.span
                            className="-ml-1 -mt-2 inline-flex h-3.5 w-3.5"
                            animate={{ rotate: -360 }}
                            transition={{ duration: 1.33, repeat: Infinity, ease: 'linear' }}
                          >
                            <Settings className="h-full w-full" />
                          </motion.span>
                        </span>
                      </button>
                    </motion.div>
                  </motion.div>
                </section>

                {/* Panel 2 — Search results: tutor + course strips */}
                <section
                  id="search-results-panel"
                  className="flex min-h-[calc(100vh-5rem)] snap-start flex-col border-white/10 py-4 lg:w-4/12 lg:min-h-0 lg:border-r"
                >
                  <div className="min-h-0 flex-1">
                    <SearchResultsPanel query={searchQuery} />
                  </div>
                </section>

                {/* Panel 3 — Launch: countdown card + join actions */}
                <aside className="flex flex-col items-center justify-center gap-6 px-6 py-12 lg:w-3/12 lg:overflow-y-auto">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5, duration: 0.6 }}
                  >
                    <LaunchCard />
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6, duration: 0.6 }}
                    className="flex w-[300px] flex-col gap-3 sm:w-[360px] md:w-[400px] lg:w-full lg:max-w-[280px]"
                  >
                    <button
                      onClick={() => setView('register')}
                      className="w-full rounded-full bg-white px-6 py-3 text-sm font-semibold text-blue-700 shadow-md transition-colors hover:bg-white/90"
                    >
                      JOIN
                    </button>
                    <a
                      href={`${import.meta.env.VITE_MAIN_APP_URL || ''}/login`}
                      className="w-full rounded-full border border-white/40 px-6 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-white/10"
                    >
                      Sign In
                    </a>
                  </motion.div>
                </aside>
              </div>
            </motion.main>
          )}

          {view === 'register' && (
            <motion.div
              key="register"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="min-h-screen"
            >
              <RegistrationPage onSubmit={handleRegistration} />
            </motion.div>
          )}

          {view === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="min-h-screen"
            >
              <ProfilePage tutor={userProfile || {}} />
            </motion.div>
          )}
        </AnimatePresence>

        <ContactModal isOpen={isContactOpen} onClose={() => setIsContactOpen(false)} />
      </div>
    </div>
  )
}
