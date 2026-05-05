import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Timer, UserPlus, GraduationCap, School, Building2, Mail, CheckCircle2, Globe, Camera, BookOpen, Presentation } from 'lucide-react';

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
  const [timeLeft, setTimeLeft] = useState({ days: 12, hours: 5, minutes: 45, seconds: 30 });

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev.seconds > 0) return { ...prev, seconds: prev.seconds - 1 };
        if (prev.minutes > 0) return { ...prev, seconds: 59, minutes: prev.minutes - 1 };
        return prev; // Simplified for demo
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex gap-4 md:gap-8 justify-center items-center font-display">
      {Object.entries(timeLeft).map(([unit, value]) => (
        <div key={unit} className="flex flex-col items-center">
          <div className="text-4xl md:text-6xl font-bold text-white tabular-nums">
            {value.toString().padStart(2, '0')}
          </div>
          <div className="text-xs uppercase tracking-widest text-zinc-500 mt-2">{unit}</div>
        </div>
      ))}
    </div>
  );
};

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
    <div className="max-w-7xl mx-auto flex justify-between items-center glass rounded-2xl px-6 py-3">
      <div 
        className="text-2xl font-display font-bold tracking-tighter cursor-pointer flex items-center gap-2"
        onClick={() => setView('home')}
      >
        <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
          <div className="w-4 h-4 bg-white rounded-sm rotate-45" />
        </div>
        SOLOCORN
      </div>
      <div className="flex items-center gap-4">
        <button 
          onClick={() => setView('register')}
          className="text-sm font-medium hover:text-emerald-400 transition-colors hidden sm:block"
        >
          Become a Tutor
        </button>
        <a 
          href={MAIN_APP_URL}
          className="px-5 py-2 bg-emerald-500 text-white rounded-lg text-sm font-bold hover:bg-emerald-400 transition-colors"
        >
          Get Started
        </a>
        <button 
          onClick={() => setView('register')}
          className="px-5 py-2 bg-white text-black rounded-lg text-sm font-bold hover:bg-emerald-400 transition-colors"
        >
          Register
        </button>
      </div>
    </div>
  </nav>
);
