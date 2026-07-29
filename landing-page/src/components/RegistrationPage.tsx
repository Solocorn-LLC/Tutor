import React, { useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, Globe, Camera, User, FileText, MapPin } from 'lucide-react';

export const RegistrationPage = ({ onSubmit }: { onSubmit: (data: any) => void }) => {
  const [formData, setFormData] = useState({
    username: '',
    bio: '',
    country: '',
    photo: 'https://picsum.photos/seed/user/400/400',
    isVerified: false
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg('');
    try {
      // Empty default → same-origin relative URL. In production the landing is served by
      // the main app, so `/api/landing/signup` reaches it directly. For a separate local
      // dev server (vite on :3000), set VITE_MAIN_APP_URL=http://localhost:3003.
      const MAIN_APP_URL = import.meta.env.VITE_MAIN_APP_URL || '';
      const res = await fetch(`${MAIN_APP_URL}/api/landing/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (!res.ok) {
        throw new Error('Failed to submit application');
      }
      onSubmit(formData);
    } catch (err) {
      setErrorMsg('An error occurred while submitting. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen pt-32 pb-20 px-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-12 text-center">
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-4">Join the Cohort</h1>
          <p className="text-zinc-400">Preorder your spot as a Solocorn verified tutor.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="glass p-8 rounded-3xl space-y-6">
            {/* Photo Upload Simulation */}
            <div className="flex flex-col items-center mb-8">
              <div className="relative group">
                <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-emerald-500/20 group-hover:border-emerald-500/40 transition-colors">
                  <img src={formData.photo} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <button type="button" className="absolute bottom-0 right-0 p-2 bg-emerald-500 rounded-full text-white shadow-lg hover:scale-110 transition-transform">
                  <Camera className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-zinc-500 mt-4 uppercase tracking-widest">Personal Photo</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">@username</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input 
                    type="text"
                    placeholder="solocorn_tutor"
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 focus:outline-none focus:border-emerald-500 transition-colors"
                    value={formData.username}
                    onChange={e => setFormData({...formData, username: e.target.value})}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Bio</label>
                <div className="relative">
                  <FileText className="absolute left-4 top-4 w-4 h-4 text-zinc-500" />
                  <textarea 
                    placeholder="Describe your expertise and what you offer..."
                    rows={4}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 focus:outline-none focus:border-emerald-500 transition-colors resize-none"
                    value={formData.bio}
                    onChange={e => setFormData({...formData, bio: e.target.value})}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Country</label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input 
                      type="text"
                      placeholder="United States"
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 focus:outline-none focus:border-emerald-500 transition-colors"
                      value={formData.country}
                      onChange={e => setFormData({...formData, country: e.target.value})}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Verification Status</label>
                  <div className="flex items-center h-[50px] px-4 bg-white/5 border border-white/10 rounded-xl">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 mr-3" />
                    <span className="text-zinc-400 text-sm">Pre-verified Candidate</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <button 
            type="submit"
            disabled={isSubmitting}
            className="w-full py-4 bg-emerald-500 text-white font-bold rounded-2xl hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.98] disabled:opacity-50"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Application'}
          </button>
          {errorMsg && <p className="text-red-400 text-sm text-center mt-2">{errorMsg}</p>}
        </form>
      </div>
    </div>
  );
};
