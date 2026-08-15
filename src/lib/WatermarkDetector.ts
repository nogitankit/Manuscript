/**
 * WatermarkDetector.ts
 *
 * Detection side of the soft-biasing LM watermark of Kirchenbauer et al. (2023),
 * "A Watermark for Large Language Models".
 *
 * At generation time the watermarker seeds a PRNG from the hash of the preceding
 * `contextWidth` tokens, splits the vocabulary into a green list (fraction gamma)
 * and a red list, and adds a logit bias to the green half. Green tokens therefore
 * appear at rate ≈ gamma in human text and well above gamma in watermarked text,
 * which a one-proportion z-test detects.
 *
 * IMPORTANT — this operates on model token IDs, not words. It can only detect a
 * watermark when the generator used the identical vocabulary, tokenizer, gamma,
 * contextWidth, hashKey and greenness function. Pure TypeScript cannot reproduce
 * the reference implementation's `torch.randperm` bit-for-bit, so this module is
 * statistically faithful, not wire-compatible with PyTorch-generated watermarks;
 * pair it with a generator built on this same class.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WatermarkDetectorOptions {
  /** Size of the model vocabulary the token IDs index into. */
  vocabSize: number;
  /** Green-list fraction, gamma. Typically 0.5 or 0.25. Default 0.5. */
  gamma?: number;
  /** How many preceding tokens seed the PRNG (h). Default 1, the paper's scheme. */
  contextWidth?: number;
  /** Secret salt shared with the generator. Default is the paper's 15485863. */
  hashKey?: number;
  /** z at or above which the text is flagged watermarked. Default 4. */
  zThreshold?: number;
  /**
   * Count each distinct (context, token) n-gram once. Repeated n-grams are not
   * independent samples, so leaving this off — the default, matching the plain
   * tally — inflates z on repetitive text. Turn it on to cut false positives.
   */
  ignoreRepeatedNgrams?: boolean;
}

export interface WatermarkDetectionResult {
  /** One-proportion z-score: (|s|_G − γT) / √(T·γ·(1−γ)). 0 when T = 0. */
  zScore: number;
  /** True when zScore ≥ zThreshold. */
  isWatermarked: boolean;
  /** T — positions carrying a full context window. */
  testableTokens: number;
  /** |s|_G — testable positions whose token fell in the green list. */
  greenTokens: number;
  /** |s|_G / T, or 0 when T = 0. Compare against gamma. */
  greenFraction: number;
  /** Gamma the test ran with, for reporting alongside the score. */
  gamma: number;
}

const DEFAULT_GAMMA = 0.5;
const DEFAULT_CONTEXT_WIDTH = 1;
const DEFAULT_HASH_KEY = 15485863; // large prime, as in the reference implementation
const DEFAULT_Z_THRESHOLD = 4;

/** Odd 32-bit constant (2³²/φ) for decorrelating the token from the context seed. */
const GOLDEN_GAMMA = 0x9e3779b1;
const TWO_POW_32 = 4294967296;

/**
 * splitmix32 finaliser: a stateless, well-avalanched 32-bit mixer.
 *
 * Counter-based rather than stateful, which is what makes greenness an O(1)
 * lookup — no PRNG object to advance, reset, or allocate per position.
 */
function mix32(x: number): number {
  let z = x | 0;
  z = (z + GOLDEN_GAMMA) | 0;
  z ^= z >>> 16;
  z = Math.imul(z, 0x21f0aaad);
  z ^= z >>> 15;
  z = Math.imul(z, 0x735a2d97);
  z ^= z >>> 15;
  return z >>> 0;
}

// ─── Detector ─────────────────────────────────────────────────────────────────

export class WatermarkDetector {
  readonly vocabSize: number;
  readonly gamma: number;
  readonly contextWidth: number;
  readonly hashKey: number;
  readonly zThreshold: number;
  readonly ignoreRepeatedNgrams: boolean;

  /** mix32 output below this counts as green; gamma·2³² keeps the split exact. */
  private readonly greenCutoff: number;

  constructor({
    vocabSize,
    gamma = DEFAULT_GAMMA,
    contextWidth = DEFAULT_CONTEXT_WIDTH,
    hashKey = DEFAULT_HASH_KEY,
    zThreshold = DEFAULT_Z_THRESHOLD,
    ignoreRepeatedNgrams = false,
  }: WatermarkDetectorOptions) {
    if (!Number.isInteger(vocabSize) || vocabSize < 2 || vocabSize > 2 ** 21) {
      throw new RangeError(
        `vocabSize must be an integer in [2, 2²¹], received ${vocabSize}`
      );
    }
    if (!(gamma > 0 && gamma < 1)) {
      throw new RangeError(`gamma must be strictly between 0 and 1, received ${gamma}`);
    }
    if (!Number.isInteger(contextWidth) || contextWidth < 1) {
      throw new RangeError(`contextWidth must be an integer ≥ 1, received ${contextWidth}`);
    }
    if (!Number.isInteger(hashKey)) {
      throw new RangeError(`hashKey must be an integer, received ${hashKey}`);
    }

    this.vocabSize = vocabSize;
    this.gamma = gamma;
    this.contextWidth = contextWidth;
    this.hashKey = hashKey;
    this.zThreshold = zThreshold;
    this.ignoreRepeatedNgrams = ignoreRepeatedNgrams;
    this.greenCutoff = gamma * TWO_POW_32;
  }

  // ── 1. Pseudorandom context hashing ────────────────────────────────────────

  /**
   * Fold the `contextWidth` tokens ending at `end` (exclusive) into a 32-bit
   * seed. Order-sensitive, salted with `hashKey`; O(contextWidth), no allocation.
   */
  private seedAt(tokens: readonly number[], end: number): number {
    let acc = this.hashKey | 0;
    for (let i = end - this.contextWidth; i < end; i++) {
      acc = mix32(acc ^ tokens[i]) | 0;
    }
    return acc >>> 0;
  }

  /**
   * PRNG seed for the context preceding a position — the last `contextWidth`
   * entries of `context`. With contextWidth 1 this is the paper's scheme of
   * seeding from the single previous token.
   */
  contextSeed(context: readonly number[]): number {
    if (context.length < this.contextWidth) {
      throw new RangeError(
        `contextSeed needs at least ${this.contextWidth} preceding token(s), received ${context.length}`
      );
    }
    return this.seedAt(context, context.length);
  }

  // ── 2. Green / red list partitioning ───────────────────────────────────────

  /**
   * Whether `token` is green under an already-computed context seed — the hot
   * path, and the primitive a generator biases its logits with.
   *
   * Greenness is a hash of (seed, token) against a gamma cutoff, so a single
   * membership question costs O(1) instead of shuffling the vocabulary.
   */
  isGreenForSeed(seed: number, token: number): boolean {
    return mix32(seed ^ Math.imul(token + 1, GOLDEN_GAMMA)) < this.greenCutoff;
  }

  /** Whether `token` is green given its preceding context. O(contextWidth). */
  isGreen(context: readonly number[], token: number): boolean {
    return this.isGreenForSeed(this.contextSeed(context), token);
  }

  /**
   * Materialise the green half of the vocabulary for one context, for inspection
   * or for a generator that wants the whole set. O(vocabSize) — `detect` never
   * calls this; it queries `isGreenForSeed` per position instead.
   *
   * The partition is drawn per token rather than as a fixed-size permutation, so
   * the set holds gamma·vocabSize types in expectation (±0.3% at a 32k vocab)
   * rather than exactly. Only the per-position marginal P(green) = gamma enters
   * the z-test, which is what the statistic assumes.
   */
  greenList(context: readonly number[]): Set<number> {
    const seed = this.contextSeed(context);
    const green = new Set<number>();
    for (let token = 0; token < this.vocabSize; token++) {
      if (this.isGreenForSeed(seed, token)) green.add(token);
    }
    return green;
  }

  /** The complement of `greenList`. O(vocabSize). */
  redList(context: readonly number[]): Set<number> {
    const seed = this.contextSeed(context);
    const red = new Set<number>();
    for (let token = 0; token < this.vocabSize; token++) {
      if (!this.isGreenForSeed(seed, token)) red.add(token);
    }
    return red;
  }

  // ── 3–5. Statistical verification ──────────────────────────────────────────

  /**
   * Score a token sequence: tally testable positions T and green hits |s|_G, then
   * run the one-proportion z-test.
   *
   * The first `contextWidth` tokens have no full context and are not testable, so
   * T = max(0, tokens.length − contextWidth). One pass, O(1) work per position.
   *
   * Throws RangeError on any token that is not an integer in [0, vocabSize).
   */
  detect(tokens: readonly number[]): WatermarkDetectionResult {
    const { vocabSize, gamma, contextWidth } = this;
    const n = tokens.length;

    for (let i = 0; i < n; i++) {
      const token = tokens[i];
      if (!Number.isInteger(token) || token < 0 || token >= vocabSize) {
        throw new RangeError(
          `token at index ${i} is not a valid ID in [0, ${vocabSize}): ${token}`
        );
      }
    }

    // Exact while vocabSize ≤ 2²¹: seed < 2³² keeps the key inside 2⁵³.
    const seenNgrams = this.ignoreRepeatedNgrams ? new Set<number>() : null;
    let testableTokens = 0;
    let greenTokens = 0;

    for (let i = contextWidth; i < n; i++) {
      const seed = this.seedAt(tokens, i);
      const token = tokens[i];

      if (seenNgrams) {
        const key = seed * vocabSize + token;
        if (seenNgrams.has(key)) continue;
        seenNgrams.add(key);
      }

      testableTokens++;
      if (this.isGreenForSeed(seed, token)) greenTokens++;
    }

    // z = (|s|_G − γT) / √(T·γ·(1−γ)); undefined at T = 0, reported as 0.
    const zScore =
      testableTokens > 0
        ? (greenTokens - gamma * testableTokens) /
          Math.sqrt(testableTokens * gamma * (1 - gamma))
        : 0;

    return {
      zScore,
      isWatermarked: zScore >= this.zThreshold,
      testableTokens,
      greenTokens,
      greenFraction: testableTokens > 0 ? greenTokens / testableTokens : 0,
      gamma,
    };
  }
}
