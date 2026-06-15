/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  QrCode,
  Settings,
  X,
  Play,
  FileText,
} from 'lucide-react';
import {
  Navbar,
  LaunchCard,
  View
} from './components/Layout';
import { RegistrationPage } from './components/RegistrationPage';
import { ProfilePage } from './components/ProfilePage';
import { ContactModal } from './components/ContactModal';

// Main App URL configuration
const MAIN_APP_URL = import.meta.env.VITE_MAIN_APP_URL || 'http://localhost:3003';

const HOW_IT_WORKS_VIDEOS: Record<string, { id: string; title: string; description: string }[]> = {
  Promo: [
    {
      id: '_U8FwciBJxg',
      title: 'Promo',
      description: 'Watch the platform promo.',
    },
  ],
  'Building Live Courses': [
    {
      id: 'PLACEHOLDER_1',
      title: 'Creating a Course',
      description: 'How to build your first live course.',
    },
    {
      id: 'PLACEHOLDER_2',
      title: 'Scheduling Sessions',
      description: 'Set up live class schedules.',
    },
    {
      id: 'PLACEHOLDER_3',
      title: 'Publishing',
      description: 'Publish and manage course variants.',
    },
  ],
  Testimonials: [
    {
      id: 'PLACEHOLDER_4',
      title: 'Maria S.',
      description: '“This platform helped me reach students across the country.”',
    },
    {
      id: 'PLACEHOLDER_5',
      title: 'James L.',
      description: '“Live sessions feel personal and my grades improved fast.”',
    },
    {
      id: 'PLACEHOLDER_6',
      title: 'Elena R.',
      description: '“Booking a tutor took seconds and the AI tools are a game changer.”',
    },
  ],
};

const HOW_IT_WORKS_DOCUMENTS = [
  {
    id: 'pitch-deck',
    title: 'Solocorn Pitch Deck',
    url: 'https://storage.googleapis.com/YOUR_BUCKET/how-it-works/pdfs/solocorn-pitch-deck.pdf',
    filename: 'solocorn-pitch-deck.pdf',
  },
  {
    id: 'course-builder-guide',
    title: 'Course Builder Guide',
    url: 'https://storage.googleapis.com/YOUR_BUCKET/how-it-works/pdfs/course-builder-guide.pdf',
    filename: 'solocorn-course-builder-guide.pdf',
  },
];

function HowItWorksVideoCard({ video }: { video: { id: string; title: string; description: string } }) {
  return (
    <a
      href={`https://www.youtube.com/watch?v=${video.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="group block w-36 overflow-hidden rounded-lg border border-white/10 bg-white/5 transition-colors hover:bg-white/10"
    >
      <div className="relative aspect-video overflow-hidden">
        <img
          src={`https://img.youtube.com/vi/${video.id}/hqdefault.jpg`}
          alt={video.title}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/30">
          <Play className="h-5 w-5 fill-white text-white opacity-80 transition-opacity group-hover:opacity-100" />
        </div>
      </div>
      <div className="p-1">
        <h3 className="text-[10px] font-semibold text-white">{video.title}</h3>
        {video.description && (
          <p className="mt-0.5 text-[9px] leading-snug text-white/70">{video.description}</p>
        )}
      </div>
    </a>
  );
}

function HowItWorksDocumentCard({ doc }: { doc: { id: string; title: string; url: string; filename: string } }) {
  return (
    <a
      href={doc.url}
      download={doc.filename}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex w-40 items-center gap-3 overflow-hidden rounded-lg border border-blue-400/30 bg-gradient-to-br from-blue-500/25 to-blue-900/35 p-2 transition-colors hover:from-blue-500/35 hover:to-blue-900/45"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
        <FileText className="h-4 w-4 text-white/90" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[10px] font-semibold text-white">{doc.title}</h3>
        <p className="mt-0.5 text-[9px] text-white/70">Download PDF</p>
      </div>
    </a>
  );
}

function HowItWorksArrow({
  direction,
  disabled,
  onClick,
}: {
  direction: 'left' | 'right';
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'shrink-0 self-center transition-all duration-300',
        'h-20 w-6',
        disabled
          ? 'cursor-not-allowed opacity-30 grayscale'
          : 'cursor-pointer hover:brightness-110 hover:-translate-y-[2px]',
      ].join(' ')}
      style={{
        clipPath:
          direction === 'left'
            ? 'polygon(100% 0, 100% 100%, 0 50%)'
            : 'polygon(0 0, 0 100%, 100% 50%)',
        background: 'linear-gradient(135deg, rgba(70,110,180,0.5) 0%, rgba(25,55,110,0.5) 100%)',
        filter:
          'drop-shadow(0 8px 16px rgba(0,0,0,0.35)) drop-shadow(0 0 2px rgba(25,55,110,0.5)) drop-shadow(0 0 4px rgba(25,55,110,0.3))',
      }}
      aria-label={direction === 'left' ? 'Previous' : 'Next'}
    />
  );
}

function HowItWorksRow<T>({
  title,
  items,
  renderItem,
  itemsPerPage = 5,
}: {
  title: string;
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  itemsPerPage?: number;
}) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(items.length / itemsPerPage));
  const currentPage = Math.min(page, totalPages - 1);
  const canPrev = currentPage > 0;
  const canNext = currentPage < totalPages - 1;
  const visible = items.slice(currentPage * itemsPerPage, currentPage * itemsPerPage + itemsPerPage);

  const trackWidth = `calc(${itemsPerPage} * 9rem + ${itemsPerPage - 1} * 0.5rem)`;

  return (
    <div className="flex flex-col items-center">
      <div style={{ width: trackWidth }}>
        <h2 className="mb-1 text-left text-sm font-semibold text-white">{title}</h2>
      </div>
      <div className="flex items-center justify-center gap-3">
        <HowItWorksArrow
          direction="left"
          disabled={!canPrev}
          onClick={() => setPage(p => Math.max(p - 1, 0))}
        />
        <div
          className="scrollbar-hide flex gap-2 overflow-x-auto py-1"
          style={{ width: trackWidth }}
        >
          {visible.map((item, i) => (
            <div key={i} className="shrink-0">
              {renderItem(item)}
            </div>
          ))}
        </div>
        <HowItWorksArrow
          direction="right"
          disabled={!canNext}
          onClick={() => setPage(p => Math.min(p + 1, totalPages - 1))}
        />
      </div>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<View>('home');
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isContactOpen, setIsContactOpen] = useState(false);
  const [isHowItWorksOpen, setIsHowItWorksOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Lock background scrolling while the How It Works panel is open
  useEffect(() => {
    if (isHowItWorksOpen) {
      const originalBodyOverflow = document.body.style.overflow;
      const originalHtmlOverflow = document.documentElement.style.overflow;
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalBodyOverflow;
        document.documentElement.style.overflow = originalHtmlOverflow;
      };
    }
  }, [isHowItWorksOpen]);

  const handleRegistration = (data: any) => {
    setUserProfile({ ...data, isVerified: true });
    setView('profile');
  };

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* Background Video */}
      <video
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
      >
        <source src="/landing-bg-video.mp4" type="video/mp4" />
      </video>

      {/* Gradient overlay for readability */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-900/25 via-blue-800/30 to-blue-950/45" />

      <div className="relative z-10">
        <Navbar setView={setView} />

        <AnimatePresence mode="wait">
          {view === 'home' && (
            <motion.main
              key="home"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="min-h-screen flex flex-col relative"
            >
              {/* Top spacer: clears navbar and pushes hero toward vertical center */}
              <div className="flex-1 min-h-[100px]" />

              {/* Hero Section */}
              <section className="flex flex-col items-center px-6">
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2, duration: 0.6 }}
                  className="text-center max-w-3xl mx-auto w-full"
                >
                  <h1 className="text-3xl md:text-5xl font-sans font-medium tracking-tight mb-10 text-white">
                    Live AI-Augmented Instruction Platform
                  </h1>

                  {/* Search Bar */}
                  <motion.div
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: isHowItWorksOpen ? 0 : 1 }}
                    transition={{ delay: 0.35, duration: 0.2 }}
                    className={`relative max-w-2xl mx-auto mb-6 ${isHowItWorksOpen ? 'pointer-events-none' : ''}`}
                  >
                    <div className="flex items-center bg-white rounded-full h-14 px-5 shadow-lg">
                      <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      <input
                        type="text"
                        placeholder="Search tutors, courses, categories..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="flex-1 bg-transparent border-none outline-none text-gray-800 placeholder-gray-400 px-3 text-base"
                      />
                      <QrCode className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    </div>
                  </motion.div>

                  {/* How It Works Button */}
                  <motion.div
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.45, duration: 0.5 }}
                  >
                    <button
                      onClick={() => setIsHowItWorksOpen(true)}
                      className="group relative px-6 py-2.5 bg-white text-blue-700 rounded-full text-sm font-semibold hover:bg-white/90 transition-colors shadow-md overflow-hidden min-w-[140px]"
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
                          className="-mt-2 -ml-1 inline-flex h-3.5 w-3.5"
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

              {/* Guaranteed buffer: ensures persistent gap between hero and card */}
              <div className="flex-1 min-h-[160px]" />

              {/* Launch Card — Bottom Right */}
              <div className="flex-shrink-0 flex justify-end px-6 pb-10">
                <AnimatePresence>
                  {!isHowItWorksOpen && (
                    <motion.div
                      key="launch-card"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 20 }}
                      transition={{ delay: 0.5, duration: 0.6 }}
                    >
                      <LaunchCard />
                    </motion.div>
                  )}
                </AnimatePresence>
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

        {/* How It Works Modal */}
        <AnimatePresence>
          {isHowItWorksOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center bg-transparent px-6"
              onClick={() => setIsHowItWorksOpen(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="relative flex max-h-[90vh] min-h-[60vh] w-full max-w-5xl flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[rgba(31,41,51,0.60)] p-4 shadow-lg backdrop-blur-xl md:min-h-[70vh] md:p-6"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Close button */}
                <button
                  onClick={() => setIsHowItWorksOpen(false)}
                  className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>

                <div className="flex w-full max-w-5xl flex-1 flex-col overflow-hidden">
                  {/* Gear animation header */}
                  <div className="flex flex-col items-center justify-center py-1">
                    <div className="flex items-center justify-center gap-1">
                      <motion.span
                        className="inline-flex h-6 w-6 text-white/90"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                      >
                        <Settings className="h-full w-full" />
                      </motion.span>
                      <motion.span
                        className="-mt-1.5 -ml-0.5 inline-flex h-6 w-6 text-white/90"
                        animate={{ rotate: -360 }}
                        transition={{ duration: 1.33, repeat: Infinity, ease: 'linear' }}
                      >
                        <Settings className="h-full w-full" />
                      </motion.span>
                    </div>
                  </div>

                  {/* Scrollable rows */}
                  <div className="scrollbar-hide w-full flex-1 overflow-y-auto px-1 py-1">
                    {Object.entries(HOW_IT_WORKS_VIDEOS).map(([section, videos], sectionIndex, sections) => (
                      <div key={section}>
                        <HowItWorksRow
                          title={section}
                          items={videos}
                          renderItem={video => <HowItWorksVideoCard video={video} />}
                        />
                        {sectionIndex < sections.length - 1 && (
                          <div className="mx-2 my-2 h-px bg-white/20" />
                        )}
                      </div>
                    ))}

                    <div className="mx-2 my-2 h-px bg-white/20" />

                    <HowItWorksRow
                      title="Documents"
                      items={HOW_IT_WORKS_DOCUMENTS}
                      renderItem={doc => <HowItWorksDocumentCard doc={doc} />}
                    />
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <ContactModal isOpen={isContactOpen} onClose={() => setIsContactOpen(false)} />
      </div>
    </div>
  );
}
