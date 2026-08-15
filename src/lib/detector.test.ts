import { test } from "node:test";
import assert from "node:assert/strict";

import { analyzeText } from "./detector.ts";

/** Rule IDs that fired anywhere in the document. */
const firedIds = (text: string) => new Set(analyzeText(text).breakdown.map((b) => b.id));

const sentenceTexts = (text: string) => analyzeText(text).sentences.map((s) => s.text);

// ─── Sentence splitting ───────────────────────────────────────────────────────

test("a lower-case sentence still starts a new sentence", () => {
  assert.deepEqual(sentenceTexts("The cat sat. the dog barked. it rained."), [
    "The cat sat.",
    "the dog barked.",
    "it rained.",
  ]);
});

test("abbreviations and initials do not split", () => {
  assert.deepEqual(sentenceTexts("Ask Dr. Smith about it. He knows."), [
    "Ask Dr. Smith about it.",
    "He knows.",
  ]);
  assert.deepEqual(sentenceTexts("Use fruit, e.g. apples, in the pie. Then bake."), [
    "Use fruit, e.g. apples, in the pie.",
    "Then bake.",
  ]);
  assert.deepEqual(sentenceTexts("It was J. R. Tolkien. Probably."), [
    "It was J. R. Tolkien.",
    "Probably.",
  ]);
});

test("closing quotes and multiple stops stay with their sentence", () => {
  assert.deepEqual(sentenceTexts(`He said "stop." She left.`), [
    `He said "stop."`,
    "She left.",
  ]);
  assert.deepEqual(sentenceTexts("Really?! I doubt it."), ["Really?!", "I doubt it."]);
});

test("a block with no terminal punctuation falls back to lines", () => {
  assert.deepEqual(sentenceTexts("- first item\n- second item"), [
    "- first item",
    "- second item",
  ]);
});

test("empty input yields an empty result", () => {
  assert.deepEqual(analyzeText("   "), { overallScore: 0, breakdown: [], sentences: [] });
});

// ─── Rule wiring ──────────────────────────────────────────────────────────────

test("C-03 covers every robotic transition, including thus and therefore", () => {
  for (const opener of ["Thus", "Therefore", "Furthermore", "Moreover", "Nonetheless"]) {
    assert.ok(
      firedIds(`${opener}, the committee approved the revised plan.`).has("C-03"),
      `${opener} did not fire C-03`
    );
  }
});

test("a phrase in one list fires exactly one rule", () => {
  // "of course" used to sit in both the padding and flattery lists.
  const fired = firedIds("Of course, the tide comes in twice a day.");
  assert.ok(fired.has("V-05"));
  assert.ok(!fired.has("C-01"));
});

// ─── S-01: uniform rhythm ─────────────────────────────────────────────────────

/** Ten sentences of near-identical length, no cliché vocabulary. */
const UNIFORM = Array.from(
  { length: 10 },
  (_, i) => `The team reviewed the ${i + 3} reports and filed the summary with the district office today.`
).join(" ");

/** Hand-written, deliberately bursty: one 3-word sentence, one 30-word sentence. */
const BURSTY = `My grandmother kept her buttons in a tin that once held shortbread. Hundreds of them. Bone, brass, one carved from a walnut shell. She'd tip them onto the kitchen table and let me sort them while she talked about the war, or the neighbours, or nothing at all. I never asked where they came from. I wish I had. The tin is on my shelf now and I still don't know.`;

test("S-01 fires on genuinely uniform sentence lengths", () => {
  assert.ok(firedIds(UNIFORM).has("S-01"));
});

test("S-01 leaves varied human writing alone", () => {
  const fired = firedIds(BURSTY);
  assert.ok(!fired.has("S-01"), [...fired].join(" "));
  // Nothing else should fire either — this is the false-positive guard.
  assert.equal(fired.size, 0);
  assert.ok(analyzeText(BURSTY).overallScore < 25, `scored ${analyzeText(BURSTY).overallScore}`);
});

test("S-01 needs a big enough sample to judge rhythm", () => {
  // The same uniform text cut to seven sentences is too short to call.
  const short = UNIFORM.split(". ").slice(0, 7).join(". ") + ".";
  assert.ok(!firedIds(short).has("S-01"));
});

test("S-01 judges spread relative to sentence length, not in raw words", () => {
  // Long sentences with the same absolute spread as the bursty text are uniform.
  const long = Array.from(
    { length: 10 },
    (_, i) =>
      `The regional committee met on the ${i + 3} of the month to review the quarterly figures submitted by every participating district office before the deadline.`
  ).join(" ");
  assert.ok(firedIds(long).has("S-01"));
});

// ─── Scoring ──────────────────────────────────────────────────────────────────

const AI_SAMPLE = `In conclusion, it is important to note that leveraging a holistic and multifaceted approach is paramount to the achievement of our strategic objectives. Furthermore, it is widely recognized that robust frameworks foster seamless alignment across all stakeholder groups. Additionally, this comprehensive solution ensures that every deliverable is both scalable and actionable. Moving forward, we must recognize the transformative potential of our innovative methodology. As demonstrated above, the nuanced interplay between cutting-edge paradigms and groundbreaking initiatives underscores our commitment to excellence. It cannot be overstated that the implementation of these state-of-the-art benchmarks will facilitate the development of a more synergistic ecosystem.`;

test("blatant AI text scores high without pinning the scale", () => {
  const score = analyzeText(AI_SAMPLE).overallScore;
  assert.ok(score > 75, `expected > 75, got ${score}`);
  assert.ok(score < 100, `expected headroom below 100, got ${score}`);
});

test("more evidence scores higher than less", () => {
  // The same text twice: same rule density, but long enough for the structural
  // rules to fire too. Structural signals must still be able to raise the score.
  const once = analyzeText(AI_SAMPLE).overallScore;
  const twice = analyzeText(`${AI_SAMPLE} ${AI_SAMPLE}`).overallScore;
  assert.ok(twice > once, `${twice} should exceed ${once}`);
  assert.ok(twice < 100, `expected headroom below 100, got ${twice}`);
});

test("no document reaches 100, however many signals fire", () => {
  // Every structural rule plus heavy cliché use across a long document.
  const kitchenSink = Array.from({ length: 6 }, () => AI_SAMPLE).join(" ");
  const score = analyzeText(kitchenSink).overallScore;
  assert.ok(score < 100, `expected headroom below 100, got ${score}`);
  assert.ok(score > 85, `expected a strong score, got ${score}`);
});

test("per-sentence scores stay in range", () => {
  for (const sr of analyzeText(`${AI_SAMPLE} ${AI_SAMPLE}`).sentences) {
    assert.ok(sr.score >= 0 && sr.score <= 100, `out of range: ${sr.score}`);
    assert.ok(Number.isInteger(sr.score));
  }
});

test("breakdown counts every rule that fired and nothing that did not", () => {
  const result = analyzeText(AI_SAMPLE);
  assert.ok(result.breakdown.length > 0);
  for (const item of result.breakdown) {
    assert.ok(item.hitCount > 0);
    const actual = result.sentences.filter((s) =>
      s.triggeredRules.some((r) => r.startsWith(`${item.id}:`))
    ).length;
    assert.equal(item.hitCount, actual, `${item.id} count`);
  }
});


