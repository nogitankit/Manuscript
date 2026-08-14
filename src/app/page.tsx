"use client";

import { useState, useRef, useCallback } from "react";
import { Loader2, ScanText, AlertTriangle, ChevronRight } from "lucide-react";

// ─── Types (matching the actual API response from /api/analyze) ────────────────

interface BreakdownItem {
  id: string;
  label: string;
  category: string;
  hitCount: number;
}

interface SentenceResult {
  text: string;
  score: number;
  triggeredRules: string[]; // format: "RULE-ID: Rule label"
}

interface AnalysisResult {
  overallScore: number;
  breakdown: BreakdownItem[];
  sentences: SentenceResult[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  vocabulary: "Vocabulary",
  structural: "Structure",
  formatting: "Formatting",
  communication: "Communication",
};

const CATEGORY_ORDER = ["vocabulary", "structural", "formatting", "communication"];

function scoreLabel(score: number): { label: string; color: string } {
  if (score > 75) return { label: "Very likely AI", color: "text-amber-700" };
  if (score > 50) return { label: "Likely AI", color: "text-amber-600" };
  if (score > 25) return { label: "Uncertain", color: "text-stone-500" };
  return { label: "Likely Human", color: "text-stone-400" };
}

function sentenceHighlightClass(score: number): string {
  if (score > 50)
    return "bg-amber-100/80 border-b border-amber-300 text-amber-950 cursor-pointer";
  if (score > 20)
    return "bg-stone-200/50 text-stone-900 cursor-pointer";
  return "text-stone-800 cursor-default";
}

/** Parse a triggeredRules string array into structured objects */
function parseRule(tag: string): { id: string; label: string } {
  const colonIdx = tag.indexOf(":");
  if (colonIdx === -1) return { id: tag, label: tag };
  return {
    id: tag.slice(0, colonIdx).trim(),
    label: tag.slice(colonIdx + 1).trim(),
  };
}

/** Group breakdown items by category, sorted by hitCount desc within each group */
function groupBreakdown(breakdown: BreakdownItem[]) {
  const groups: Record<string, BreakdownItem[]> = {};
  for (const item of breakdown) {
    const key = item.category in CATEGORY_LABELS ? item.category : "vocabulary";
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  // Sort each group by hitCount descending
  for (const key in groups) {
    groups[key].sort((a, b) => b.hitCount - a.hitCount);
  }
  return groups;
}

const SAMPLE_TEXT = `In conclusion, it is important to note that leveraging a holistic and multifaceted approach is paramount to the achievement of our strategic objectives. Furthermore, it is widely recognized that robust frameworks foster seamless alignment across all stakeholder groups. Additionally, this comprehensive solution ensures that every deliverable is both scalable and actionable. Moving forward, we must recognize the transformative potential of our innovative methodology. As demonstrated above, the nuanced interplay between cutting-edge paradigms and groundbreaking initiatives underscores our commitment to excellence. It cannot be overstated that the implementation of these state-of-the-art benchmarks will facilitate the development of a more synergistic ecosystem.`;

// ─── Sub-components ────────────────────────────────────────────────────────────

function ScoreDial({ score }: { score: number }) {
  const { label, color } = scoreLabel(score);
  // Simple arc using SVG
  const radius = 48;
  const circumference = Math.PI * radius; // half-circle
  const pct = score / 100;
  const filled = pct * circumference;
  const empty = circumference - filled;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative">
        <svg width="120" height="68" viewBox="0 0 120 68" aria-label={`Overall score: ${score}`}>
          {/* Track */}
          <path
            d="M 12 60 A 48 48 0 0 1 108 60"
            fill="none"
            stroke="#e7e5e4"
            strokeWidth="6"
            strokeLinecap="round"
          />
          {/* Fill */}
          <path
            d="M 12 60 A 48 48 0 0 1 108 60"
            fill="none"
            stroke={score > 50 ? "#d97706" : "#a8a29e"}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${empty}`}
            style={{ transition: "stroke-dasharray 0.6s ease" }}
          />
          {/* Score text */}
          <text
            x="60"
            y="56"
            textAnchor="middle"
            fontSize="26"
            fontWeight="600"
            fill="#1c1917"
            fontFamily="var(--font-dm-sans)"
          >
            {score}
          </text>
        </svg>
      </div>
      <span className={`text-xs font-medium tracking-wide uppercase ${color}`}>
        {label}
      </span>
    </div>
  );
}

function RuleDetailPanel({
  sentence,
  onClose,
}: {
  sentence: SentenceResult;
  onClose: () => void;
}) {
  const rules = sentence.triggeredRules.map(parseRule);

  return (
    <div
      className="mt-3 border border-stone-200 bg-white"
      role="region"
      aria-label="Rule detail panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-stone-200 px-4 py-2.5">
        <span className="font-mono text-[10px] uppercase tracking-widest text-stone-400">
          {rules.length} rule{rules.length !== 1 ? "s" : ""} triggered
        </span>
        <button
          onClick={onClose}
          className="text-stone-300 hover:text-stone-600 transition-colors text-lg leading-none"
          aria-label="Close detail panel"
        >
          ×
        </button>
      </div>
      {/* Selected sentence */}
      <div className="border-b border-stone-100 px-4 py-3">
        <p className="text-[13px] text-stone-500 italic leading-relaxed">
          &ldquo;{sentence.text}&rdquo;
        </p>
      </div>
      {/* Rule list */}
      <ul className="divide-y divide-stone-100">
        {rules.map((r) => (
          <li key={r.id} className="flex items-start gap-3 px-4 py-2.5">
            <span className="mt-0.5 shrink-0 font-mono text-[10px] text-stone-400 w-10">
              {r.id}
            </span>
            <ChevronRight
              size={12}
              className="mt-1 shrink-0 text-amber-400"
              aria-hidden
            />
            <span className="text-[13px] text-stone-700 leading-snug">
              {r.label}
            </span>
          </li>
        ))}
      </ul>
      {/* Score badge */}
      <div className="flex justify-end border-t border-stone-100 px-4 py-2">
        <span className="font-mono text-[11px] text-stone-400">
          sentence score:{" "}
          <span className={sentence.score > 50 ? "text-amber-600 font-semibold" : "text-stone-600"}>
            {sentence.score}
          </span>
          /100
        </span>
      </div>
    </div>
  );
}

function HeatmapPane({
  sentences,
}: {
  sentences: SentenceResult[];
}) {
  const [activeSentence, setActiveSentence] = useState<SentenceResult | null>(null);

  const handleClick = useCallback(
    (s: SentenceResult) => {
      if (s.triggeredRules.length === 0) return;
      setActiveSentence((prev) => (prev?.text === s.text ? null : s));
    },
    []
  );

  return (
    <div>
      {/* Legend */}
      <div className="flex items-center gap-5 mb-4">
        <span className="font-mono text-[10px] uppercase tracking-widest text-stone-400">
          Legend
        </span>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 bg-amber-100 border-b border-amber-300" />
          <span className="text-[11px] text-stone-500">High AI risk (&gt;50)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 bg-stone-200/80" />
          <span className="text-[11px] text-stone-500">Moderate (21–50)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 border border-stone-200" />
          <span className="text-[11px] text-stone-500">Human (&le;20)</span>
        </div>
      </div>

      {/* Continuous paragraph heatmap */}
      <div
        className="leading-8 text-[15px] tracking-[-0.01em]"
        aria-label="Essay heatmap"
      >
        {sentences.map((s, i) => {
          const isActive = activeSentence?.text === s.text;
          const hasRules = s.triggeredRules.length > 0;
          return (
            <span key={i} className="inline">
              <span
                role={hasRules ? "button" : "text"}
                tabIndex={hasRules ? 0 : undefined}
                aria-pressed={hasRules ? isActive : undefined}
                onClick={() => handleClick(s)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") handleClick(s);
                }}
                className={`
                  inline transition-all duration-150
                  ${sentenceHighlightClass(s.score)}
                  ${isActive ? "ring-1 ring-amber-400 ring-offset-1" : ""}
                `}
              >
                {s.text}
              </span>
              {i < sentences.length - 1 ? " " : ""}
            </span>
          );
        })}
      </div>

      {/* Detail panel */}
      {activeSentence && (
        <RuleDetailPanel
          sentence={activeSentence}
          onClose={() => setActiveSentence(null)}
        />
      )}
    </div>
  );
}

function BreakdownPane({ breakdown }: { breakdown: BreakdownItem[] }) {
  if (breakdown.length === 0) return null;
  const groups = groupBreakdown(breakdown);

  return (
    <div className="grid grid-cols-1 gap-5">
      {CATEGORY_ORDER.filter((cat) => groups[cat]?.length).map((cat) => (
        <div key={cat}>
          {/* Category header */}
          <div className="flex items-center gap-2 mb-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-stone-400">
              {CATEGORY_LABELS[cat]}
            </span>
            <div className="flex-1 h-px bg-stone-200" />
            <span className="font-mono text-[10px] text-stone-400">
              {groups[cat].reduce((s, r) => s + r.hitCount, 0)} hits
            </span>
          </div>
          {/* Rule rows */}
          <ul className="space-y-1">
            {groups[cat].map((item) => (
              <li key={item.id} className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-stone-400 w-10 shrink-0">
                  {item.id}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-[12px] text-stone-600 leading-tight block truncate">
                    {item.label}
                  </span>
                </div>
                {/* Hit bar */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <div
                    className="h-1 bg-amber-300 min-w-[4px] transition-all"
                    style={{
                      width: `${Math.min(item.hitCount * 10, 60)}px`,
                    }}
                    aria-hidden
                  />
                  <span className="font-mono text-[10px] text-stone-400 w-4 text-right">
                    {item.hitCount}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function Home() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const charCount = text.length;
  const overLimit = charCount > 10_000;

  const handleAnalyze = async () => {
    if (!text.trim() || loading || overLimit) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "An error occurred.");
      } else {
        setResult(data as AnalysisResult);
        setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
      }
    } catch {
      setError("Could not reach the analysis server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handleAnalyze();
  };

  return (
    <div className="min-h-screen font-sans">
      {/* ── Top bar ───────────────────────────────────────────────────── */}
      <header className="border-b border-stone-200 bg-stone-50">
        <div className="max-w-screen-xl mx-auto px-6 py-4 flex items-baseline gap-3">
          <ScanText size={16} className="text-stone-400 mt-0.5 shrink-0" aria-hidden />
          <h1 className="font-serif text-[17px] tracking-tight text-stone-900">
            Manuscript
          </h1>
          <span className="text-stone-300 select-none">·</span>
          <span className="text-[12px] text-stone-400 tracking-wide">
            AI Essay Detector
          </span>
        </div>
      </header>

      {/* ── Two-column layout ──────────────────────────────────────────── */}
      <main className="max-w-screen-xl mx-auto px-6 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-0 lg:divide-x lg:divide-stone-200">

          {/* ── Left: Input ───────────────────────────────────────────── */}
          <section
            className="pr-0 lg:pr-10 pb-10 lg:pb-0 border-b border-stone-200 lg:border-b-0"
            aria-label="Essay input"
          >
            {/* Section label */}
            <div className="flex items-center gap-2 mb-5">
              <span className="font-mono text-[10px] uppercase tracking-widest text-stone-400">
                01 · Draft
              </span>
              <div className="flex-1 h-px bg-stone-200" />
            </div>

            <label htmlFor="essay-input" className="sr-only">
              Paste your essay or draft here
            </label>
            <textarea
              id="essay-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Paste your essay, abstract, or draft here…"
              className={`
                w-full h-[calc(100vh-340px)] min-h-[320px]
                bg-white border text-[14px] leading-7
                text-stone-800 placeholder:text-stone-300
                px-4 py-4 font-sans
                outline-none transition-colors duration-150
                ${overLimit
                  ? "border-red-300 focus:border-red-400"
                  : "border-stone-200 focus:border-stone-400"
                }
              `}
              aria-describedby="char-counter"
              spellCheck="false"
            />

            {/* Footer row */}
            <div className="mt-3 flex items-center justify-between gap-4">
              {/* Char counter */}
              <span
                id="char-counter"
                className={`font-mono text-[11px] tabular-nums ${
                  overLimit ? "text-red-500" : "text-stone-400"
                }`}
                aria-live="polite"
              >
                {charCount.toLocaleString()} / 10,000
                {overLimit && " — exceeds limit"}
              </span>

              <div className="flex items-center gap-3">
                {/* Sample button */}
                <button
                  type="button"
                  onClick={() => setText(SAMPLE_TEXT)}
                  className="text-[11px] text-stone-400 hover:text-stone-600 transition-colors underline underline-offset-2"
                  aria-label="Load sample AI-generated text"
                >
                  load sample
                </button>

                {/* Analyze button */}
                <button
                  id="analyze-button"
                  type="button"
                  onClick={handleAnalyze}
                  disabled={loading || !text.trim() || overLimit}
                  className={`
                    flex items-center gap-2
                    px-5 py-2.5
                    bg-stone-900 text-stone-50
                    text-[13px] font-medium tracking-wide
                    border border-stone-900
                    transition-all duration-150
                    disabled:opacity-40 disabled:cursor-not-allowed
                    not-disabled:hover:bg-stone-700 not-disabled:hover:border-stone-700
                    not-disabled:active:scale-[0.98]
                  `}
                  aria-label="Analyze draft for AI signals"
                  title="Analyze (⌘ Enter)"
                >
                  {loading ? (
                    <Loader2 size={14} className="animate-spin" aria-hidden />
                  ) : (
                    <ScanText size={14} aria-hidden />
                  )}
                  {loading ? "Analysing…" : "Analyze Draft"}
                </button>
              </div>
            </div>

            {/* Keyboard hint */}
            <p className="mt-2 text-right font-mono text-[10px] text-stone-300">
              ⌘ Enter to run
            </p>

            {/* Error state */}
            {error && (
              <div
                role="alert"
                className="mt-4 flex items-start gap-2 border border-red-200 bg-red-50 px-4 py-3"
              >
                <AlertTriangle
                  size={14}
                  className="shrink-0 mt-0.5 text-red-400"
                  aria-hidden
                />
                <p className="text-[13px] text-red-700">{error}</p>
              </div>
            )}
          </section>

          {/* ── Right: Results ────────────────────────────────────────── */}
          <section
            ref={resultRef}
            className="pl-0 lg:pl-10 pt-10 lg:pt-0"
            aria-label="Analysis results"
            aria-live="polite"
          >
            {/* Section label */}
            <div className="flex items-center gap-2 mb-5">
              <span className="font-mono text-[10px] uppercase tracking-widest text-stone-400">
                02 · Analysis
              </span>
              <div className="flex-1 h-px bg-stone-200" />
            </div>

            {/* Empty state */}
            {!result && !loading && (
              <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
                <div className="w-10 h-10 border border-stone-200 flex items-center justify-center">
                  <ScanText size={18} className="text-stone-300" aria-hidden />
                </div>
                <p className="text-[13px] text-stone-400 max-w-[220px] leading-relaxed">
                  Results will appear here after you analyze a draft.
                </p>
              </div>
            )}

            {/* Loading skeleton */}
            {loading && (
              <div className="space-y-4 animate-pulse" aria-label="Loading analysis">
                <div className="h-5 bg-stone-100 w-1/3" />
                <div className="h-3 bg-stone-100 w-full" />
                <div className="h-3 bg-stone-100 w-5/6" />
                <div className="h-3 bg-stone-100 w-4/5" />
                <div className="h-3 bg-stone-100 w-full" />
                <div className="h-3 bg-stone-100 w-2/3" />
              </div>
            )}

            {/* Result */}
            {result && (
              <div className="space-y-10">

                {/* ── Score header ─────────────────────────────── */}
                <div className="flex items-center gap-8 border-b border-stone-200 pb-8">
                  <ScoreDial score={result.overallScore} />
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-1">
                      AI Likelihood Score
                    </p>
                    <p className="font-serif text-[28px] leading-none text-stone-900">
                      {result.overallScore}
                      <span className="text-[16px] text-stone-400"> / 100</span>
                    </p>
                    <p className="mt-2 text-[12px] text-stone-400">
                      {result.sentences.length} sentences ·{" "}
                      {result.breakdown.length} rules triggered
                    </p>
                  </div>
                </div>

                {/* ── Breakdown ────────────────────────────────── */}
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-4">
                    Rule Breakdown
                  </p>
                  <BreakdownPane breakdown={result.breakdown} />
                </div>

                {/* ── Heatmap ──────────────────────────────────── */}
                <div>
                  <div className="flex items-baseline justify-between mb-4">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400">
                      Sentence Heatmap
                    </p>
                    <span className="text-[11px] text-stone-400">
                      Click a highlighted sentence to inspect rules
                    </span>
                  </div>
                  <div className="border border-stone-200 bg-white px-5 py-5">
                    <HeatmapPane sentences={result.sentences} />
                  </div>
                </div>

              </div>
            )}
          </section>
        </div>
      </main>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="border-t border-stone-200 mt-16">
        <div className="max-w-screen-xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="font-mono text-[10px] text-stone-400">
            33 heuristic rules · No external APIs · Pure TypeScript
          </span>
          <span className="font-mono text-[10px] text-stone-300">
            Manuscript v0.1
          </span>
        </div>
      </footer>
    </div>
  );
}
