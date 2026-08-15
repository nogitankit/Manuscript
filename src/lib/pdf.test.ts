import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizePdfText } from "./pdf.ts";

test("joins hard-wrapped lines into flowing prose", () => {
  assert.equal(
    normalizePdfText("It is important to note\nthat this claim is robust."),
    "It is important to note that this claim is robust."
  );
});

test("rejoins words split across a line break", () => {
  assert.equal(normalizePdfText("a multifaceted para-\ndigm shift"), "a multifaceted paradigm shift");
});

test("keeps paragraph breaks", () => {
  assert.equal(normalizePdfText("First para.\n\n\n\nSecond para."), "First para.\n\nSecond para.");
});

test("keeps bullets and numbered items on their own lines", () => {
  assert.equal(
    normalizePdfText("Key points:\n- alignment\n- synergy\n1. first\n2. second"),
    "Key points:\n- alignment\n- synergy\n1. first\n2. second"
  );
});

test("normalizes ligatures and collapses runs of spaces", () => {
  assert.equal(normalizePdfText("  eﬃcient   \tsynergy  "), "efficient synergy");
});

test("empty input stays empty", () => {
  assert.equal(normalizePdfText("   \n\n  \n"), "");
});
