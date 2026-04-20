'use client';

/**
 * TailorV2Review — single-screen v2 pipeline UX inside ResumeTailorSheet.
 *
 * Flow:
 *   loading → composition result → (background) gap analysis → score delta
 *   → if score < 88: targeted questions from missing_signals
 *     → user answers → refine → updated bullets in place
 *   → Generate PDF
 *
 * Props:
 *   matchId       — string
 *   baseResume    — original structured_resume (for before/after diff)
 *   onPdfReady    — (url: string) => void
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Loader2, FileText, RotateCcw, AlertTriangle,
  ChevronDown, ChevronUp, Quote, Info, TrendingUp, CheckCircle2,
} from 'lucide-react';

const SCORE_THRESHOLD = 88; // below this → show gap questions

const NARRATION = [
  'Reading the job description…',
  'Picking the story for this one…',
  'Choosing your strongest atoms…',
  'Writing bullets in your voice…',
  'Double-checking every number…',
];

// ── Sub-components ──────────────────────────────────────────────

function Narration() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => Math.min(x + 1, NARRATION.length - 1)), 1800);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="px-5 py-12 flex flex-col items-center gap-4">
      <Sparkles className="w-10 h-10 text-emerald-500 animate-pulse" />
      <AnimatePresence mode="wait">
        <motion.p
          key={i}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25 }}
          className="text-sm text-gray-600 dark:text-gray-300 text-center"
        >
          {NARRATION[i]}
        </motion.p>
      </AnimatePresence>
      <div className="flex gap-1.5 mt-1">
        {NARRATION.map((_, idx) => (
          <div key={idx} className={`w-1.5 h-1.5 rounded-full transition-colors ${idx <= i ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-slate-700'}`} />
        ))}
      </div>
    </div>
  );
}

function ReuseOffer({ result, onUseReused, onRegenerate }) {
  const total = result.bullets_by_role.reduce((s, r) => s + r.bullets.length, 0);
  return (
    <div className="px-5 py-6 space-y-4">
      <div className="card p-4 bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">You've tailored for this kind of role recently.</p>
            <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">
              Pilot already wrote {total} bullets for the <span className="font-medium">{result.cluster.cluster_id}</span> story. Reuse them, or burn a fresh pass.
            </p>
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <button onClick={onUseReused} className="btn-gradient w-full py-3.5 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2">
          <FileText className="w-4 h-4" /> Use these bullets
        </button>
        <button onClick={onRegenerate} className="w-full py-3 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 font-medium text-sm hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors flex items-center justify-center gap-2">
          <RotateCcw className="w-4 h-4" /> Regenerate from scratch
        </button>
      </div>
    </div>
  );
}

function ScoreDelta({ baseScore, newScore }) {
  const delta = newScore - baseScore;
  const isUp = delta > 0;
  const color = newScore >= SCORE_THRESHOLD
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-amber-600 dark:text-amber-400';
  const bg = newScore >= SCORE_THRESHOLD
    ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800'
    : 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`card p-3.5 border ${bg} flex items-center gap-3`}
    >
      <TrendingUp className={`w-5 h-5 shrink-0 ${color}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          Resume match:{' '}
          <span className="line-through text-gray-400 font-normal">{baseScore}%</span>
          {' → '}
          <span className={color}>{newScore}%</span>
          {isUp && <span className={`ml-1 text-xs font-bold ${color}`}>+{delta}</span>}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {newScore >= SCORE_THRESHOLD
            ? 'Strong match — ready to generate.'
            : 'A few more signals could push this higher.'}
        </p>
      </div>
    </motion.div>
  );
}

function GapQuestions({ questions, onSubmit, loading }) {
  const [answers, setAnswers] = useState(() => Object.fromEntries(questions.map((q, i) => [i, ''])));

  const hasAnyAnswer = Object.values(answers).some((a) => a.trim().length > 3);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div className="flex items-start gap-2">
        <Sparkles className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
        <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
          Pilot spotted a few gaps. Answer what's true for you — skip anything that doesn't apply.
        </p>
      </div>

      <div className="space-y-3">
        {questions.map((q, i) => (
          <div key={i} className="space-y-1.5">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 leading-snug">{q.question}</p>
            <textarea
              rows={2}
              placeholder={q.placeholder || 'Your answer…'}
              value={answers[i]}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [i]: e.target.value }))}
              className="input-field w-full text-sm resize-none py-2 leading-relaxed"
            />
          </div>
        ))}
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => {
            const filled = questions
              .map((q, i) => ({ question: q.question, answer: answers[i] }))
              .filter((a) => a.answer.trim().length > 3);
            onSubmit(filled);
          }}
          disabled={!hasAnyAnswer || loading}
          className="btn-gradient flex-1 py-3 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Re-composing…</> : <>
            <Sparkles className="w-4 h-4" /> Strengthen resume
          </>}
        </button>
        <button
          onClick={() => onSubmit([])}
          disabled={loading}
          className="px-4 py-3 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 text-sm font-medium hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
        >
          Skip
        </button>
      </div>
    </motion.div>
  );
}

function BulletPair({ composed, originalText }) {
  const [showCites, setShowCites] = useState(false);
  const v = composed.validation || {};
  const isClean = v.ok !== false;
  const isOver = v.over_budget;
  const isNew = composed.is_new;

  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <p className={`text-sm leading-relaxed ${isNew ? 'text-emerald-800 dark:text-emerald-200' : 'text-gray-800 dark:text-gray-100'}`}>
            {composed.text}
            {isNew && <span className="ml-1.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-full">new</span>}
          </p>
          <div className="flex items-center gap-3 mt-1">
            {!isClean && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                <AlertTriangle className="w-3 h-3" /> needs review
              </span>
            )}
            {isOver && <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">{v.word_count}w (over 22)</span>}
            {(composed.cited_atom_ids || []).length > 0 && (
              <button onClick={() => setShowCites((s) => !s)} className="text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                <Quote className="w-2.5 h-2.5" />
                {composed.cited_atom_ids.length} source{composed.cited_atom_ids.length > 1 ? 's' : ''}
              </button>
            )}
          </div>
        </div>
      </div>
      <AnimatePresence>
        {showCites && (composed.source_atom_facts || []).length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="ml-2 pl-3 border-l-2 border-blue-200 dark:border-blue-800 space-y-1 py-1">
              {composed.source_atom_facts.map((fact, i) => (
                <p key={i} className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed italic">"{fact}"</p>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {originalText && originalText !== composed.text && (
        <p className="text-[11px] text-gray-400 dark:text-gray-500 line-through leading-snug pl-2">was: {originalText}</p>
      )}
    </div>
  );
}

function RoleBlock({ role, originalEntry }) {
  return (
    <div className="card p-3.5 space-y-3">
      <div>
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{role.role}</p>
        <p className="text-xs text-gray-500">{role.company}</p>
      </div>
      <div className="space-y-3 pl-1 border-l-2 border-emerald-200 dark:border-emerald-800/60">
        {role.bullets.map((b, i) => (
          <div key={i} className="pl-3">
            <BulletPair composed={b} originalText={originalEntry?.bullets?.[i]?.text} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────

export default function TailorV2Review({ matchId, baseResume, onPdfReady }) {
  const [phase, setPhase] = useState('loading');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [showDropped, setShowDropped] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Gap analysis state
  const [baseScore, setBaseScore] = useState(null);      // original match score
  const [tailoredScore, setTailoredScore] = useState(null);
  const [gapQuestions, setGapQuestions] = useState(null); // null = not ready, [] = none/skip
  const [gapLoading, setGapLoading] = useState(false);    // re-composing after answers

  const runningGapRef = useRef(false);

  // Run the orchestrator on mount
  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;
    (async () => {
      try {
        // Kick off base score fetch in parallel with composition
        const [compRes, baseRes] = await Promise.all([
          fetch('/api/ai/resume-tailor-v2', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ match_id: matchId }),
          }),
          fetch(`/api/jobs/matches/${matchId}`),
        ]);

        if (!compRes.ok) {
          const err = await compRes.json().catch(() => ({}));
          throw new Error(err.error || `Failed (${compRes.status})`);
        }
        const data = await compRes.json();
        if (cancelled) return;

        // Extract base match score from jobs match
        if (baseRes.ok) {
          const baseData = await baseRes.json().catch(() => ({}));
          setBaseScore(baseData.match?.match_score || null);
        }

        setResult(data);
        setPhase(data.reused ? 'reuse_offer' : 'review');

        // Background gap analysis against the v2 tailored version
        if (!data.reused && data.tailored_resume_id) {
          runGapAnalysis(data.tailored_resume_id, cancelled);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e.message);
        setPhase('error');
      }
    })();
    return () => { cancelled = true; };
  }, [matchId]);

  const runGapAnalysis = useCallback(async (tailoredResumeId, cancelled = false) => {
    if (runningGapRef.current) return;
    runningGapRef.current = true;
    try {
      const res = await fetch('/api/ai/resume-gap-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ match_id: matchId, tailored_resume_id: tailoredResumeId, force_fresh: true }),
      });
      if (!res.ok || cancelled) return;
      const data = await res.json();
      if (cancelled) return;

      const score = data.resume_strength || 0;
      setTailoredScore(score);

      if (score >= SCORE_THRESHOLD) {
        setGapQuestions([]); // strong enough, no questions needed
      } else {
        // Derive pointed questions from missing_signals
        const signals = (data.missing_signals || []).slice(0, 3);
        if (!signals.length) { setGapQuestions([]); return; }
        const questions = signals.map((s) => ({
          question: signalToQuestion(s.gap),
          placeholder: s.suggestion || 'Briefly describe your experience…',
        }));
        setGapQuestions(questions);
      }
    } catch {
      setGapQuestions([]); // gap analysis failed — skip questions silently
    } finally {
      runningGapRef.current = false;
    }
  }, [matchId]);

  // Convert a gap string like "No B2B SaaS experience shown" into a question
  function signalToQuestion(gap) {
    const g = gap.toLowerCase();
    // Common patterns → direct question
    if (g.includes('b2b') || g.includes('saas')) return 'Have you shipped any B2B SaaS or enterprise product? Briefly describe.';
    if (g.includes('0-to-1') || g.includes('0→1') || g.includes('greenfield') || g.includes('early-stage')) return 'Any 0-to-1 or greenfield product you built from scratch?';
    if (g.includes('team') || g.includes('manag') || g.includes('lead')) return 'Have you managed a team or led cross-functional groups? What size?';
    if (g.includes('data') || g.includes('analytic') || g.includes('metric')) return 'Any data-driven wins — experiments run, metrics owned, dashboards built?';
    if (g.includes('technical') || g.includes('engineer') || g.includes('api') || g.includes('infra')) return 'How closely have you worked with engineering? Any technical projects you co-owned?';
    if (g.includes('growth') || g.includes('acquisition') || g.includes('retention')) return 'Any growth or retention work — experiments, funnels, activation improvements?';
    if (g.includes('stakeholder') || g.includes('executive') || g.includes('c-suite')) return 'Have you presented to or aligned with senior leadership / C-suite?';
    if (g.includes('payment') || g.includes('fintech') || g.includes('financial')) return 'Any experience with payments, financial products, or fintech?';
    if (g.includes('mobile') || g.includes('app')) return "Any mobile app product experience beyond what's on your resume?";
    // Fallback: rephrase the gap as a question
    return `Can you add context on: ${gap}?`;
  }

  async function handleAnswersSubmit(filledAnswers) {
    if (!filledAnswers.length) {
      setGapQuestions([]); // user skipped
      return;
    }
    setGapLoading(true);
    try {
      const res = await fetch('/api/ai/resume-tailor-v2/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          match_id: matchId,
          tailored_resume_id: result.tailored_resume_id,
          answers: filledAnswers,
        }),
      });
      if (!res.ok) throw new Error('Refine failed');
      const data = await res.json();
      if (data.skipped) { setGapQuestions([]); return; }

      // Replace bullets in place
      setResult((prev) => ({ ...prev, bullets_by_role: data.bullets_by_role }));
      setGapQuestions([]); // hide questions

      // Re-run gap analysis to get updated score
      runningGapRef.current = false;
      await runGapAnalysis(result.tailored_resume_id);
    } catch (e) {
      console.error('[TailorV2Review] refine failed:', e);
      setGapQuestions([]); // fallback: hide questions, let user proceed
    } finally {
      setGapLoading(false);
    }
  }

  async function regenerateFresh() {
    setPhase('loading');
    setGapQuestions(null);
    setTailoredScore(null);
    runningGapRef.current = false;
    try {
      const res = await fetch('/api/ai/resume-tailor-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Force-Fresh': '1' },
        body: JSON.stringify({ match_id: matchId }),
      });
      const data = await res.json();
      setResult(data);
      setPhase(data.reused ? 'reuse_offer' : 'review');
      if (!data.reused && data.tailored_resume_id) runGapAnalysis(data.tailored_resume_id);
    } catch (e) {
      setError(e.message);
      setPhase('error');
    }
  }

  async function handleGeneratePdf() {
    if (!result?.tailored_resume_id) return;
    setPdfLoading(true);
    try {
      const res = await fetch('/api/ai/resume-generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tailored_resume_id: result.tailored_resume_id, template: 'clean' }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'PDF generation failed');
      }
      const data = await res.json();
      onPdfReady?.(data.pdf_url);
    } catch (e) {
      setError(`PDF generation failed: ${e.message}`);
    } finally {
      setPdfLoading(false);
    }
  }

  const originalByRole = useMemo(() => {
    const map = new Map();
    for (const e of baseResume?.experience || []) {
      map.set(`${(e.company || '').toLowerCase()}::${(e.title || '').toLowerCase()}`, e);
    }
    return map;
  }, [baseResume]);

  if (phase === 'loading') return <Narration />;

  if (phase === 'error') {
    return (
      <div className="px-5 py-8 space-y-3">
        <div className="card p-4 bg-red-50 dark:bg-red-900/15 border border-red-200 dark:border-red-800">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Hit a wall — not you, it's me.</p>
              <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'reuse_offer') {
    return (
      <ReuseOffer
        result={result}
        onUseReused={() => {
          setPhase('review');
          if (result.tailored_resume_id) runGapAnalysis(result.tailored_resume_id);
        }}
        onRegenerate={regenerateFresh}
      />
    );
  }

  const stats = result.stats || {};
  const dropped = result.selection_dropped || [];
  const gapReady = gapQuestions !== null;
  const showQuestions = gapReady && gapQuestions.length > 0;
  const showScoreDelta = tailoredScore !== null && baseScore !== null;

  return (
    <div className="px-5 py-5 space-y-5">
      {/* Story brief */}
      <div className="card p-4 bg-gradient-to-br from-emerald-50/60 to-blue-50/40 dark:from-emerald-900/10 dark:to-blue-900/10">
        <div className="flex items-center gap-1.5 mb-2">
          <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            Pilot&apos;s angle for this job
          </p>
        </div>
        <p className="text-[13px] text-gray-700 dark:text-gray-200 leading-relaxed">{result.brief?.positioning}</p>
        {result.brief?.key_themes?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {result.brief.key_themes.map((t) => (
              <span key={t} className="tag-pill bg-white/70 dark:bg-slate-800/60 text-gray-700 dark:text-gray-300 text-[10px] border border-gray-200 dark:border-slate-700">{t}</span>
            ))}
          </div>
        )}
      </div>

      {/* Stats strip */}
      <div className="flex items-center gap-4 text-[11px] text-gray-500 dark:text-gray-400 border-y border-gray-100 dark:border-slate-800 py-2">
        <span><strong className="text-gray-700 dark:text-gray-200">{stats.bullets_total}</strong> bullets</span>
        <span><strong className="text-gray-700 dark:text-gray-200">{stats.atoms_selected}/{stats.atoms_total}</strong> atoms used</span>
        {stats.bullets_failed > 0 && <span className="text-amber-600 dark:text-amber-400"><strong>{stats.bullets_failed}</strong> need review</span>}
      </div>

      {/* Per-role bullet blocks */}
      <div className="space-y-3">
        {result.bullets_by_role.map((role) => {
          const key = `${(role.company || '').toLowerCase()}::${(role.role || '').toLowerCase()}`;
          return <RoleBlock key={key} role={role} originalEntry={originalByRole.get(key)} />;
        })}
      </div>

      {/* Score delta — appears as soon as gap analysis returns */}
      <AnimatePresence>
        {showScoreDelta && (
          <ScoreDelta baseScore={baseScore} newScore={tailoredScore} />
        )}
      </AnimatePresence>

      {/* Gap questions — show if score below threshold */}
      <AnimatePresence>
        {showQuestions && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <GapQuestions
              questions={gapQuestions}
              onSubmit={handleAnswersSubmit}
              loading={gapLoading}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading state for gap analysis (score not yet returned) */}
      {!gapReady && (
        <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Checking how well this matches the job…
        </div>
      )}

      {/* Dropped atoms audit */}
      {dropped.length > 0 && (
        <div className="border-t border-gray-100 dark:border-slate-800 pt-3">
          <button onClick={() => setShowDropped((s) => !s)} className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            {showDropped ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            <Info className="w-3.5 h-3.5" />
            {dropped.length} atom{dropped.length > 1 ? 's' : ''} left out
          </button>
          <AnimatePresence>
            {showDropped && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="mt-2 space-y-1.5 pl-1">
                  {dropped.map((d) => (
                    <div key={d.id} className="flex items-start gap-2 text-[11px]">
                      <span className="font-mono text-gray-400 mt-0.5">[{d.reason}]</span>
                      <span className="text-gray-500 dark:text-gray-400 leading-snug flex-1">{d.fact}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Generate PDF — always visible at the bottom */}
      <button
        onClick={handleGeneratePdf}
        disabled={pdfLoading || gapLoading}
        className="btn-gradient w-full py-3.5 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {pdfLoading
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating PDF…</>
          : <><FileText className="w-4 h-4" /> Generate PDF</>
        }
      </button>
    </div>
  );
}
