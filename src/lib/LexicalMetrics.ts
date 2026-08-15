/**
 * LexicalMetrics.ts
 *
 * Lexical-diversity metrics, usable as authorship signal alongside `detector.ts`.
 * Every metric is linear in the token count — no per-window rescans, no sorting,
 * no frequency spectrum materialised.
 *
 *   1. MATTR       — moving-average type-token ratio over a sliding window
 *   2. MTLD        — measure of textual lexical diversity (forward + backward)
 *   3. Hapax ratio — share of tokens occurring exactly once
 *   4. Yule's K    — vocabulary repetitiveness from the frequency spectrum
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LexicalMetricsOptions {
  /** Sliding-window length for MATTR, in tokens. Default 50. */
  mattrWindow?: number;
  /** TTR floor that closes an MTLD factor. Default 0.72. */
  mtldThreshold?: number;
}

export interface LexicalMetricsResult {
  /** Total tokens, N. */
  tokenCount: number;
  /** Distinct types, V. */
  typeCount: number;
  /** 0–1 mean TTR across all windows. Higher = more varied. */
  mattr: number;
  /** Mean factor length in tokens. Higher = more varied. */
  mtld: number;
  /** 0–1 share of tokens occurring exactly once. Higher = more varied. */
  hapaxRatio: number;
  /** Yule's characteristic K. Higher = more repetitive. */
  yulesK: number;
}

const DEFAULT_WINDOW = 50;
const DEFAULT_THRESHOLD = 0.72;

// ─── Tokenization ─────────────────────────────────────────────────────────────

/**
 * A token is a run of letters/digits, keeping internal apostrophes so "don't"
 * stays one word. Hyphens and all other punctuation separate tokens.
 */
const TOKEN_RE = /[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu;

/** Lower-cased, punctuation-stripped tokens in document order. */
export function tokenize(text: string): string[] {
  return (
    text
      .toLowerCase()
      .replace(/[‘’]/g, "'") // curly apostrophes → ASCII, so "don’t" === "don't"
      .match(TOKEN_RE) ?? []
  );
}

/** Type → occurrence count. Shared by the hapax and Yule's K passes. */
export function frequencies(tokens: readonly string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const token of tokens) freq.set(token, (freq.get(token) ?? 0) + 1);
  return freq;
}

// ─── 1. MATTR ─────────────────────────────────────────────────────────────────

/**
 * Mean TTR over every window-length span of the text.
 *
 * The window carries an incremental frequency map: each shift touches only the
 * entering and leaving token, and the live type count is maintained as counts
 * cross 0↔1 — so the sweep is O(N), not O(N · window).
 *
 * Texts shorter than one window fall back to the plain TTR of the whole text.
 */
export function mattr(tokens: readonly string[], window = DEFAULT_WINDOW): number {
  if (!Number.isInteger(window) || window < 1) {
    throw new RangeError(`mattr: window must be a positive integer, received ${window}`);
  }

  const n = tokens.length;
  if (n === 0) return 0;
  if (n <= window) return new Set(tokens).size / n;

  const counts = new Map<string, number>();
  let types = 0;

  for (let i = 0; i < window; i++) {
    const seen = counts.get(tokens[i]) ?? 0;
    if (seen === 0) types++;
    counts.set(tokens[i], seen + 1);
  }

  let sum = types / window;

  for (let i = window; i < n; i++) {
    const entering = tokens[i];
    const enteringCount = counts.get(entering) ?? 0;
    if (enteringCount === 0) types++;
    counts.set(entering, enteringCount + 1);

    const leaving = tokens[i - window];
    const leavingCount = counts.get(leaving) ?? 0;
    if (leavingCount <= 1) {
      types--;
      counts.delete(leaving);
    } else {
      counts.set(leaving, leavingCount - 1);
    }

    sum += types / window;
  }

  return sum / (n - window + 1);
}

// ─── 2. MTLD ──────────────────────────────────────────────────────────────────

/**
 * One MTLD pass. `reverse` walks the tokens back-to-front by index, so the
 * backward run needs no reversed copy of the array.
 *
 * A factor closes the moment its running TTR drops below `threshold`. The
 * trailing open sequence is credited as a partial factor, per McCarthy & Jarvis:
 * without it, text whose TTR never drops (every token unique) would divide by
 * zero, and any remainder would be silently discarded.
 */
function mtldPass(tokens: readonly string[], threshold: number, reverse: boolean): number {
  const n = tokens.length;
  const types = new Set<string>();
  let factors = 0;
  let counted = 0;
  let ttr = 1;

  for (let i = 0; i < n; i++) {
    types.add(tokens[reverse ? n - 1 - i : i]);
    counted++;
    ttr = types.size / counted;
    if (ttr < threshold) {
      factors++;
      counted = 0;
      ttr = 1;
      types.clear();
    }
  }

  // Partial credit for how far the open sequence got toward the threshold.
  if (counted > 0) factors += (1 - ttr) / (1 - threshold);

  // No factor ever closed: the text never repeats enough, so it is one factor.
  return factors > 0 ? n / factors : n;
}

/** Mean of the forward and backward MTLD passes. */
export function mtld(tokens: readonly string[], threshold = DEFAULT_THRESHOLD): number {
  if (!(threshold > 0 && threshold < 1)) {
    throw new RangeError(`mtld: threshold must be between 0 and 1, received ${threshold}`);
  }
  if (tokens.length === 0) return 0;
  return (mtldPass(tokens, threshold, false) + mtldPass(tokens, threshold, true)) / 2;
}

// ─── 3. Hapax legomena ────────────────────────────────────────────────────────

/** Share of tokens that occur exactly once in the text: f₁ / N. */
export function hapaxRatio(freq: ReadonlyMap<string, number>, tokenCount: number): number {
  if (tokenCount === 0) return 0;
  let hapax = 0;
  for (const count of freq.values()) if (count === 1) hapax++;
  return hapax / tokenCount;
}

// ─── 4. Yule's characteristic K ───────────────────────────────────────────────

/**
 * K = 10⁴ · (Σ fₓ·x² − N) / N², where fₓ is the number of types occurring
 * exactly x times.
 *
 * Summing fₓ·x² over frequency classes is identical to summing count² over
 * types, so the frequency spectrum never has to be built.
 */
export function yulesK(freq: ReadonlyMap<string, number>, tokenCount: number): number {
  if (tokenCount === 0) return 0;
  let sumSquares = 0;
  for (const count of freq.values()) sumSquares += count * count;
  return (1e4 * (sumSquares - tokenCount)) / (tokenCount * tokenCount);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

/** Tokenize `text` and compute all four metrics. */
export function analyzeLexicalMetrics(
  text: string,
  {
    mattrWindow = DEFAULT_WINDOW,
    mtldThreshold = DEFAULT_THRESHOLD,
  }: LexicalMetricsOptions = {}
): LexicalMetricsResult {
  const tokens = tokenize(text);
  const freq = frequencies(tokens);

  return {
    tokenCount: tokens.length,
    typeCount: freq.size,
    mattr: mattr(tokens, mattrWindow),
    mtld: mtld(tokens, mtldThreshold),
    hapaxRatio: hapaxRatio(freq, tokens.length),
    yulesK: yulesK(freq, tokens.length),
  };
}
