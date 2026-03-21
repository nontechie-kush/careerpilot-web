'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useInView } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import {
  Upload, Globe, FileText, ArrowRight,
  CheckCircle, Zap, Shield, Search, Users, PenTool,
  Sun, Moon, Clock,
} from 'lucide-react';
import useStore from '@/store/useStore';

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay, ease: 'easeOut' },
});

// ── Navbar ────────────────────────────────────────────────────
function Navbar({ onSignIn }) {
  const [scrolled, setScrolled] = useState(false);
  const darkMode = useStore((s) => s.darkMode);
  const toggleDarkMode = useStore((s) => s.toggleDarkMode);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 px-5 py-3.5 flex items-center justify-between lg:px-8 transition-all ${scrolled ? 'shadow-sm' : ''}`}
      style={{ background: scrolled ? (darkMode ? 'rgba(15,15,20,0.92)' : 'rgba(255,255,255,0.92)') : 'transparent', backdropFilter: scrolled ? 'blur(20px)' : 'none' }}>
      <div className={`flex items-center gap-2.5 font-bold text-base tracking-tight ${darkMode ? 'text-white' : 'text-gray-900'}`}>
        <div className="w-[26px] h-[26px] rounded-[7px] bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-[13px] font-extrabold text-white">
          C
        </div>
        CareerPilot
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={toggleDarkMode}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${darkMode ? 'text-slate-400 hover:text-white hover:bg-white/10' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
          title={darkMode ? 'Light mode' : 'Dark mode'}
        >
          {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        <button
          onClick={onSignIn}
          className={`px-4 py-2 text-[13px] font-medium transition-colors rounded-lg ${darkMode ? 'text-slate-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}
        >
          Sign in
        </button>
      </div>
    </nav>
  );
}

// ── Hero ─────────────────────────────────────────────────────
function HeroSection({ onFileSelected, onWebsiteSubmit }) {
  const darkMode = useStore((s) => s.darkMode);
  const fileInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [error, setError] = useState('');

  const handleDragOver = useCallback((e) => { e.preventDefault(); setDragOver(true); }, []);
  const handleDragLeave = useCallback(() => setDragOver(false), []);
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, []);

  const handleFile = (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError('File too large. Keep it under 5MB.'); return; }
    const ext = file.name?.toLowerCase();
    if (!ext.endsWith('.pdf') && !ext.endsWith('.docx')) { setError('Please upload a PDF or DOCX file.'); return; }
    setError('');
    onFileSelected(file);
  };

  const handleWebsite = () => {
    const url = websiteUrl.trim();
    if (!url) return;
    onWebsiteSubmit(url.startsWith('http') ? url : 'https://' + url);
  };

  return (
    <section className="pt-28 lg:pt-36 pb-12 lg:pb-16 px-5 lg:px-8 max-w-3xl mx-auto text-center">
      {/* Headline */}
      <motion.h1
        {...fadeUp(0)}
        className={`text-[32px] sm:text-[40px] lg:text-[52px] font-extrabold tracking-[-0.04em] leading-[1.1] mb-5 ${darkMode ? 'text-white' : 'text-gray-900'}`}
      >
        Your job search,{' '}
        <span className="text-emerald-600">on autopilot.</span>
      </motion.h1>

      <motion.p
        {...fadeUp(0.06)}
        className={`text-base lg:text-lg leading-relaxed max-w-xl mx-auto mb-10 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}
      >
        CareerPilot scans 20+ job sites every 4 hours, finds the right people to reach out to, and drafts your applications. You just review and apply.
      </motion.p>

      {/* ── Import UI ── */}
      <motion.div {...fadeUp(0.12)} className="max-w-md mx-auto">
        {/* Upload */}
        <button
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`w-full rounded-2xl p-5 flex items-center gap-4 transition-all active:scale-[0.98] group text-left ${dragOver ? 'scale-[1.01]' : ''} ${darkMode ? 'hover:bg-white/[0.04]' : 'hover:bg-emerald-50/50'}`}
          style={{
            background: darkMode
              ? (dragOver ? 'rgba(16,185,129,0.05)' : 'hsl(240 5% 7%)')
              : (dragOver ? 'rgba(16,185,129,0.04)' : '#fafafa'),
            border: `2px dashed ${dragOver
              ? 'rgba(16,185,129,0.6)'
              : (darkMode ? 'rgba(255,255,255,0.1)' : '#d1d5db')}`,
          }}
        >
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${darkMode ? 'bg-emerald-400/10' : 'bg-emerald-50'}`}>
            <Upload className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className={`font-semibold text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>Upload resume or portfolio</p>
            <p className={`text-xs mt-0.5 ${darkMode ? 'text-slate-500' : 'text-gray-500'}`}>PDF or Word · Drag & drop or click</p>
          </div>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />

        {/* Website URL */}
        <div className="flex gap-2 mt-3">
          <div className="relative flex-1">
            <Globe className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`} />
            <input
              type="url"
              placeholder="Or paste portfolio / website URL"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleWebsite()}
              className={`w-full rounded-xl pl-10 pr-4 py-3 text-sm outline-none transition-all ${darkMode ? 'bg-[hsl(240,5%,8%)] border border-white/[0.08] text-white placeholder:text-slate-600 focus:ring-1 focus:ring-emerald-400/40' : 'bg-white border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30'}`}
            />
          </div>
          <button
            onClick={handleWebsite}
            disabled={!websiteUrl.trim()}
            className="px-4 rounded-xl bg-emerald-600 text-white font-bold text-sm disabled:opacity-40 hover:bg-emerald-700 transition-colors"
          >
            Go
          </button>
        </div>

        {/* Tertiary links */}
        <div className={`flex items-center justify-center gap-4 mt-3 text-xs ${darkMode ? 'text-slate-500' : 'text-gray-500'}`}>
          <button
            onClick={() => {
              sessionStorage.setItem('careerpilot_import', JSON.stringify({ method: 'paste', showPaste: true }));
              window.location.href = '/auth/signup?method=paste';
            }}
            className={`flex items-center gap-1 hover:underline ${darkMode ? 'hover:text-slate-300' : 'hover:text-gray-700'}`}
          >
            <FileText className="w-3 h-3" /> Paste text
          </button>
          <span className={darkMode ? 'text-slate-700' : 'text-gray-300'}>|</span>
          <button
            onClick={() => window.location.href = '/auth/signup?method=manual'}
            className={`hover:underline ${darkMode ? 'hover:text-slate-300' : 'hover:text-gray-700'}`}
          >
            No resume? Fill in details
          </button>
        </div>

        {error && (
          <p className="text-red-500 text-xs mt-2 flex items-center justify-center gap-1">
            <span className="w-1 h-1 rounded-full bg-red-500" /> {error}
          </p>
        )}

        <p className={`text-[11px] mt-3 flex items-center justify-center gap-1.5 ${darkMode ? 'text-slate-600' : 'text-gray-400'}`}>
          <Shield className="w-3 h-3" />
          Free for 14 days · No credit card
        </p>
      </motion.div>
    </section>
  );
}

// ── Trust Strip ──────────────────────────────────────────────
const portals = [
  'LinkedIn', 'Greenhouse', 'Lever', 'Naukri', 'Wellfound',
  'Remotive', 'YC Jobs', 'Cutshort', 'Ashby', 'Hirect',
  'Arc', 'IIMJobs', 'Instahyre', 'TopStartups',
];

function TrustStrip() {
  const darkMode = useStore((s) => s.darkMode);
  return (
    <section className={`py-5 border-y overflow-hidden ${darkMode ? 'border-white/[0.06]' : 'border-gray-100'}`}>
      <p className={`text-center text-[10px] font-medium uppercase tracking-widest mb-3 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>
        Scanning jobs from
      </p>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-3 animate-portal-scroll" style={{ width: 'max-content' }}>
          {[...portals, ...portals].map((name, i) => (
            <span
              key={`${name}-${i}`}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg border whitespace-nowrap ${darkMode ? 'border-white/[0.06] bg-white/[0.02]' : 'border-gray-100 bg-white'}`}
            >
              <Globe className={`w-3 h-3 shrink-0 ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`} />
              <span className={`text-[12px] font-medium ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>{name}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── What CareerPilot does — 3 clean cards ────────────────────
const features = [
  {
    icon: Search,
    title: 'Finds the right jobs',
    desc: 'Scans 20+ job sites every 4 hours. Only roles that match your profile show up in your feed.',
  },
  {
    icon: Users,
    title: 'Connects you to the right people',
    desc: 'Identifies hiring managers and recruiters for each job. Drafts personalized outreach messages.',
  },
  {
    icon: PenTool,
    title: 'Drafts your applications',
    desc: 'Cover letters, bios, and screening answers — written from your resume. Review, tweak, submit.',
  },
];

function FeaturesSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const darkMode = useStore((s) => s.darkMode);

  return (
    <section className="py-16 lg:py-20 px-5 lg:px-8 max-w-5xl mx-auto" ref={ref}>
      <motion.h2
        initial={{ opacity: 0, y: 14 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        className={`text-center text-[22px] lg:text-[28px] font-bold tracking-[-0.03em] mb-10 ${darkMode ? 'text-white' : 'text-gray-900'}`}
      >
        What CareerPilot does for you
      </motion.h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {features.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 18 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.4, delay: i * 0.1 }}
            className={`rounded-2xl p-6 border ${darkMode ? 'border-white/[0.08] bg-[hsl(240,4%,8%)]' : 'border-gray-100 bg-white shadow-sm'}`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${darkMode ? 'bg-emerald-400/10' : 'bg-emerald-50'}`}>
              <f.icon className={`w-5 h-5 ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`} />
            </div>
            <h3 className={`text-[15px] font-bold tracking-tight mb-1.5 ${darkMode ? 'text-white' : 'text-gray-900'}`}>{f.title}</h3>
            <p className={`text-[13px] leading-relaxed ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>{f.desc}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

// ── How It Works — 3 steps, compact ─────────────────────────
function HowItWorksSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const darkMode = useStore((s) => s.darkMode);

  const steps = [
    { num: '1', title: 'Import your profile', desc: '2 minutes. Upload, paste, or type.', icon: Upload },
    { num: '2', title: 'It starts immediately', desc: 'Scans jobs, finds contacts, drafts applications.', icon: Zap },
    { num: '3', title: 'You review and apply', desc: 'Everything is ready. Under 2 min per application.', icon: CheckCircle },
  ];

  return (
    <section id="how" className={`py-16 lg:py-20 px-5 lg:px-8 ${darkMode ? 'bg-[hsl(240,4%,6%)]' : 'bg-gray-50'}`} ref={ref}>
      <div className="max-w-5xl mx-auto">
        <motion.h2
          initial={{ opacity: 0, y: 14 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          className={`text-center text-[22px] lg:text-[28px] font-bold tracking-[-0.03em] mb-10 ${darkMode ? 'text-white' : 'text-gray-900'}`}
        >
          Setup takes 2 minutes. Then it runs.
        </motion.h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {steps.map((s, i) => (
            <motion.div
              key={s.num}
              initial={{ opacity: 0, y: 18 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="text-center"
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3 text-sm font-bold ${darkMode ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
                {s.num}
              </div>
              <h3 className={`text-[15px] font-bold tracking-tight mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>{s.title}</h3>
              <p className={`text-[13px] leading-relaxed ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>{s.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* Always running callout */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.4 }}
          className={`mt-12 rounded-xl p-5 flex items-center gap-4 max-w-lg mx-auto ${darkMode ? 'bg-white/[0.03] border border-white/[0.06]' : 'bg-white border border-gray-200 shadow-sm'}`}
        >
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${darkMode ? 'bg-emerald-400/10' : 'bg-emerald-50'}`}>
            <Clock className={`w-5 h-5 ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`} />
          </div>
          <div>
            <p className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Works even when you don&apos;t</p>
            <p className={`text-xs mt-0.5 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
              Runs every 4 hours — while you sleep, interview, or take a break. New matches every morning.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ── Final CTA ────────────────────────────────────────────────
function FinalCTA({ onCTA }) {
  const darkMode = useStore((s) => s.darkMode);
  return (
    <section id="cta" className="py-16 lg:py-20 px-5 lg:px-8 text-center max-w-5xl mx-auto">
      <h2 className={`text-[24px] lg:text-[32px] font-extrabold tracking-[-0.04em] leading-[1.1] mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
        Less scrolling. More interviews.
      </h2>
      <p className={`text-sm mb-6 max-w-md mx-auto ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
        Import your profile once. CareerPilot does the searching, networking, and writing — you just show up prepared.
      </p>
      <button
        onClick={onCTA}
        className="inline-flex items-center justify-center gap-2 py-[14px] px-7 rounded-xl bg-emerald-600 text-white font-bold text-[15px] transition-all active:scale-[0.97] hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 mb-3"
      >
        Get started — free for 14 days
        <ArrowRight className="w-4 h-4" />
      </button>
      <p className={`text-[11px] flex items-center justify-center gap-1.5 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>
        <Shield className="w-3 h-3" />
        No credit card required
      </p>
    </section>
  );
}

// ── Sticky mobile bar ────────────────────────────────────────
function StickyBar({ onCTA }) {
  const [show, setShow] = useState(false);
  const darkMode = useStore((s) => s.darkMode);
  useEffect(() => {
    const fn = () => {
      const ctaSection = document.getElementById('cta');
      if (ctaSection) {
        const rect = ctaSection.getBoundingClientRect();
        const ctaVisible = rect.top < window.innerHeight && rect.bottom > 0;
        setShow(window.scrollY > 400 && !ctaVisible);
      } else {
        setShow(window.scrollY > 400);
      }
    };
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 border-t flex gap-2.5 px-5 py-3 transition-transform duration-300 xl:hidden ${show ? 'translate-y-0' : 'translate-y-full'}`}
      style={{
        background: darkMode ? 'rgba(15,15,20,0.95)' : 'rgba(255,255,255,0.95)',
        borderColor: darkMode ? 'rgba(255,255,255,0.08)' : '#e5e7eb',
        backdropFilter: 'blur(20px)',
        paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <button
        onClick={onCTA}
        className="flex-1 py-3.5 rounded-xl bg-emerald-600 text-white font-bold text-sm text-center transition-opacity active:opacity-85 flex items-center justify-center gap-2"
      >
        Get started — free
      </button>
      <a
        href="#how"
        className={`py-3.5 px-4 rounded-xl border text-[13px] font-medium flex items-center active:opacity-80 ${darkMode ? 'bg-white/[0.06] border-white/10 text-slate-400' : 'bg-gray-50 border-gray-200 text-gray-600'}`}
      >
        How?
      </a>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────
export default function LandingPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const darkMode = useStore((s) => s.darkMode);

  useEffect(() => {
    const supabase = createClient();
    const timeout = setTimeout(() => setChecking(false), 800);
    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(timeout);
      if (session) {
        supabase.from('users').select('onboarding_completed').eq('id', session.user.id).single()
          .then(({ data }) => {
            router.replace(data?.onboarding_completed ? '/dashboard' : '/onboarding');
          });
      } else {
        setChecking(false);
      }
    }).catch(() => { clearTimeout(timeout); setChecking(false); });
  }, [router]);

  const goSignup = () => router.push('/auth/signup');
  const goSignIn = () => router.push('/auth/login');

  const handleFileSelected = (file) => {
    sessionStorage.setItem('careerpilot_import', JSON.stringify({
      method: 'pdf',
      fileName: file.name,
      needsReupload: false,
    }));
    window.__careerpilot_file = file;
    router.push('/auth/signup?method=pdf');
  };

  const handleWebsiteSubmit = (url) => {
    sessionStorage.setItem('careerpilot_import', JSON.stringify({
      method: 'website',
      url,
    }));
    router.push('/auth/signup?method=website');
  };

  if (checking) {
    return (
      <div className={`min-h-dvh flex items-center justify-center ${darkMode ? 'bg-slate-950' : 'bg-white'}`}>
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-emerald-500"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen pb-20 xl:pb-0 transition-colors ${darkMode ? 'bg-slate-950 text-white' : 'bg-white text-gray-900'}`}
      style={{ fontFamily: "'Outfit', -apple-system, sans-serif" }}>
      <Navbar onSignIn={goSignIn} />

      <HeroSection onFileSelected={handleFileSelected} onWebsiteSubmit={handleWebsiteSubmit} />

      <TrustStrip />

      <FeaturesSection />

      <HowItWorksSection />

      <FinalCTA onCTA={goSignup} />

      <footer className={`border-t py-7 px-5 text-center ${darkMode ? 'border-white/[0.06]' : 'border-gray-100'}`}>
        <p className={`text-[11px] leading-snug ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>
          © 2026 CareerPilot · Built for people who&apos;d rather interview than job hunt.
        </p>
      </footer>

      <StickyBar onCTA={goSignup} />
    </div>
  );
}
