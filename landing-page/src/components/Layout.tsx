import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Timer, UserPlus, GraduationCap, School, Building2, Mail, CheckCircle2, Globe, Camera, BookOpen, Presentation, Users, BookOpenText, Search, QrCode } from 'lucide-react';

// --- Types ---
export type View = 'home' | 'register' | 'profile';

interface Tutor {
  id: string;
  username: string;
  name: string;
  bio: string;
  country: string;
  photo: string;
  isVerified: boolean;
  courses: string[];
  classes: string[];
}

// --- Mock Data ---
const CELEBRITY_TUTORS = [
  { name: "Dr. Aris", subject: "Quantum Physics", image: "https://picsum.photos/seed/tutor1/400/400" },
  { name: "Sarah Jenkins", subject: "Creative Writing", image: "https://picsum.photos/seed/tutor2/400/400" },
  { name: "Chef Marco", subject: "Culinary Arts", image: "https://picsum.photos/seed/tutor3/400/400" },
  { name: "Elena Rossi", subject: "Digital Marketing", image: "https://picsum.photos/seed/tutor4/400/400" },
  { name: "Prof. Zhang", subject: "Mandarin", image: "https://picsum.photos/seed/tutor5/400/400" },
  { name: "David Miller", subject: "Financial Literacy", image: "https://picsum.photos/seed/tutor6/400/400" },
];

// --- Components ---

export const CountdownTimer = () => {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    // Fixed launch date: August 8, 2026 at 00:00:00 UTC (37 days from July 2, 2026)
    const LAUNCH_DATE = new Date('2026-08-08T00:00:00Z').getTime();

    const calculate = () => {
      const diff = LAUNCH_DATE - Date.now();
      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeLeft({ days, hours, minutes, seconds });
    };

    calculate();
    const timer = setInterval(calculate, 1000);
    return () => clearInterval(timer);
  }, []);

  const units = [
    { value: timeLeft.days, label: 'DAYS' },
    { value: timeLeft.hours, label: 'HOURS' },
    { value: timeLeft.minutes, label: 'MINUTES' },
    { value: timeLeft.seconds, label: 'SECONDS' },
  ];

  return (
    <div className="flex gap-2 md:gap-3 justify-center items-start font-display">
      {units.map((unit, i) => (
        <React.Fragment key={unit.label}>
          <div className="flex flex-col items-center">
            <div className="text-3xl md:text-4xl font-bold text-white tabular-nums leading-none">
              {unit.value.toString().padStart(2, '0')}
            </div>
            <div className="text-[9px] md:text-[10px] uppercase tracking-wider text-white/60 mt-1">{unit.label}</div>
          </div>
          {i < units.length - 1 && (
            <div className="text-3xl md:text-4xl font-bold text-white/30 leading-none pt-0">:</div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

export const LaunchCard = () => (
  <div className="glass-card px-6 py-5 md:px-8 md:py-6 w-[300px] sm:w-[360px] md:w-[400px]">
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2 text-white/90">
        <Users className="w-4 h-4" />
        <span className="text-sm font-medium">5 Tutors</span>
      </div>
      <div className="flex items-center gap-2 text-white/90">
        <BookOpenText className="w-4 h-4" />
        <span className="text-sm font-medium">36 Courses</span>
      </div>
    </div>
    <div className="mb-3">
      <CountdownTimer />
    </div>
    <div className="text-center text-sm text-white/70 font-medium">
      Until Launch
    </div>
  </div>
);

export const TutorStrip = () => {
  return (
    <div className="relative overflow-hidden py-12 border-y border-white/5 bg-white/[0.02]">
      <div className="flex animate-marquee whitespace-nowrap">
        {[...CELEBRITY_TUTORS, ...CELEBRITY_TUTORS].map((tutor, i) => (
          <div
            key={i}
            className="inline-flex items-center mx-6 group rounded-[20px] border border-white/10 bg-[rgba(30,40,50,0.65)] px-5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_10px_25px_rgba(0,0,0,0.30)] backdrop-blur-[12px] hover:brightness-105"
          >
            <div className="w-16 h-16 rounded-full overflow-hidden border border-white/15 mr-4">
              <img src={tutor.image} alt={tutor.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </div>
            <div>
              <div className="text-lg font-bold text-slate-100">{tutor.name}</div>
              <div className="text-sm text-slate-300">{tutor.subject}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const ActionCard = ({ title, copy, buttonText, icon: Icon, onClick }: any) => (
  <motion.div
    whileHover={{ y: -5 }}
    className="glass p-8 rounded-2xl flex flex-col items-start justify-between h-full group"
  >
    <div className="mb-6">
      <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-6 group-hover:bg-emerald-500/20 transition-colors">
        <Icon className="w-6 h-6 text-emerald-400" />
      </div>
      <h3 className="text-2xl font-display font-bold mb-3">{title}</h3>
      {copy && <p className="text-zinc-400 leading-relaxed">{copy}</p>}
    </div>
    <button
      onClick={onClick}
      className="w-full py-3 px-6 rounded-xl bg-white text-black font-semibold hover:bg-emerald-400 transition-colors flex items-center justify-center gap-2"
    >
      {buttonText}
    </button>
  </motion.div>
);

// Main App URL configuration
const MAIN_APP_URL = import.meta.env.VITE_MAIN_APP_URL || 'http://localhost:3003';

export const Navbar = ({ setView }: { setView: (v: View) => void }) => (
  <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-4">
    <div className="max-w-7xl mx-auto flex justify-between items-center">
      <div
        className="text-xl font-sans font-semibold tracking-tight cursor-pointer flex items-center gap-2.5 text-white"
        onClick={() => setView('home')}
      >
        <img
          src="/solocornlogo.png"
          alt="Solocorn"
          className="w-7 h-7 object-contain brightness-0 invert"
        />
        Solocorn
      </div>
      <div className="flex items-center gap-4">
        <button
          onClick={() => setView('register')}
          className="text-sm font-medium text-white hover:text-white/80 transition-colors"
        >
          JOIN
        </button>
        <a
          href={MAIN_APP_URL}
          className="px-5 py-2 bg-white text-blue-700 rounded-full text-sm font-semibold hover:bg-white/90 transition-colors"
        >
          Sign In
        </a>
      </div>
    </div>
  </nav>
);
