import { test } from "node:test";
import assert from "node:assert/strict";

import {
  analyzeLexicalMetrics,
  hapaxRatio,
  frequencies,
  mattr,
  mtld,
  tokenize,
  yulesK,
} from "./LexicalMetrics.ts";

const close = (actual: number, expected: number, eps = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < eps, `expected ${expected}, got ${actual}`);

test("tokenize lowercases, strips punctuation, keeps internal apostrophes", () => {
  assert.deepEqual(tokenize("The Cat — it DOESN’T sit; really?"), [
    "the",
    "cat",
    "it",
    "doesn't",
    "sit",
    "really",
  ]);
  assert.deepEqual(tokenize("state-of-the-art"), ["state", "of", "the", "art"]);
  assert.deepEqual(tokenize("!!! ??? ..."), []);
});

test("mattr averages the TTR of every window", () => {
  // "a a b b" with window 2 → [a,a]=0.5, [a,b]=1, [b,b]=0.5 → mean 2/3
  close(mattr(["a", "a", "b", "b"], 2), 2 / 3);
});

test("mattr falls back to whole-text TTR below one window", () => {
  close(mattr(["a", "a", "b"], 50), 2 / 3);
  assert.equal(mattr([], 50), 0);
});

test("mattr window shifting matches a naive recompute", () => {
  const tokens = Array.from({ length: 600 }, (_, i) => `w${i % 37}`);
  const window = 50;
  let expected = 0;
  for (let i = 0; i + window <= tokens.length; i++) {
    expected += new Set(tokens.slice(i, i + window)).size / window;
  }
  close(mattr(tokens, window), expected / (tokens.length - window + 1), 1e-12);
});

test("mattr rejects a nonsensical window", () => {
  assert.throws(() => mattr(["a"], 0), RangeError);
});

test("mtld averages forward and backward factor lengths", () => {
  // "a b a b a b": a factor closes at every 3rd token (TTR 2/3 < 0.72), leaving
  // no remainder, in both directions → 6 tokens / 2 factors.
  close(mtld(["a", "b", "a", "b", "a", "b"]), 3);
});

test("mtld credits the trailing partial factor", () => {
  // Same text plus one token: the open sequence has TTR 1, so it adds 0 factors.
  close(mtld(["a", "b", "a", "b", "a", "b", "a"]), 3.5);
});

test("mtld returns the token count when no factor ever closes", () => {
  assert.equal(mtld(["a", "b", "c"]), 3);
  assert.equal(mtld([]), 0);
});

test("mtld ranks varied text above repetitive text", () => {
  const varied = tokenize(
    "the quiet harbour swallowed every returning trawler before dawn broke over granite cliffs"
  );
  const repetitive = tokenize(
    "the thing is the thing and the thing is the thing so the thing is the thing"
  );
  assert.ok(mtld(varied) > mtld(repetitive));
});

test("mtld rejects a threshold outside (0, 1)", () => {
  assert.throws(() => mtld(["a"], 1), RangeError);
});

test("hapaxRatio counts types occurring exactly once", () => {
  const tokens = ["a", "b", "b", "c"];
  close(hapaxRatio(frequencies(tokens), tokens.length), 0.5);
  assert.equal(hapaxRatio(new Map(), 0), 0);
});

test("yulesK follows 10⁴·(Σ count² − N)/N²", () => {
  // "a b b c": Σ count² = 1 + 4 + 1 = 6, N = 4 → 10⁴·(6−4)/16 = 1250
  const tokens = ["a", "b", "b", "c"];
  close(yulesK(frequencies(tokens), tokens.length), 1250);
  // All-unique text has zero excess repetition.
  close(yulesK(frequencies(["a", "b", "c"]), 3), 0);
  assert.equal(yulesK(new Map(), 0), 0);
});

test("yulesK rises with repetition", () => {
  const repetitive = tokenize("the thing is the thing and the thing is the thing again");
  const varied = tokenize("a quiet harbour swallowed every returning trawler before dawn");
  assert.ok(
    yulesK(frequencies(repetitive), repetitive.length) >
      yulesK(frequencies(varied), varied.length)
  );
});

test("analyzeLexicalMetrics reports all four metrics plus counts", () => {
  const result = analyzeLexicalMetrics("A cat. A cat! A dog?");
  assert.equal(result.tokenCount, 6);
  assert.equal(result.typeCount, 3);
  close(result.mattr, 3 / 6); // below one window → whole-text TTR
  close(result.hapaxRatio, 1 / 6); // only "dog"
  close(result.yulesK, (1e4 * (9 + 4 + 1 - 6)) / 36);
  assert.ok(result.mtld > 0);
});

test("analyzeLexicalMetrics handles empty input", () => {
  assert.deepEqual(analyzeLexicalMetrics("  ...  "), {
    tokenCount: 0,
    typeCount: 0,
    mattr: 0,
    mtld: 0,
    hapaxRatio: 0,
    yulesK: 0,
  });
});

test("analyzeLexicalMetrics honours option overrides", () => {
  const text = Array.from({ length: 120 }, (_, i) => `w${i % 9}`).join(" ");
  assert.notEqual(
    analyzeLexicalMetrics(text, { mattrWindow: 10 }).mattr,
    analyzeLexicalMetrics(text, { mattrWindow: 100 }).mattr
  );
  assert.notEqual(
    analyzeLexicalMetrics(text, { mtldThreshold: 0.5 }).mtld,
    analyzeLexicalMetrics(text, { mtldThreshold: 0.9 }).mtld
  );
});
