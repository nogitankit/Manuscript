import { test } from "node:test";
import assert from "node:assert/strict";

import { WatermarkDetector } from "./WatermarkDetector.ts";

const VOCAB = 32768;

const close = (actual: number, expected: number, eps = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < eps, `expected ${expected}, got ${actual}`);

/** mulberry32 — deterministic source for synthetic token streams. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Unwatermarked text: token IDs drawn uniformly, independent of any green list. */
function humanTokens(n: number, seed: number, vocabSize = VOCAB): number[] {
  const rand = rng(seed);
  return Array.from({ length: n }, () => (rand() * vocabSize) | 0);
}

/**
 * Synthetic watermarked text: at each position pick a token that is green with
 * probability `greenRate`, using the detector's own partition — i.e. the generator
 * side of the scheme.
 */
function watermarkedTokens(
  detector: WatermarkDetector,
  n: number,
  greenRate: number,
  seed: number
): number[] {
  const rand = rng(seed);
  const { vocabSize, contextWidth } = detector;
  const tokens: number[] = [];
  for (let i = 0; i < contextWidth; i++) tokens.push((rand() * vocabSize) | 0);

  while (tokens.length < n) {
    const contextSeed = detector.contextSeed(tokens);
    const wantGreen = rand() < greenRate;
    let token = (rand() * vocabSize) | 0;
    for (let tries = 0; detector.isGreenForSeed(contextSeed, token) !== wantGreen; tries++) {
      assert.ok(tries < 1000, "could not find a token on the requested side of the split");
      token = (rand() * vocabSize) | 0;
    }
    tokens.push(token);
  }
  return tokens;
}

// ─── Hashing and partitioning ─────────────────────────────────────────────────

test("context seeding and greenness are deterministic across instances", () => {
  const a = new WatermarkDetector({ vocabSize: VOCAB });
  const b = new WatermarkDetector({ vocabSize: VOCAB });
  const context = [7, 19, 23];
  assert.equal(a.contextSeed(context), b.contextSeed(context));
  for (let token = 0; token < 200; token++) {
    assert.equal(a.isGreen(context, token), b.isGreen(context, token));
  }
});

test("the seed depends on the context, its order, and the hash key", () => {
  const d = new WatermarkDetector({ vocabSize: VOCAB, contextWidth: 2 });
  assert.notEqual(d.contextSeed([3, 9]), d.contextSeed([9, 3]));
  assert.notEqual(d.contextSeed([3, 9]), d.contextSeed([3, 10]));
  const other = new WatermarkDetector({ vocabSize: VOCAB, contextWidth: 2, hashKey: 7919 });
  assert.notEqual(d.contextSeed([3, 9]), other.contextSeed([3, 9]));
});

test("only the trailing contextWidth tokens seed the PRNG", () => {
  const d = new WatermarkDetector({ vocabSize: VOCAB, contextWidth: 1 });
  assert.equal(d.contextSeed([1, 2, 3]), d.contextSeed([99, 3]));
});

test("green fraction of the vocabulary tracks gamma", () => {
  for (const gamma of [0.25, 0.5]) {
    const d = new WatermarkDetector({ vocabSize: VOCAB, gamma });
    const green = d.greenList([11]);
    assert.ok(
      Math.abs(green.size / VOCAB - gamma) < 0.02,
      `gamma ${gamma}: got ${green.size / VOCAB}`
    );
  }
});

test("green and red lists partition the vocabulary and agree with isGreen", () => {
  const vocabSize = 64;
  const d = new WatermarkDetector({ vocabSize });
  const context = [5];
  const green = d.greenList(context);
  const red = d.redList(context);

  assert.equal(green.size + red.size, vocabSize);
  for (let token = 0; token < vocabSize; token++) {
    assert.equal(green.has(token), d.isGreen(context, token));
    assert.equal(red.has(token), !green.has(token));
  }
});

test("a different context repartitions the vocabulary", () => {
  const d = new WatermarkDetector({ vocabSize: 4096 });
  const a = d.greenList([1]);
  const b = d.greenList([2]);
  let shared = 0;
  for (const token of a) if (b.has(token)) shared++;
  // Independent halves overlap on ~gamma of each list, nowhere near identical.
  assert.ok(shared > 0 && shared < a.size * 0.75, `overlap ${shared} of ${a.size}`);
});

// ─── The z-test ───────────────────────────────────────────────────────────────

test("z matches the formula on an all-green sequence", () => {
  // T = 100 green hits at gamma 0.5 → (100 − 50) / √(100·0.25) = 10.
  const d = new WatermarkDetector({ vocabSize: VOCAB });
  const result = d.detect(watermarkedTokens(d, 101, 1, 1));
  assert.equal(result.testableTokens, 100);
  assert.equal(result.greenTokens, 100);
  close(result.zScore, 10);
  close(result.greenFraction, 1);
  assert.equal(result.isWatermarked, true);
  assert.equal(result.gamma, 0.5);
});

test("z matches the formula at gamma 0.25", () => {
  // (100 − 25) / √(100·0.25·0.75) = 75 / 4.330127… = 17.3205…
  const d = new WatermarkDetector({ vocabSize: VOCAB, gamma: 0.25 });
  const result = d.detect(watermarkedTokens(d, 101, 1, 2));
  assert.equal(result.testableTokens, 100);
  close(result.zScore, 75 / Math.sqrt(100 * 0.25 * 0.75));
  assert.equal(result.isWatermarked, true);
});

test("an all-red sequence scores symmetrically negative", () => {
  const d = new WatermarkDetector({ vocabSize: VOCAB });
  const result = d.detect(watermarkedTokens(d, 101, 0, 3));
  assert.equal(result.greenTokens, 0);
  close(result.zScore, -10);
  assert.equal(result.isWatermarked, false);
});

test("the flag trips exactly at the threshold", () => {
  const d = new WatermarkDetector({ vocabSize: VOCAB, zThreshold: 10 });
  const at = d.detect(watermarkedTokens(d, 101, 1, 1));
  close(at.zScore, 10);
  assert.equal(at.isWatermarked, true); // z ≥ threshold, not >
  assert.equal(new WatermarkDetector({ vocabSize: VOCAB, zThreshold: 10.000001 })
    .detect(watermarkedTokens(d, 101, 1, 1)).isWatermarked, false);
});

// ─── Detection on realistic streams ───────────────────────────────────────────

test("unwatermarked text is not flagged", () => {
  const d = new WatermarkDetector({ vocabSize: VOCAB });
  for (const seed of [1, 2, 3, 4, 5]) {
    const result = d.detect(humanTokens(2000, seed));
    assert.ok(Math.abs(result.zScore) < 4, `seed ${seed}: z = ${result.zScore}`);
    assert.equal(result.isWatermarked, false);
    // Green hits land near gamma, which is the null the z-test assumes.
    assert.ok(Math.abs(result.greenFraction - 0.5) < 0.05);
  }
});

test("a partially watermarked stream is still flagged", () => {
  // 70% green over 400 positions → z ≈ (280 − 200) / 10 = 8.
  const d = new WatermarkDetector({ vocabSize: VOCAB });
  const result = d.detect(watermarkedTokens(d, 401, 0.7, 9));
  assert.ok(result.zScore > 4, `z = ${result.zScore}`);
  assert.equal(result.isWatermarked, true);
});

test("the wrong hash key sees no watermark", () => {
  const generator = new WatermarkDetector({ vocabSize: VOCAB });
  const tokens = watermarkedTokens(generator, 2000, 1, 11);
  assert.equal(generator.detect(tokens).isWatermarked, true);

  const eavesdropper = new WatermarkDetector({ vocabSize: VOCAB, hashKey: 104729 });
  const result = eavesdropper.detect(tokens);
  assert.ok(Math.abs(result.zScore) < 4, `z = ${result.zScore}`);
  assert.equal(result.isWatermarked, false);
});

test("the wrong contextWidth sees no watermark", () => {
  const generator = new WatermarkDetector({ vocabSize: VOCAB, contextWidth: 1 });
  const tokens = watermarkedTokens(generator, 2000, 1, 13);
  const result = new WatermarkDetector({ vocabSize: VOCAB, contextWidth: 3 }).detect(tokens);
  assert.ok(Math.abs(result.zScore) < 4, `z = ${result.zScore}`);
});

test("wider contexts detect their own watermark", () => {
  for (const contextWidth of [2, 4]) {
    const d = new WatermarkDetector({ vocabSize: VOCAB, contextWidth });
    const tokens = watermarkedTokens(d, 500, 1, 17 + contextWidth);
    const result = d.detect(tokens);
    assert.equal(result.testableTokens, 500 - contextWidth);
    assert.equal(result.isWatermarked, true);
  }
});

// ─── Repeated n-grams ─────────────────────────────────────────────────────────

test("ignoreRepeatedNgrams counts each distinct n-gram once", () => {
  const tokens = Array.from({ length: 500 }, () => 5); // one n-gram, repeated
  const plain = new WatermarkDetector({ vocabSize: VOCAB }).detect(tokens);
  assert.equal(plain.testableTokens, 499);

  const deduped = new WatermarkDetector({
    vocabSize: VOCAB,
    ignoreRepeatedNgrams: true,
  }).detect(tokens);
  assert.equal(deduped.testableTokens, 1);
  assert.equal(deduped.greenTokens, plain.greenTokens > 0 ? 1 : 0);
  // 499 dependent samples inflate |z| ~22×; deduping cuts it to one observation.
  assert.ok(Math.abs(deduped.zScore) < Math.abs(plain.zScore));
});

test("dedupe keys distinguish n-grams that share a seed prefix", () => {
  const d = new WatermarkDetector({ vocabSize: VOCAB, ignoreRepeatedNgrams: true });
  // (5,6) and (5,7) are distinct n-grams; (5,6) recurs and must collapse.
  assert.equal(d.detect([5, 6, 5, 7, 5, 6]).testableTokens, 4);
});

test("dedupe leaves genuinely varied text alone", () => {
  const tokens = humanTokens(2000, 21);
  const plain = new WatermarkDetector({ vocabSize: VOCAB }).detect(tokens);
  const deduped = new WatermarkDetector({
    vocabSize: VOCAB,
    ignoreRepeatedNgrams: true,
  }).detect(tokens);
  assert.deepEqual(deduped, plain);
});

// ─── Degenerate input ─────────────────────────────────────────────────────────

test("text with no testable position scores zero, not NaN", () => {
  const d = new WatermarkDetector({ vocabSize: VOCAB, contextWidth: 2 });
  for (const tokens of [[], [4], [4, 9]]) {
    assert.deepEqual(d.detect(tokens), {
      zScore: 0,
      isWatermarked: false,
      testableTokens: 0,
      greenTokens: 0,
      greenFraction: 0,
      gamma: 0.5,
    });
  }
});

test("detect rejects tokens outside the vocabulary", () => {
  const d = new WatermarkDetector({ vocabSize: 100 });
  assert.throws(() => d.detect([1, 100, 2]), RangeError);
  assert.throws(() => d.detect([1, -1, 2]), RangeError);
  assert.throws(() => d.detect([1, 2.5, 3]), RangeError);
  assert.throws(() => d.detect([1, NaN]), RangeError);
});

test("contextSeed rejects a context shorter than contextWidth", () => {
  const d = new WatermarkDetector({ vocabSize: VOCAB, contextWidth: 3 });
  assert.throws(() => d.contextSeed([1, 2]), RangeError);
  assert.doesNotThrow(() => d.contextSeed([1, 2, 3]));
});

test("the constructor rejects nonsensical options", () => {
  assert.throws(() => new WatermarkDetector({ vocabSize: 1 }), RangeError);
  assert.throws(() => new WatermarkDetector({ vocabSize: 2 ** 22 }), RangeError);
  assert.throws(() => new WatermarkDetector({ vocabSize: 1024.5 }), RangeError);
  assert.throws(() => new WatermarkDetector({ vocabSize: VOCAB, gamma: 0 }), RangeError);
  assert.throws(() => new WatermarkDetector({ vocabSize: VOCAB, gamma: 1 }), RangeError);
  assert.throws(() => new WatermarkDetector({ vocabSize: VOCAB, contextWidth: 0 }), RangeError);
  assert.throws(() => new WatermarkDetector({ vocabSize: VOCAB, hashKey: 1.5 }), RangeError);
});

test("detect does not mutate its input", () => {
  const d = new WatermarkDetector({ vocabSize: VOCAB });
  const tokens = humanTokens(200, 31);
  const copy = [...tokens];
  d.detect(tokens);
  assert.deepEqual(tokens, copy);
});
