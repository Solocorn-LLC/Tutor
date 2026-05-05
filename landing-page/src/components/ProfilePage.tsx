import React from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, MapPin, BookOpen, Presentation, Star, MessageSquare } from 'lucide-react';

export const ProfilePage = ({ tutor }: { tutor: any }) => {
  // Mock data for courses and classes
  const courses = [
    { id: 1, title: "Advanced Problem Solving", students: 124, price: "$199" },
    { id: 2, title: "Foundations of Logic", students: 89, price: "$149" }
  ];

  const classes = [
    { id: 1, title: "Weekly Group Session", time: "Every Tuesday", price: "$45" },
    { id: 2, title: "1-on-1 Deep Dive", time: "By Appointment", price: "$120" }
  ];

  const singleClasses = [
    { id: 1, title: "Exam Prep Crash Course", date: "Oct 15", price: "$75" }
  ];

  return (
    <div className="min-h-screen pt-32 pb-20 px-6">
      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Sidebar: Profile Info */}
        <div className="lg:col-span-1 space-y-6">
          <div className="glass p-8 rounded-3xl text-center">
            <div className="relative inline-block mb-6">
              <div className="w-40 h-40 rounded-full overflow-hidden border-4 border-emerald-500/20">
                <img src={tutor.photo} alt={tutor.username} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              </div>
              {tutor.isVerified && (
                <div className="absolute bottom-2 right-2 bg-emerald-500 p-1.5 rounded-full border-4 border-zinc-950">
                  <CheckCircle2 className="w-5 h-5 text-white" />
                </div>
              )}
            </div>
            <h1 className="text-2xl font-display font-bold mb-1">@{tutor.username || 'username'}</h1>
            <div className="flex items-center justify-center text-zinc-500 text-sm mb-6">
              <MapPin className="w-4 h-4 mr-1" />
              {tutor.country || 'Global'}
            </div>
            <div className="flex gap-2 mb-8">
              <button className="flex-1 py-2 bg-white text-black rounded-xl text-sm font-bold hover:bg-emerald-400 transition-colors">
                Follow
              </button>
              <button className="p-2 glass rounded-xl hover:bg-white/10 transition-colors">
                <MessageSquare className="w-5 h-5" />
              </button>
            </div>
            <div className="text-left">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Bio</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">
                {tutor.bio || 'No bio provided yet. This tutor is a specialist in their field, dedicated to student success.'}
              </p>
            </div>
          </div>

          <div className="glass p-6 rounded-3xl">
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">Stats</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 p-4 rounded-2xl">
                <div className="text-xl font-bold">4.9</div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Rating</div>
              </div>
              <div className="bg-white/5 p-4 rounded-2xl">
                <div className="text-xl font-bold">2.4k</div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Students</div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content: Courses & Classes */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Courses Section */}
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-display font-bold flex items-center gap-3">
                <BookOpen className="w-6 h-6 text-slate-200" />
                Course List
              </h2>
              <span className="text-xs text-zinc-500 font-bold uppercase tracking-widest">{courses.length} Courses</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {courses.map(course => (
                <motion.div
                  key={course.id}
                  whileHover={{ scale: 1.02 }}
                  className="group cursor-pointer overflow-hidden rounded-[20px] border border-white/10 bg-[rgba(30,40,50,0.65)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_10px_25px_rgba(0,0,0,0.30)] backdrop-blur-[12px]"
                  style={{
                    backgroundImage:
                      'linear-gradient(120deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 40%, rgba(255,255,255,0.00) 65%), linear-gradient(145deg, rgba(55, 65, 75, 0.85), rgba(25, 35, 45, 0.95))',
                  }}
                >
                  <div className="h-32 rounded-xl mb-4 overflow-hidden bg-[rgba(255,255,255,0.08)]">
                    <img src={`https://picsum.photos/seed/course${course.id}/400/200`} className="w-full h-full object-cover opacity-50 group-hover:opacity-80 transition-opacity" referrerPolicy="no-referrer" />
                  </div>
                  <h4 className="font-bold mb-2 text-slate-100">{course.title}</h4>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-100 font-bold">{course.price}</span>
                    <span className="text-xs text-slate-300">{course.students} Students</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>

          {/* Classes Section */}
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-display font-bold flex items-center gap-3">
                <Presentation className="w-6 h-6 text-emerald-400" />
                Class List
              </h2>
              <span className="text-xs text-zinc-500 font-bold uppercase tracking-widest">{classes.length} Recurring</span>
            </div>
            <div className="space-y-4">
              {classes.map(cls => (
                <div key={cls.id} className="glass p-4 rounded-2xl flex items-center justify-between">
                  <div>
                    <h4 className="font-bold">{cls.title}</h4>
                    <p className="text-xs text-zinc-500">{cls.time}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-bold text-emerald-400">{cls.price}</span>
                    <button className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold transition-colors">
                      Book
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Single Classes Section */}
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-display font-bold flex items-center gap-3">
                <Star className="w-6 h-6 text-emerald-400" />
                Single Classes
              </h2>
            </div>
            <div className="space-y-4">
              {singleClasses.map(cls => (
                <div key={cls.id} className="glass p-4 rounded-2xl flex items-center justify-between border-l-4 border-emerald-500">
                  <div>
                    <h4 className="font-bold">{cls.title}</h4>
                    <p className="text-xs text-zinc-500">One-time event • {cls.date}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-bold text-emerald-400">{cls.price}</span>
                    <button className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-xs font-bold hover:bg-emerald-400 transition-colors">
                      Join
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

        </div>
      </div>
    </div>
  );
};
