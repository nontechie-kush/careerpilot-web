'use client';

/**
 * Onboarding — 3-step Pilot-led flow
 *
 * Step 1: Profile import (PDF primary, website secondary, paste tertiary)
 * Step 2: Target roles + preferences (location, work style, IC/lead)
 * Step 3: Pilot scanning narration → redirect to dashboard
 */

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Globe, FileText, CheckCircle2, ChevronRight, Zap } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import useStore from '@/store/useStore';

const TOTAL_STEPS = 3;

// ── Shared primitives ──────────────────────────────────────────
const inputClsFn = (dark) => `w-full rounded-xl px-4 py-3 text-sm outline-none focus:ring-1 transition-all ${dark ? 'text-white placeholder:text-slate-600 focus:ring-green-400/40' : 'text-gray-900 placeholder:text-gray-400 focus:ring-emerald-500/30 focus:border-emerald-500'}`;
const inputStyleFn = (dark) => dark ? { background: 'hsl(240 5% 8%)', border: '1px solid rgba(255,255,255,0.08)' } : { background: '#f9fafb', border: '1px solid #e5e7eb' };

const chipClsFn = (active, dark) =>
  `py-3 px-2 rounded-xl text-xs font-medium border transition-all text-center leading-tight cursor-pointer ${
    active
      ? 'bg-emerald-500 text-white border-emerald-500'
      : dark ? 'text-slate-300 border-white/10 hover:border-white/20' : 'text-gray-700 border-gray-200 hover:border-gray-300'
  }`;
const chipStyleFn = (active, dark) => active ? {} : dark ? { background: 'hsl(240 5% 10%)' } : { background: '#f9fafb' };

function PilotLabel({ darkMode = true }) {
  return (
    <p className={`text-xs font-mono uppercase tracking-widest mb-2 ${darkMode ? 'text-green-400' : 'text-emerald-600'}`}>Pilot</p>
  );
}

function GreenBtn({ onClick, disabled, children, type = 'button', className = '', darkMode = true }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`w-full py-3.5 rounded-xl font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-2 transition-colors active:scale-[0.98] ${darkMode ? 'bg-green-400 text-slate-950 hover:bg-green-300 glow-primary' : 'bg-emerald-600 text-white hover:bg-emerald-700'} ${className}`}
    >
      {children}
    </button>
  );
}

function ThemedCard({ children, className = '', darkMode = true }) {
  return (
    <div
      className={`rounded-2xl p-5 ${className}`}
      style={darkMode
        ? { background: 'hsl(240 5% 8%)', border: '1px solid rgba(255,255,255,0.07)' }
        : { background: '#f9fafb', border: '1px solid #e5e7eb' }
      }
    >
      {children}
    </div>
  );
}

// ── Step 1: Profile Import ─────────────────────────────────────
function StepImport({ onNext, onProfileParsed }) {
  const darkMode = useStore((s) => s.darkMode);
  const [mode, setMode] = useState('idle');
  const [inputType, setInputType] = useState(null);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [parsedProfile, setParsedProfile] = useState(null);
  const [pilotLines, setPilotLines] = useState([]);
  const fileInputRef = useRef(null);

  const addLine = (line) => setPilotLines((prev) => [...prev, line]);

  const parseProfile = async (payload) => {
    setMode('parsing');
    setPilotLines([]);

    const linesByType = {
      pdf:     ['Reading your resume...', 'Pulling out your experience...', 'Mapping your skills...', 'Got it.'],
      website: ['Hitting your portfolio...', 'Reading through your work...', 'Extracting what matters...', 'Done.'],
      paste:   ['Going through what you shared...', 'Pulling out the signal...', 'Mapping your background...', 'Done.'],
    };
    const lines = linesByType[payload.get('type')] || linesByType.paste;

    const linePromise = (async () => {
      for (let i = 0; i < lines.length - 1; i++) {
        await new Promise((r) => setTimeout(r, 600 + i * 400));
        addLine(lines[i]);
      }
    })();

    try {
      const res = await fetch('/api/onboarding/parse-profile', { method: 'POST', body: payload });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Parse failed');

      await linePromise;
      addLine(lines[lines.length - 1]);
      await new Promise((r) => setTimeout(r, 400));

      setParsedProfile(data);
      onProfileParsed(data);
      setMode('done');
    } catch {
      await linePromise;
      addLine('Hmm. Something went sideways. Try again.');
      setMode('error');
    }
  };

  const handlePdfUpload = async (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { addLine("That file's too big. Keep it under 5MB."); return; }
    const isDocx = file.name?.toLowerCase().endsWith('.docx') ||
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    setInputType('pdf');
    const fd = new FormData();
    fd.append('type', isDocx ? 'docx' : 'pdf');
    fd.append('file', file);
    await parseProfile(fd);
  };

  const handleWebsite = async () => {
    if (!websiteUrl.trim()) return;
    setInputType('website');
    const fd = new FormData();
    fd.append('type', 'website');
    fd.append('url', websiteUrl.trim());
    await parseProfile(fd);
  };

  const handlePaste = async () => {
    if (pasteText.trim().length < 50) { addLine('Give me more to work with. Paste your full resume text.'); return; }
    setInputType('paste');
    const fd = new FormData();
    fd.append('type', 'paste');
    fd.append('text', pasteText.trim());
    await parseProfile(fd);
  };

  // ── Idle / Error ──
  if (mode === 'idle' || mode === 'error') {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <PilotLabel darkMode={darkMode} />
          <h2 className={`text-2xl lg:text-3xl font-bold leading-tight ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            Alright. I need to know what I'm working with.
          </h2>
          <p className={`mt-2 text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Drop your resume — PDF works best.</p>
        </div>

        {/* Primary: PDF upload */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="rounded-2xl p-7 flex flex-col items-center gap-3 transition-all active:scale-[0.98] group"
          style={darkMode
            ? { background: 'hsl(240 5% 7%)', border: '2px dashed rgba(74,222,128,0.25)' }
            : { background: '#f9fafb', border: '2px dashed rgba(5,150,105,0.3)' }
          }
          onMouseEnter={e => e.currentTarget.style.borderColor = darkMode ? 'rgba(74,222,128,0.5)' : 'rgba(5,150,105,0.6)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = darkMode ? 'rgba(74,222,128,0.25)' : 'rgba(5,150,105,0.3)'}
        >
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: darkMode ? 'rgba(74,222,128,0.1)' : 'rgba(5,150,105,0.08)' }}>
            <Upload className={`w-6 h-6 ${darkMode ? 'text-green-400' : 'text-emerald-600'}`} />
          </div>
          <div className="text-center">
            <p className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Upload resume</p>
            <p className={`text-xs mt-1 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>PDF or Word (.docx) · Up to 5MB</p>
          </div>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handlePdfUpload(e.target.files[0])}
        />

        <p className={`text-center text-xs -mt-2 ${darkMode ? 'text-slate-600' : 'text-gray-400'}`}>
          Tip: Export from LinkedIn → Me → Settings → Save to PDF
        </p>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px" style={{ background: darkMode ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)' }} />
          <span className={`text-xs font-mono ${darkMode ? 'text-slate-600' : 'text-gray-400'}`}>or</span>
          <div className="flex-1 h-px" style={{ background: darkMode ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)' }} />
        </div>

        {/* Secondary: Website URL */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Globe className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`} />
            <input
              type="url"
              placeholder="Portfolio or website URL"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleWebsite()}
              className={`${inputClsFn(darkMode)} pl-10`}
              style={inputStyleFn(darkMode)}
            />
          </div>
          <button
            onClick={handleWebsite}
            disabled={!websiteUrl.trim()}
            className={`px-4 rounded-xl font-bold text-sm disabled:opacity-40 transition-colors ${darkMode ? 'bg-green-400 text-slate-950 hover:bg-green-300' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
          >
            Go
          </button>
        </div>

        {/* Tertiary: Paste */}
        <details className="group">
          <summary className={`text-sm cursor-pointer flex items-center gap-1.5 list-none select-none transition-colors ${darkMode ? 'text-slate-500 hover:text-slate-300' : 'text-gray-500 hover:text-gray-700'}`}>
            <FileText className="w-3.5 h-3.5" />
            Paste resume text instead
          </summary>
          <div className="mt-3 flex flex-col gap-2">
            <textarea
              rows={5}
              placeholder="Paste your resume text here..."
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              className={`${inputClsFn(darkMode)} resize-none`}
              style={inputStyleFn(darkMode)}
            />
            <GreenBtn onClick={handlePaste} disabled={pasteText.trim().length < 50} darkMode={darkMode}>
              Parse this →
            </GreenBtn>
          </div>
        </details>

        {mode === 'error' && pilotLines.length > 0 && (
          <p className="text-red-400 text-sm text-center">{pilotLines[pilotLines.length - 1]}</p>
        )}
      </div>
    );
  }

  // ── Parsing ──
  if (mode === 'parsing') {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <PilotLabel darkMode={darkMode} />
          <h2 className={`text-2xl lg:text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>On it.</h2>
        </div>
        <ThemedCard darkMode={darkMode} className="space-y-3 min-h-[160px]">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-5 h-5 spinner flex-shrink-0" />
            <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>Reading your profile...</span>
          </div>
          {pilotLines.map((line, i) => (
            <motion.p
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
              className={`text-sm pl-8 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}
            >
              {line}
            </motion.p>
          ))}
        </ThemedCard>
      </div>
    );
  }

  // ── Done ──
  if (mode === 'done' && parsedProfile) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-5">
        <div>
          <PilotLabel darkMode={darkMode} />
          <h2 className={`text-2xl lg:text-3xl font-bold leading-tight ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            Got it. Here's what I'm working with.
          </h2>
        </div>

        <ThemedCard darkMode={darkMode} className="space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className={`w-5 h-5 ${darkMode ? 'text-green-400' : 'text-emerald-500'}`} />
            <span className={`font-semibold text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>Profile read</span>
          </div>
          <div className="space-y-3">
            {parsedProfile.title && (
              <div className="flex gap-3">
                <span className={`text-sm w-24 shrink-0 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>Role</span>
                <span className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{parsedProfile.title}</span>
              </div>
            )}
            {parsedProfile.years_exp && (
              <div className="flex gap-3">
                <span className={`text-sm w-24 shrink-0 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>Experience</span>
                <span className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{parsedProfile.years_exp} years</span>
              </div>
            )}
            {parsedProfile.skills?.length > 0 && (
              <div className="flex gap-3 items-start">
                <span className={`text-sm w-24 shrink-0 mt-0.5 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>Skills</span>
                <div className="flex flex-wrap gap-1.5">
                  {parsedProfile.skills.slice(0, 8).map((s) => (
                    <span
                      key={s}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium ${darkMode ? 'text-green-400' : 'text-emerald-600'}`}
                      style={darkMode
                        ? { background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)' }
                        : { background: 'rgba(5,150,105,0.08)', border: '1px solid rgba(5,150,105,0.2)' }
                      }
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {(parsedProfile.candidate_edges?.length > 0 || parsedProfile.strongest_card) && (
              <div className="flex gap-3 items-start">
                <span className={`text-sm w-24 shrink-0 mt-1 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                  {(parsedProfile.candidate_edges?.length || 1) > 1 ? 'Your edges' : 'Your edge'}
                </span>
                <div className="flex flex-col gap-1.5">
                  {(parsedProfile.candidate_edges?.slice(0, 3) || [parsedProfile.strongest_card]).map((edge, i) => (
                    <span key={i} className={`text-sm leading-snug ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>{edge}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <p className={`text-xs ${darkMode ? 'text-slate-600' : 'text-gray-400'}`}>You can edit this in profile settings anytime.</p>
        </ThemedCard>

        <GreenBtn onClick={onNext} darkMode={darkMode}>
          Good, what's next? <ChevronRight className="w-4 h-4" />
        </GreenBtn>
      </motion.div>
    );
  }

  return null;
}

// ── Step 2: Target Roles + Preferences ────────────────────────
const INDIA_STATES = [
  'Mumbai', 'Delhi NCR', 'Bangalore', 'Hyderabad', 'Chennai', 'Pune', 'Kolkata', 'Ahmedabad', 'Gurgaon', 'Noida', 'Pan India',
];

function StepPreferences({ onNext, onPrefsSet, jobSearchTitles }) {
  const darkMode = useStore((s) => s.darkMode);
  const suitable = jobSearchTitles?.suitable || [];
  const maybe    = jobSearchTitles?.maybe    || [];

  const [roles, setRoles] = useState(suitable.slice(0, 3));
  const [maybeAdded, setMaybeAdded] = useState([]);
  const [roleInput, setRoleInput] = useState('');
  const [prefs, setPrefs] = useState({ locations: [], india_states: [], work_style: null, ic_or_lead: null });

  const addRole = () => {
    const trimmed = roleInput.trim();
    if (trimmed && roles.length < 5 && !roles.includes(trimmed)) setRoles((r) => [...r, trimmed]);
    setRoleInput('');
  };
  const removeRole = (r) => setRoles((prev) => prev.filter((x) => x !== r));

  const toggleMaybe = (title) => {
    if (roles.includes(title)) {
      setRoles((prev) => prev.filter((x) => x !== title));
      setMaybeAdded((prev) => prev.filter((x) => x !== title));
    } else if (roles.length < 5) {
      setRoles((prev) => [...prev, title]);
      setMaybeAdded((prev) => [...prev, title]);
    }
  };

  const toggleLocation = (val) =>
    setPrefs((p) => ({
      ...p,
      locations: p.locations.includes(val) ? p.locations.filter((l) => l !== val) : [...p.locations, val],
    }));
  const set = (key, val) => setPrefs((p) => ({ ...p, [key]: val }));

  const hasIndia = prefs.locations.includes('india');
  const indiaStatesRequired = hasIndia;
  const allSet = roles.length > 0 && prefs.locations.length > 0 && prefs.work_style && prefs.ic_or_lead && (!indiaStatesRequired || prefs.india_states.length > 0);

  const locationLabels = { india: 'India', usa: 'USA', canada: 'Canada', uk: 'UK', europe: 'Europe', thailand: 'Thailand', china: 'China', anywhere: 'Anywhere' };
  const workStyleLabel = { onsite: 'On-site.', hybrid: 'Hybrid.', remote: 'Remote.', open: "Flexible." };
  const pilotSummary = allSet
    ? `Looking for ${roles.slice(0, 2).join(' / ')}${roles.length > 2 ? ` +${roles.length - 2} more` : ''}. ${prefs.locations.map((l) => locationLabels[l]).join(' + ')}${hasIndia && prefs.india_states.length > 0 && !prefs.india_states.includes('Pan India') ? ` (${prefs.india_states.join(', ')})` : ''}. ${workStyleLabel[prefs.work_style || 'remote'] || ''} ${prefs.ic_or_lead === 'ic' ? 'IC track.' : prefs.ic_or_lead === 'lead' ? 'Leadership.' : 'IC or lead.'} On it.`
    : null;

  const maybeUnselected = maybe.filter((t) => !roles.includes(t));

  return (
    <div className="flex flex-col gap-7">
      <div>
        <PilotLabel darkMode={darkMode} />
        <h2 className={`text-2xl lg:text-3xl font-bold leading-tight ${darkMode ? 'text-white' : 'text-gray-900'}`}>I mapped your search.</h2>
        <p className={`mt-2 text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Confirm what looks right. Add more if needed.</p>
      </div>

      {/* Confirmed roles */}
      <div>
        <p className={`text-xs font-mono uppercase tracking-wider mb-3 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>Targeting</p>
        <div className="flex flex-wrap gap-2">
          {roles.map((r) => (
            <span
              key={r}
              className="flex items-center gap-1.5 bg-emerald-500 text-white text-sm font-semibold px-3 py-1.5 rounded-full"
            >
              {r}
              <button onClick={() => removeRole(r)} className="opacity-60 hover:opacity-100 leading-none font-bold">&times;</button>
            </span>
          ))}
        </div>
        {roles.length === 0 && <p className={`text-xs mt-1 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>All removed — add titles below.</p>}
      </div>

      {/* Maybe titles */}
      {maybeUnselected.length > 0 && (
        <div>
          <p className={`text-xs font-mono uppercase tracking-wider mb-1 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>Worth exploring?</p>
          <p className={`text-xs mb-3 ${darkMode ? 'text-slate-600' : 'text-gray-500'}`}>Based on your background — tap to add</p>
          <div className="flex flex-wrap gap-2">
            {maybeUnselected.map((title) => (
              <button
                key={title}
                onClick={() => toggleMaybe(title)}
                disabled={roles.length >= 5}
                className={`flex items-center gap-1 text-sm font-medium px-3 py-1.5 rounded-full transition-colors disabled:opacity-40 ${darkMode ? 'text-green-400 hover:bg-green-400/10' : 'text-emerald-600 hover:bg-emerald-50'}`}
                style={{ border: darkMode ? '1px dashed rgba(74,222,128,0.35)' : '1px dashed rgba(16,185,129,0.4)' }}
              >
                <span className="text-base leading-none">+</span> {title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Custom add */}
      {roles.length < 5 && (
        <div>
          <p className={`text-xs font-mono uppercase tracking-wider mb-3 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>Add your own</p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. Growth Lead, Chief of Staff…"
              value={roleInput}
              onChange={(e) => setRoleInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addRole(); } }}
              className={inputClsFn(darkMode)}
              style={inputStyleFn(darkMode)}
            />
            <button
              onClick={addRole}
              disabled={!roleInput.trim()}
              className="px-4 rounded-xl bg-emerald-500 text-white font-bold text-sm disabled:opacity-40 hover:bg-emerald-600 transition-colors shrink-0"
            >
              Add
            </button>
          </div>
          <p className={`text-xs mt-1.5 ${darkMode ? 'text-slate-600' : 'text-gray-400'}`}>Up to 5 titles total.</p>
        </div>
      )}

      {/* Location */}
      <div>
        <p className={`text-xs font-mono uppercase tracking-wider mb-3 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>Where?</p>
        <div className="flex flex-wrap gap-2">
          {[
            { val: 'india',    label: '🇮🇳 India' },
            { val: 'usa',      label: '🇺🇸 USA' },
            { val: 'canada',   label: '🇨🇦 Canada' },
            { val: 'uk',       label: '🇬🇧 UK' },
            { val: 'europe',   label: '🇪🇺 Europe' },
            { val: 'thailand', label: '🇹🇭 Thailand' },
            { val: 'china',    label: '🇨🇳 China' },
            { val: 'anywhere', label: '🌍 Anywhere' },
          ].map(({ val, label }) => (
            <button
              key={val}
              onClick={() => toggleLocation(val)}
              className={chipClsFn(prefs.locations.includes(val), darkMode)}
              style={chipStyleFn(prefs.locations.includes(val), darkMode)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* India States — show when India is selected */}
      <AnimatePresence>
        {hasIndia && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
          >
            <p className={`text-xs font-mono uppercase tracking-wider mb-1 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>Which states / cities?</p>
            <p className={`text-xs mb-3 ${darkMode ? 'text-slate-600' : 'text-gray-500'}`}>Select one or more. &quot;Pan India&quot; covers all.</p>
            <div className="flex flex-wrap gap-2">
              {INDIA_STATES.map((state) => (
                <button
                  key={state}
                  onClick={() => {
                    if (state === 'Pan India') {
                      setPrefs((p) => ({ ...p, india_states: p.india_states.includes('Pan India') ? [] : ['Pan India'] }));
                    } else {
                      setPrefs((p) => {
                        const without = p.india_states.filter((s) => s !== 'Pan India');
                        return { ...p, india_states: without.includes(state) ? without.filter((s) => s !== state) : [...without, state] };
                      });
                    }
                  }}
                  className={chipClsFn(prefs.india_states.includes(state), darkMode)}
                  style={chipStyleFn(prefs.india_states.includes(state), darkMode)}
                >
                  {state}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Work Style */}
      <div>
        <p className={`text-xs font-mono uppercase tracking-wider mb-3 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>How do you want to work?</p>
        <div className="grid grid-cols-4 gap-2">
          {[
            { val: 'onsite', label: 'On-site' },
            { val: 'remote', label: 'Remote' },
            { val: 'hybrid', label: 'Hybrid' },
            { val: 'open',   label: "Doesn't matter" },
          ].map(({ val, label }) => (
            <button
              key={val}
              onClick={() => set('work_style', val)}
              className={chipClsFn(prefs.work_style === val, darkMode)}
              style={chipStyleFn(prefs.work_style === val, darkMode)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* IC or Lead */}
      <div>
        <p className={`text-xs font-mono uppercase tracking-wider mb-3 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>IC or leadership?</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { val: 'ic',   label: 'IC — head down, ship fast' },
            { val: 'lead', label: 'Lead — own a team' },
            { val: 'both', label: 'Open to both' },
          ].map(({ val, label }) => (
            <button
              key={val}
              onClick={() => set('ic_or_lead', val)}
              className={chipClsFn(prefs.ic_or_lead === val, darkMode)}
              style={chipStyleFn(prefs.ic_or_lead === val, darkMode)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Pilot confirmation */}
      <AnimatePresence>
        {pilotSummary && (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`text-sm font-medium ${darkMode ? 'text-green-400' : 'text-emerald-600'}`}
          >
            {pilotSummary}
          </motion.p>
        )}
      </AnimatePresence>

      <GreenBtn
        onClick={() => { onPrefsSet({ ...prefs, target_roles: roles }); onNext(); }}
        disabled={!allSet}
        darkMode={darkMode}
      >
        Let's go <ChevronRight className="w-4 h-4" />
      </GreenBtn>
    </div>
  );
}

// ── Step 3: Scanning ───────────────────────────────────────────
function StepScanning({ onFinish, parsedProfile, preferences }) {
  const darkMode = useStore((s) => s.darkMode);
  const [lines, setLines] = useState([]);
  const [phase, setPhase] = useState('scanning');

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const firstName = parsedProfile?.name?.split(' ')[0] || 'Hey';
      const sourceMap = { india: 'Cutshort, Naukri, Instahyre', usa: 'Wellfound, YC, Greenhouse', canada: 'Greenhouse, Lever', uk: 'UK boards', europe: 'EU boards', thailand: 'APAC boards', china: 'APAC boards', anywhere: 'every source I have' };
      const locs = preferences?.locations || [];
      const locationLabel = locs.length === 0 ? 'every source I have' : locs.map((l) => sourceMap[l] || l).join(' + ');
      const workStyleMap = { remote: 'Remote only.', hybrid: 'Hybrid setups.', onsite: 'On-site roles.', open: 'Any work style.' };
      const workStyleNarration = workStyleMap[preferences?.work_style] || '';
      const trackLabel = preferences?.ic_or_lead === 'ic' ? 'IC roles only. No management titles.' : preferences?.ic_or_lead === 'lead' ? 'Leadership tracks. Team ownership roles.' : 'IC and lead. Full spread.';
      const targetRoles = preferences?.target_roles || [];
      const roleLabel = targetRoles.length > 0 ? targetRoles.join(', ') : 'roles matching your background';

      const scanLines = [
        `Alright, ${firstName}. Targeting ${roleLabel}.`,
        `Hitting ${locationLabel}.${workStyleNarration ? ' ' + workStyleNarration : ''}`,
        trackLabel,
        'Cross-referencing against your profile. Filtering the noise.',
        'Profile locked in. First scan queued.',
      ];

      for (let i = 0; i < scanLines.length; i++) {
        if (cancelled) return;
        await new Promise((r) => setTimeout(r, 600 + i * 300));
        setLines((prev) => [...prev, scanLines[i]]);
      }

      fetch('/api/onboarding/save-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: parsedProfile, preferences }),
      }).catch(() => {});

      await new Promise((r) => setTimeout(r, 600));
      if (!cancelled) setPhase('done');
    }

    run();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <PilotLabel darkMode={darkMode} />
        <h2 className={`text-2xl lg:text-3xl font-bold leading-tight ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          {phase === 'scanning' ? 'Scanning now.' : "You're in."}
        </h2>
      </div>

      <ThemedCard darkMode={darkMode} className="space-y-3 min-h-[200px]">
        {phase === 'scanning' && (
          <div className="flex items-center gap-3 mb-1">
            <div className="w-4 h-4 spinner flex-shrink-0" />
            <span className={`text-xs font-mono ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>Live scanning...</span>
          </div>
        )}
        {lines.map((line, i) => (
          <motion.p
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className={`text-sm ${i === lines.length - 1 && phase === 'done' ? (darkMode ? 'text-white font-semibold' : 'text-gray-900 font-semibold') : (darkMode ? 'text-slate-400' : 'text-gray-500')}`}
          >
            {line}
          </motion.p>
        ))}
      </ThemedCard>

      {phase === 'done' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
          <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
            First scan runs in the background. Matches land within the hour — I'll notify you.
          </p>
          <GreenBtn onClick={onFinish} darkMode={darkMode}>
            <Zap className="w-4 h-4" /> Go to dashboard
          </GreenBtn>
        </motion.div>
      )}
    </div>
  );
}

// ── Main Onboarding Page ───────────────────────────────────────
export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingInner />
    </Suspense>
  );
}

function OnboardingInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const darkMode = useStore((s) => s.darkMode);

  // If ?skip=1, profile was already parsed during signup — start at step 2
  const skipImport = searchParams.get('skip') === '1';
  const [step, setStep] = useState(skipImport ? 2 : 1);
  const [parsedProfile, setParsedProfile] = useState(null);
  const [preferences, setPreferences] = useState(null);
  const [ready, setReady] = useState(false);

  const totalSteps = skipImport ? 2 : TOTAL_STEPS;
  const displayStep = skipImport ? step - 1 : step; // Show 1/2 or 2/2 when skipping

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.replace('/auth/login'); return; }
      setReady(true);

      // If skipping import, load parsed profile from DB for job_search_titles
      if (skipImport) {
        supabase.from('profiles').select('parsed_json').eq('user_id', user.id).maybeSingle()
          .then(({ data }) => {
            if (data?.parsed_json) setParsedProfile(data.parsed_json);
          });

        // Check for manual data from signup
        try {
          const manualRaw = sessionStorage.getItem('careerpilot_manual');
          if (manualRaw) {
            const manual = JSON.parse(manualRaw);
            // Build a minimal parsed profile from manual data
            setParsedProfile({
              name: manual.name,
              title: manual.title,
              years_exp: parseInt(manual.years_exp) || null,
              skills: manual.skills ? manual.skills.split(',').map(s => s.trim()).filter(Boolean) : [],
              job_search_titles: { suitable: [manual.title], maybe: [], excluded: [] },
            });
            sessionStorage.removeItem('careerpilot_manual');
          }
        } catch {}
      }
    });
  }, []);

  if (!ready) return null;

  const next = () => setStep((s) => s + 1);
  const finish = () => router.replace('/dashboard');

  const variants = {
    enter:  { opacity: 0, x: 32 },
    center: { opacity: 1, x: 0 },
    exit:   { opacity: 0, x: -32 },
  };

  return (
    <div className={`min-h-dvh flex flex-col ${darkMode ? 'lp-root' : 'bg-white text-gray-900'}`} style={{ fontFamily: "'Outfit', -apple-system, sans-serif" }}>

      {/* ── Header ── */}
      <header className={`border-b px-5 py-3.5 flex items-center justify-between sticky top-0 z-40 ${darkMode ? 'glass-nav border-white/[0.06]' : 'bg-white/95 backdrop-blur border-gray-200'}`}>
        <Link href="/" className={`flex items-center gap-2 font-bold text-base tracking-tight ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          <div className="w-[26px] h-[26px] rounded-[7px] bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-[13px] font-extrabold text-white">
            C
          </div>
          CareerPilot
        </Link>
        <span className={`text-sm font-mono ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>{displayStep} / {totalSteps}</span>
      </header>

      {/* ── Progress bar ── */}
      <div className="h-0.5 w-full" style={{ background: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)' }}>
        <motion.div
          className="h-full bg-emerald-500"
          initial={false}
          animate={{ width: `${(displayStep / totalSteps) * 100}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>

      {/* ── Step content ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-5 py-10 lg:py-14">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.28 }}
            >
              {step === 1 && <StepImport onNext={next} onProfileParsed={(p) => setParsedProfile(p)} />}
              {step === 2 && (skipImport && !parsedProfile ? (
                <div className="flex items-center justify-center py-20">
                  <div className="flex items-center gap-2">
                    <div className="spinner w-5 h-5" />
                    <span className={`text-sm ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>Loading your profile...</span>
                  </div>
                </div>
              ) : (
                <StepPreferences onNext={next} onPrefsSet={(p) => setPreferences(p)} jobSearchTitles={parsedProfile?.job_search_titles} />
              ))}
              {step === 3 && <StepScanning onFinish={finish} parsedProfile={parsedProfile} preferences={preferences} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
