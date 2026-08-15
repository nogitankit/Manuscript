"use client";

import { useCallback, useRef, useState } from "react";
import type { AnalysisResult, SentenceResult } from "@/lib/detector";
import { SAMPLE_TEXT } from "@/lib/sample";

/** Longest text /api/analyze accepts. */
const MAX_CHARS = 10_000;

// ─── Reading the score ─────────────────────────────────────────────────────────

/** Bands match the engine's own thresholds in detector.ts. */
function verdict(score: number): { label: string; className: string } {
  if (score > 75) return { label: "Very likely AI", className: "text-red-pencil" };
  if (score > 50) return { label: "Likely AI", className: "text-red-pencil" };
  if (score > 25) return { label: "Uncertain", className: "text-pencil" };
  return { label: "Likely human", className: "text-ink-soft" };
}

/** A sentence carries a mark at 21+, a heavy mark at 51+. */
function markClass(score: number): string {
  if (score > 50) return "marked-heavy";
  if (score > 20) return "marked";
  return "";
}

function parseRule(tag: string): { id: string; label: string } {
  const colon = tag.indexOf(":");
  if (colon === -1) return { id: tag, label: tag };
  return { id: tag.slice(0, colon).trim(), label: tag.slice(colon + 1).trim() };
}

const FAMILY_NAMES: Record<string, string> = {
  vocabulary: "Words and phrases",
  structural: "Shape of the writing",
  formatting: "Formatting",
  communication: "Tone and manner",
};

const FAMILY_ORDER = ["vocabulary", "structural", "formatting", "communication"];

/** Jump to an element, smoothly unless the reader has asked for less motion. */
function jumpTo(el: Element | null | undefined, block: ScrollLogicalPosition) {
  el?.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block,
  });
}

// ─── Shared bits ───────────────────────────────────────────────────────────────

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-soft">
      {children}
    </span>
  );
}

/** A section heading ruled off to the right, like a field on a proof sheet. */
function RuledHeading({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <h3 className="mb-4 flex items-baseline gap-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-soft">
      {children}
      <span className="h-px flex-1 bg-rule" aria-hidden />
      {right}
    </h3>
  );
}

// ─── The document's shape, at a glance ─────────────────────────────────────────

/**
 * One bar per sentence, in document order — the fore-edge view of the proof.
 * Doubles as navigation: pick a bar, jump to the sentence.
 */
function HeatRibbon({ sentences }: { sentences: SentenceResult[] }) {
  return (
    <div
      className="flex items-end gap-[2px] overflow-hidden"
      aria-label={`Marks across ${sentences.length} sentences`}
    >
      {sentences.map((s, i) => (
        <button
          key={i}
          type="button"
          onClick={() => jumpTo(document.getElementById(`line-${i}`), "center")}
          title={`Sentence ${i + 1} — ${s.score}/100`}
          aria-label={`Go to sentence ${i + 1}, score ${s.score} of 100`}
          className={`min-w-[2px] flex-1 transition-opacity hover:opacity-55 ${
            s.score > 50 ? "bg-pencil" : s.score > 20 ? "bg-pencil-soft" : "bg-rule"
          }`}
          style={{ height: `${8 + (s.score / 100) * 24}px` }}
        />
      ))}
    </div>
  );
}

// ─── The marked-up galley ──────────────────────────────────────────────────────

function Line({
  sentence,
  index,
  order,
}: {
  sentence: SentenceResult;
  index: number;
  /** Position among marked sentences, for staggering the margin marks. */
  order: number;
}) {
  const [open, setOpen] = useState(false);
  const rules = sentence.triggeredRules.map(parseRule);
  const heavy = sentence.score > 50;
  const markTone = heavy ? "text-red-pencil" : "text-pencil";

  return (
    <li
      id={`line-${index}`}
      className="grid scroll-mt-24 grid-cols-[1.5rem_1fr] gap-x-4 gap-y-2 py-2.5 sm:grid-cols-[2rem_1fr_7.5rem]"
    >
      <span
        className="pt-1.5 text-right font-mono text-[11px] tabular-nums text-pencil-soft select-none"
        aria-hidden
      >
        {index + 1}
      </span>

      <div>
        <p className="font-serif text-[17px] leading-[1.65] text-ink">
          <span className={markClass(sentence.score)}>{sentence.text}</span>
        </p>

        {open && rules.length > 0 && (
          <dl id={`rules-${index}`} className="mt-3 border-l-2 border-rule pl-4">
            {rules.map((r) => (
              <div key={r.id} className="flex gap-3 py-1">
                <dt className={`shrink-0 font-mono text-[11px] ${markTone}`}>{r.id}</dt>
                <dd className="text-[13px] leading-snug text-ink-soft">{r.label}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {/* The margin. Marks land here, aligned to the line they belong to. */}
      <div className="col-start-2 flex flex-wrap gap-1 sm:col-start-3 sm:justify-end">
        {rules.length === 0 ? (
          <span className="font-mono text-[11px] text-rule select-none" aria-hidden>
            —
          </span>
        ) : (
          rules.map((r, j) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls={`rules-${index}`}
              title={r.label}
              // Marks arrive in reading order, but capped — nobody should wait
              // seconds to see a mark on sentence 80.
              style={{ "--i": Math.min(order * 2 + j, 24) } as React.CSSProperties}
              className={`mark-in rounded-[2px] px-1 font-mono text-[11px] leading-5 transition-colors hover:bg-pencil-wash ${markTone}`}
            >
              {r.id}
            </button>
          ))
        )}
      </div>
    </li>
  );
}

function Families({ breakdown }: { breakdown: AnalysisResult["breakdown"] }) {
  if (breakdown.length === 0) return null;
  const most = Math.max(...breakdown.map((b) => b.hitCount));

  return (
    <div className="space-y-6">
      {FAMILY_ORDER.map((family) => {
        const rules = breakdown
          .filter((b) => (b.category in FAMILY_NAMES ? b.category : "vocabulary") === family)
          .sort((a, b) => b.hitCount - a.hitCount);
        if (rules.length === 0) return null;

        return (
          <div key={family}>
            <RuledHeading
              right={
                <span className="font-mono text-[11px] tabular-nums text-ink-soft">
                  {rules.reduce((n, r) => n + r.hitCount, 0)}
                </span>
              }
            >
              {FAMILY_NAMES[family]}
            </RuledHeading>
            <ul className="space-y-1.5">
              {rules.map((r) => (
                <li key={r.id} className="flex items-baseline gap-3">
                  <span className="w-9 shrink-0 font-mono text-[11px] text-pencil">{r.id}</span>
                  <span
                    className="min-w-0 flex-1 truncate text-[13px] text-ink-soft"
                    title={r.label}
                  >
                    {r.label}
                  </span>
                  <span
                    className="h-[3px] shrink-0 bg-pencil-wash"
                    style={{ width: `${Math.max(6, (r.hitCount / most) * 56)}px` }}
                    aria-hidden
                  />
                  <span className="w-4 shrink-0 text-right font-mono text-[11px] tabular-nums text-ink-soft">
                    {r.hitCount}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/** A returned proof: the reading, the shape, the marked-up prose, the tally. */
function Proof({ result }: { result: AnalysisResult }) {
  const { label, className } = verdict(result.overallScore);
  const marks = result.breakdown.reduce((n, b) => n + b.hitCount, 0);
  let order = 0;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5 border-b-[3px] border-double border-ink pb-5">
        <div>
          <h2
            className={`font-sans text-[clamp(1.4rem,4vw,2rem)] font-semibold leading-none tracking-[-0.02em] ${className}`}
          >
            {label}
          </h2>
          <p className="mt-2.5 font-mono text-[11px] text-ink-soft">
            {result.sentences.length} sentences · {result.breakdown.length} rules · {marks}{" "}
            {marks === 1 ? "mark" : "marks"}
          </p>
        </div>
        <p className="font-serif text-[clamp(2.75rem,10vw,4rem)] leading-[0.8] tabular-nums text-ink">
          {result.overallScore}
          <span className="font-sans text-[0.8rem] font-medium tracking-wide text-ink-soft">
            /100
          </span>
        </p>
      </div>

      <div className="mt-8">
        <RuledHeading>Shape of the document</RuledHeading>
        <HeatRibbon sentences={result.sentences} />
      </div>

      <div className="mt-10">
        <RuledHeading>The proof</RuledHeading>
        <ul className="divide-y divide-rule">
          {result.sentences.map((s, i) => (
            <Line
              key={i}
              sentence={s}
              index={i}
              order={s.triggeredRules.length > 0 ? order++ : 0}
            />
          ))}
        </ul>
      </div>

      {result.breakdown.length > 0 && (
        <div className="mt-12">
          <Families breakdown={result.breakdown} />
        </div>
      )}
    </div>
  );
}

// ─── The desk ──────────────────────────────────────────────────────────────────

export default function Desk({ example }: { example: AnalysisResult }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const proofRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const overLimit = text.length > MAX_CHARS;

  const readFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be picked twice
    if (!file) return;

    const isPdf = /\.pdf$/i.test(file.name);
    if (!isPdf && !/\.(txt|text|md|markdown)$/i.test(file.name)) {
      setError("That file type will not open here. Use a .pdf, .txt or .md file.");
      return;
    }
    if (file.size > (isPdf ? 20_000_000 : 1_000_000)) {
      setError(`That file is over the ${isPdf ? "20 MB" : "1 MB"} limit. Paste the text instead.`);
      return;
    }

    setError(null);
    setReading(true);
    try {
      const contents = isPdf
        ? await (await import("@/lib/pdf")).extractPdfText(file, MAX_CHARS)
        : (await file.text()).replace(/\r\n/g, "\n");
      const trimmed = contents.trim();

      if (!trimmed) {
        setError(
          isPdf
            ? "That PDF has no text layer, so it is probably a scan. Run OCR on it first, or paste the text."
            : "That file is empty."
        );
        return;
      }
      setText(trimmed.slice(0, MAX_CHARS));
      setResult(null);
      if (trimmed.length > MAX_CHARS) {
        setError(
          `Kept the first ${MAX_CHARS.toLocaleString()} characters — that is as much as one pass reads.`
        );
      }
    } catch {
      setError(
        isPdf
          ? "That PDF would not open. It may be corrupt or password-protected."
          : "That file would not open."
      );
    } finally {
      setReading(false);
    }
  };

  const markUp = useCallback(async () => {
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
        setError(data.error ?? "The reading did not finish. Try again.");
      } else {
        setResult(data as AnalysisResult);
        setTimeout(() => jumpTo(proofRef.current, "start"), 80);
      }
    } catch {
      setError("Could not reach the reader. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [text, loading, overLimit]);

  return (
    <main className="mx-auto max-w-3xl px-5 pb-24 pt-8 sm:px-8 sm:pt-14">
      {/* ── Masthead ─────────────────────────────────────────────────────── */}
      <header className="mb-8 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-desk-edge pb-4">
        <div className="flex items-baseline gap-3">
          <h1 className="font-sans text-[15px] font-semibold uppercase tracking-[0.2em] text-ink">
            Manuscript
          </h1>
          <p className="font-serif text-[15px] italic text-ink-soft">a copy-desk for machine prose</p>
        </div>
        <p className="font-mono text-[11px] text-ink-soft">34 rules · nothing leaves this page</p>
      </header>

      {/* ── The sheet you write on ───────────────────────────────────────── */}
      <div className="sheet">
        <div className="flex items-baseline justify-between border-b border-rule px-5 py-2.5 sm:px-7">
          <Eyebrow>Your copy</Eyebrow>
          <span
            className={`font-mono text-[11px] tabular-nums ${
              overLimit ? "text-red-pencil" : "text-ink-soft"
            }`}
          >
            {text.length.toLocaleString()}
            <span className="text-rule"> / </span>
            {MAX_CHARS.toLocaleString()}
          </span>
        </div>

        <label htmlFor="draft" className="sr-only">
          Paste the essay you want read
        </label>
        <textarea
          id="draft"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") markUp();
          }}
          placeholder="Paste an essay here."
          spellCheck={false}
          className="min-h-[15rem] w-full bg-transparent px-5 py-5 font-serif text-[17px] leading-[1.75] text-ink outline-none placeholder:text-ink-soft sm:min-h-[19rem] sm:px-7"
        />

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-rule px-5 py-3.5 sm:px-7">
          <div className="flex items-center gap-4">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.txt,.text,.md,.markdown,application/pdf,text/plain,text/markdown"
              onChange={readFile}
              className="hidden"
              tabIndex={-1}
              aria-hidden
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={reading}
              className="rounded-[2px] border border-desk-edge px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:border-ink hover:bg-desk disabled:opacity-50"
            >
              {reading ? "Reading…" : "Upload a file"}
            </button>
            <button
              type="button"
              onClick={() => {
                setText(SAMPLE_TEXT);
                setResult(null);
                setError(null);
              }}
              className="text-[12px] text-pencil underline decoration-pencil-wash decoration-2 underline-offset-4 transition-colors hover:decoration-pencil"
            >
              Load the example
            </button>
          </div>

          <button
            type="button"
            onClick={markUp}
            disabled={loading || !text.trim() || overLimit}
            title="Mark it up (Ctrl or ⌘ + Enter)"
            className="rounded-[2px] bg-ink px-5 py-2 text-[13px] font-semibold tracking-wide text-sheet transition-colors hover:bg-pencil disabled:cursor-not-allowed disabled:bg-desk-edge disabled:text-ink-soft"
          >
            {loading ? "Marking up…" : "Mark it up"}
          </button>
        </div>
      </div>

      {overLimit && (
        <p className="mt-3 font-mono text-[11px] text-red-pencil">
          {(text.length - MAX_CHARS).toLocaleString()} characters over. Trim it, or upload the file
          to have it cut for you.
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mt-4 border-l-2 border-red-pencil bg-sheet py-2.5 pl-4 pr-3 text-[13px] text-ink"
        >
          {error}
        </p>
      )}

      {/* One short status line, so the proof itself is not read aloud wholesale. */}
      <p role="status" className="sr-only">
        {loading
          ? "Reading your copy."
          : result
            ? `${verdict(result.overallScore).label}, ${result.overallScore} out of 100. The marked-up copy follows.`
            : ""}
      </p>

      {/* ── What comes back ──────────────────────────────────────────────── */}
      <div ref={proofRef} className="mt-14 scroll-mt-8">
        {loading && (
          <p className="font-mono text-[11px] text-ink-soft">
            Reading {text.length.toLocaleString()} characters…
          </p>
        )}

        {!loading && result && <Proof result={result} />}

        {!loading && !result && (
          <div>
            <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <Eyebrow>Example proof</Eyebrow>
              <p className="text-[13px] text-ink-soft">
                Nobody wrote this by hand — a chatbot did. Here is what comes back.
              </p>
            </div>
            <Proof result={example} />
          </div>
        )}
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="mt-20 border-t border-desk-edge pt-4">
        <p className="text-[13px] leading-relaxed text-ink-soft">
          Every mark comes from a rule you can read in{" "}
          <code className="font-mono text-[12px] text-pencil">src/lib/detector.ts</code>. A high
          reading means the prose has the habits chatbots have, which is not proof of anything and
          not grounds to accuse anyone.
        </p>
      </footer>
    </main>
  );
}
