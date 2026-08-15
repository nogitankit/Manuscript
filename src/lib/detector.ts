/**
 * detector.ts
 *
 * Pure-heuristic AI essay detection engine.
 * No external APIs — all signal comes from local text analysis.
 *
 * Four detection categories (34 rules total):
 *   1. Vocabulary / Clichés        (rules V-01 … V-15)
 *   2. Structural / Burstiness     (rules S-01 … S-06)
 *   3. Formatting                  (rules F-01 … F-05)
 *   4. Communication / Hedging     (rules C-01 … C-08)
 *
 * 28 of them judge one sentence at a time; the six S-rules need the whole
 * document. Keep the counts in this header in step with the rule arrays below —
 * `ruleRatioToScore` is calibrated against the sentence-rule count.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** A single detection rule that can be applied at the sentence level. */
export interface DetectionRule {
  /** Short, unique identifier – e.g. "V-01". */
  id: string;
  /** Human-readable description shown in the breakdown. */
  label: string;
  /** Which high-level category this rule belongs to. */
  category: "vocabulary" | "structural" | "formatting" | "communication";
  /**
   * Test one sentence (already lower-cased for convenience).
   * Returns true when the rule fires.
   */
  test: (sentence: string, lowerSentence: string) => boolean;
}

/** Per-sentence result produced by `analyzeText`. */
export interface SentenceResult {
  text: string;
  /** 0–100 score for this sentence alone. */
  score: number;
  /** IDs + labels of every rule that fired on this sentence. */
  triggeredRules: string[];
}

/** Full document result returned by `analyzeText`. */
export interface AnalysisResult {
  /** Overall AI-likelihood score from 0 (human) to 100 (AI). */
  overallScore: number;
  /** Every rule that fired at least once anywhere in the document. */
  breakdown: Array<{ id: string; label: string; category: string; hitCount: number }>;
  /** Per-sentence detail array. */
  sentences: SentenceResult[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Abbreviations whose full stop does not end a sentence. Also catches single
 * initials ("J. Smith") via the leading single-letter alternative.
 */
const ABBREVIATION_END =
  /(?:^|\s)(?:[a-z]|mr|mrs|ms|dr|prof|rev|sr|jr|st|vs|etc|e\.g|i\.e|cf|al|fig|no|vol|pp|inc|ltd|co|approx)\.$/i;

/**
 * Split text into sentences at `.`, `!` or `?` followed by whitespace.
 *
 * The next sentence does *not* have to start with a capital — requiring one
 * silently glued a lower-case sentence onto its predecessor, and the pair was
 * then scored as a single long sentence, which skewed every length statistic.
 * Abbreviations are excluded by looking at the text *before* the stop instead.
 */
function splitIntoSentences(text: string): string[] {
  const raw: string[] = [];
  // Terminal punctuation, any closing quote/bracket, then whitespace.
  const boundary = /([.!?]+["'”’)\]]?)\s+/g;
  let start = 0;
  let match: RegExpExecArray | null;

  while ((match = boundary.exec(text)) !== null) {
    const chunk = text.slice(start, match.index + match[1].length);
    if (ABBREVIATION_END.test(chunk)) continue; // "e.g. " — not a real boundary
    const trimmed = chunk.trim();
    if (trimmed.length > 0) raw.push(trimmed);
    start = boundary.lastIndex;
  }

  const tail = text.slice(start).trim();
  if (tail.length > 0) raw.push(tail);

  // Fallback: if the whole text was one block, treat each line as a sentence.
  if (raw.length === 1 && text.includes("\n")) {
    return text
      .split(/\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  return raw;
}

/** Word count for a string. */
function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** Mean of an array of numbers. */
function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** Sample standard deviation of an array of numbers. */
function stdDev(nums: number[]): number {
  if (nums.length < 2) return 0;
  const m = mean(nums);
  const variance = nums.reduce((acc, n) => acc + (n - m) ** 2, 0) / (nums.length - 1);
  return Math.sqrt(variance);
}

/** Build a regex that matches any entry in `phrases` as a whole phrase. */
function phraseRegex(phrases: string[]): RegExp {
  return new RegExp(`\\b(${alternation(phrases)})\\b`, "i");
}

/** Same, but only when the phrase opens the string. */
function openingPhraseRegex(phrases: string[]): RegExp {
  return new RegExp(`^(${alternation(phrases)})\\b`, "i");
}

/** Escaped alternation, longest first so a prefix never shadows a longer entry. */
function alternation(phrases: string[]): string {
  return [...phrases]
    .sort((a, b) => b.length - a.length)
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
}

// ─── Rule Dictionaries ────────────────────────────────────────────────────────

/**
 * V-01 – Core AI clichés
 * Words and short phrases that AI models statistically overuse.
 */
const CORE_AI_CLICHES: string[] = [
  "delve",
  "delves",
  "delved",
  "tapestry",
  "testament",
  "nuanced",
  "multifaceted",
  "pivotal",
  "paramount",
  "underscore",
  "underscores",
  "underscored",
  "crucial",
  "imperative",
  "foster",
  "fosters",
  "fostered",
  "fostering",
  "leverage",
  "leverages",
  "leveraged",
  "leveraging",
  "synergy",
  "synergies",
  "synergistic",
  "holistic",
  "robust",
  "comprehensive",
  "myriad",
  "plethora",
  "myriad of",
  "plethora of",
  "cutting-edge",
  "state-of-the-art",
  "groundbreaking",
  "game-changing",
  "transformative",
  "innovative",
  "paradigm",
  "paradigm shift",
  "landscape",
  "ecosystem",
  "stakeholder",
  "stakeholders",
  "actionable",
  "scalable",
  "seamless",
  "streamline",
  "streamlines",
  "streamlined",
  // ── Extended ChatGPT-specific vocabulary ──
  "plays a crucial role",
  "plays a vital role",
  "plays a significant role",
  "plays a key role",
  "plays an important role",
  "sheds light on",
  "shed light on",
  "in today's world",
  "in today's society",
  "in the modern world",
  "in the contemporary world",
  "throughout history",
  "at its core",
  "on a deeper level",
  "a wide range of",
  "a variety of",
  "a number of",
  "a significant number of",
  "in the realm of",
  "when it comes to",
  "one of the most",
  "serves as a reminder",
  "highlights the importance",
  "highlight the importance",
  "underscores the importance",
  "underscore the importance",
  "demonstrates the importance",
  "it is essential",
  "it is clear that",
  "it is evident that",
  "it is undeniable that",
  "it is widely acknowledged",
  "it is increasingly important",
  "cannot be understated",
  "cannot be overstated",
  "of utmost importance",
  "of the utmost importance",
  "is of great importance",
  "is of paramount importance",
  "as a society",
  "as a whole",
  "in the context of",
  "in the face of",
  "in the wake of",
  "in an ever-changing",
  "in an increasingly",
  "not only",
  "but also",
  "both",
  "a crucial role",
  "a vital role",
  "a key role",
  "pave the way",
  "paves the way",
  "bridge the gap",
  "bridges the gap",
  "give rise to",
  "gives rise to",
  "navigate the complexities",
  "navigate the challenges",
  "unprecedented challenges",
  "unprecedented opportunities",
  "empower individuals",
  "empower people",
  "drive innovation",
  "drives innovation",
  "promote understanding",
  "promote awareness",
  "foster understanding",
  "foster collaboration",
  "foster innovation",
  "long-term success",
  "positive impact",
  "significant impact",
  "profound impact",
  "lasting impact",
];

/**
 * V-02 – Conclusory / summary phrases
 * Phrases AI uses to signal structure, especially at sentence starts.
 */
const CONCLUSORY_PHRASES: string[] = [
  "in conclusion",
  "to summarize",
  "to conclude",
  "in summary",
  "to sum up",
  "overall",
  "all in all",
  "in short",
  "in brief",
  "ultimately",
  "at the end of the day",
  "taking everything into account",
  "when all is said and done",
  "in the final analysis",
  "to wrap up",
  "as we have seen",
  "as demonstrated above",
  "as outlined above",
  "as noted above",
];

/**
 * V-03 – Importance / emphasis phrases
 */
const IMPORTANCE_PHRASES: string[] = [
  "it is important to note",
  "it is important to remember",
  "it is worth noting",
  "it is crucial to",
  "it is essential to",
  "it is imperative to",
  "it must be noted",
  "it should be noted",
  "it is vital to",
  "it cannot be overstated",
  "one must consider",
  "we must recognize",
  "we must acknowledge",
];

/**
 * V-04 – Tapestry / richness metaphors
 */
const RICHNESS_METAPHORS: string[] = [
  "a tapestry of",
  "a rich tapestry",
  "a mosaic of",
  "a symphony of",
  "a testament to",
  "a hallmark of",
  "a cornerstone of",
  "a beacon of",
  "a pillar of",
  "a fabric of",
  "the fabric of",
  "a web of",
  "a spectrum of",
];

/**
 * V-05 – Verbose "booster" phrases that pad sentences
 */
const VERBOSE_BOOSTERS: string[] = [
  "it goes without saying",
  "needless to say",
  "of course",
  "as everyone knows",
  "as is widely known",
  "as is well known",
  "it is widely recognized",
  "it is generally accepted",
  "suffice it to say",
  "it stands to reason",
  "by the same token",
  "on the other hand",
  "on the contrary",
  "it bears repeating",
];

/**
 * C-01 – Sycophantic openers
 *
 * "of course" lives in VERBOSE_BOOSTERS (V-05) instead: a phrase in two lists
 * fires two rules for one piece of evidence and double-counts in the score.
 */
const SYCOPHANTIC_PHRASES: string[] = [
  "great question",
  "excellent question",
  "good question",
  "fantastic question",
  "wonderful question",
  "that's a great",
  "that is a great",
  "i'm glad you asked",
  "i am glad you asked",
  "certainly",
  "absolutely",
  "sure thing",
  "happy to help",
];

/**
 * C-02 – Hedging phrases
 */
const HEDGING_PHRASES: string[] = [
  "it could be argued",
  "one might argue",
  "some might say",
  "it is possible that",
  "there is a possibility that",
  "it may be the case",
  "it might be the case",
  "arguably",
  "seemingly",
  "ostensibly",
  "presumably",
  "in some sense",
  "to some extent",
  "to a certain degree",
  "to a large extent",
  "in many respects",
  "in certain respects",
  "broadly speaking",
  "generally speaking",
  "for all intents and purposes",
];

/**
 * C-03 – Robotic transition markers
 */
const ROBOTIC_TRANSITIONS: string[] = [
  "furthermore",
  "moreover",
  "additionally",
  "subsequently",
  "consequently",
  "in addition",
  "in this regard",
  "in this context",
  "with this in mind",
  "bearing this in mind",
  "in light of this",
  "given the above",
  "as a result",
  "as such",
  "thus",
  "hence",
  "therefore",
  "accordingly",
  "notwithstanding",
  "nevertheless",
  "nonetheless",
];

/**
 * C-04 – Passive voice markers (simplified heuristic)
 */
const PASSIVE_VOICE_MARKERS: string[] = [
  "it has been",
  "it was noted",
  "it was found",
  "it was observed",
  "it was determined",
  "it was established",
  "it was demonstrated",
  "it was shown",
  "it was concluded",
  "it has been shown",
  "it has been found",
  "it has been noted",
  "it has been established",
  "it is believed",
  "it is known",
  "it is understood",
];

// ─── Rule Definitions ─────────────────────────────────────────────────────────

const CORE_CLICHE_REGEX = phraseRegex(CORE_AI_CLICHES);
const CONCLUSORY_REGEX = phraseRegex(CONCLUSORY_PHRASES);
const IMPORTANCE_REGEX = phraseRegex(IMPORTANCE_PHRASES);
const RICHNESS_REGEX = phraseRegex(RICHNESS_METAPHORS);
const VERBOSE_REGEX = phraseRegex(VERBOSE_BOOSTERS);
const SYCO_REGEX = phraseRegex(SYCOPHANTIC_PHRASES);
const HEDGE_REGEX = phraseRegex(HEDGING_PHRASES);
const PASSIVE_REGEX = phraseRegex(PASSIVE_VOICE_MARKERS);
const TRANSITION_OPENER_REGEX = openingPhraseRegex(ROBOTIC_TRANSITIONS);

/**
 * Master list of all sentence-level rules.
 * Document-level rules (burstiness, list density, etc.) are handled separately
 * because they need the full sentence array — they are injected into the
 * per-sentence result after global analysis.
 */
const SENTENCE_RULES: DetectionRule[] = [
  // ── Vocabulary / Clichés ──────────────────────────────────────────────────

  {
    id: "V-01",
    label: "Core AI clichés detected",
    category: "vocabulary",
    test: (_, low) => CORE_CLICHE_REGEX.test(low),
  },
  {
    id: "V-02",
    label: "Conclusory / summary phrase detected",
    category: "vocabulary",
    test: (_, low) => CONCLUSORY_REGEX.test(low),
  },
  {
    id: "V-03",
    label: "Importance / emphasis boilerplate detected",
    category: "vocabulary",
    test: (_, low) => IMPORTANCE_REGEX.test(low),
  },
  {
    id: "V-04",
    label: "Richness / tapestry metaphor detected",
    category: "vocabulary",
    test: (_, low) => RICHNESS_REGEX.test(low),
  },
  {
    id: "V-05",
    label: "Verbose booster phrase detected",
    category: "vocabulary",
    test: (_, low) => VERBOSE_REGEX.test(low),
  },
  {
    id: "V-06",
    label: "Overuse of abstract / corporate nouns (3+ in one sentence)",
    category: "vocabulary",
    test: (_, low) => {
      const corporateNouns = [
        "framework", "solution", "strategy", "initiative", "approach",
        "methodology", "objective", "outcome", "deliverable", "milestone",
        "benchmark", "metric", "impact", "alignment", "vision",
      ];
      const count = corporateNouns.filter((w) => low.includes(w)).length;
      return count >= 3;
    },
  },
  {
    id: "V-07",
    label: "Excessive superlatives (most, best, greatest, highest, lowest)",
    category: "vocabulary",
    test: (_, low) => {
      const superlatives = /\b(most|best|greatest|highest|lowest|worst|finest|largest|smallest|fastest|slowest|strongest|weakest)\b/gi;
      return ((low.match(superlatives) ?? []).length) >= 2;
    },
  },
  {
    id: "V-08",
    label: "Vague positive descriptors (excellent, outstanding, exceptional)",
    category: "vocabulary",
    test: (_, low) =>
      /\b(excellent|outstanding|exceptional|remarkable|extraordinary|unprecedented|unparalleled|incomparable)\b/i.test(low),
  },
  {
    id: "V-09",
    label: "Generic call-to-action language detected",
    category: "vocabulary",
    test: (_, low) =>
      /\b(moving forward|going forward|in order to|with a view to|with the aim of|with the goal of)\b/i.test(low),
  },
  {
    id: "V-10",
    label: "Overly formal synonym for simple words",
    category: "vocabulary",
    test: (_, low) =>
      /\b(utilize|utilizes|utilized|utilizing|endeavour|endeavor|commence|commenced|commencing|facilitate|facilitated|facilitates|facilitating|ascertain|ascertained|deem|deemed|endeavour|transpire|transpired|elucidate|elucidated)\b/i.test(low),
  },
  {
    id: "V-11",
    label: "Redundant filler phrases (due to the fact that, in the event that)",
    category: "vocabulary",
    test: (_, low) =>
      /\b(due to the fact that|in the event that|in spite of the fact that|for the purpose of|with the exception of|in the absence of|on the basis of|by means of|in terms of)\b/i.test(low),
  },
  {
    id: "V-12",
    label: "Overused 'ensure' / 'ensure that' pattern",
    category: "vocabulary",
    test: (_, low) =>
      /\b(ensure(s|d)?\s+that|ensure(s|d)?)\b/i.test(low),
  },
  {
    id: "V-13",
    label: "Double-hedged certainty (may possibly, might perhaps)",
    category: "vocabulary",
    test: (_, low) =>
      /\b(may possibly|might perhaps|could potentially|may potentially|might conceivably|could conceivably)\b/i.test(low),
  },
  {
    id: "V-14",
    label: "Nominalization overuse (the achievement of, the implementation of)",
    category: "vocabulary",
    test: (_, low) => {
      const nominalizations = [
        "the achievement of", "the implementation of", "the development of",
        "the establishment of", "the determination of", "the identification of",
        "the provision of", "the creation of", "the assessment of",
        "the evaluation of",
      ];
      return nominalizations.some((n) => low.includes(n));
    },
  },

  {
    id: "V-15",
    label: "ChatGPT essay-frame opener (This essay will, In this essay, This paper aims to)",
    category: "vocabulary",
    test: (_, low) =>
      /^(this essay (will|aims|explores?|examines?|argues?|discusses?|seeks to|is going to)|in this essay,?\s|this paper (will|aims|explores?|examines?|argues?|seeks to)|the purpose of this (essay|paper)|the aim of this (essay|paper)|this (article|piece|study|report) (will|aims|explores?|examines?)|throughout this (essay|paper|article)|as (we|i) (will|shall) (explore|examine|discuss|argue|see)|this (essay|paper|article|piece) (will|seeks to|aims to)|one of the most (important|significant|pressing|critical|compelling))/i.test(
        low.trim()
      ),
  },

  // ── Formatting ────────────────────────────────────────────────────────────

  {
    id: "F-01",
    label: "Inline enumerated list (1. ... 2. ...) inside a paragraph",
    category: "formatting",
    test: (s) => /\b1\.\s[\s\S]+\b2\.\s/.test(s),
  },
  {
    id: "F-02",
    label: "Title-case heading mid-paragraph (4+ consecutive title-case words)",
    category: "formatting",
    test: (s) => {
      const titleCaseRun = /(?:^|(?<=\.\s))([A-Z][a-z]+\s){4,}/gm;
      return titleCaseRun.test(s);
    },
  },
  {
    id: "F-03",
    label: "Excessive colon usage (more than 2 colons in one sentence)",
    category: "formatting",
    test: (s) => (s.match(/:/g) ?? []).length > 2,
  },
  {
    id: "F-04",
    label: "Markdown bold/header syntax in plain-text context (**word** or ##)",
    category: "formatting",
    test: (s) => /(\*\*[^*]+\*\*|^#{1,3}\s)/m.test(s),
  },
  {
    id: "F-05",
    label: "Bullet-point list detected inside continuous prose",
    category: "formatting",
    test: (s) => /^\s*[-•*]\s+/m.test(s),
  },

  // ── Communication / Hedging ───────────────────────────────────────────────

  {
    id: "C-01",
    label: "Sycophantic opener detected",
    category: "communication",
    test: (_, low) => SYCO_REGEX.test(low),
  },
  {
    id: "C-02",
    label: "Excessive hedging language detected",
    category: "communication",
    test: (_, low) => HEDGE_REGEX.test(low),
  },
  {
    id: "C-03",
    label: "Robotic transition marker at sentence start",
    category: "communication",
    test: (_, low) => TRANSITION_OPENER_REGEX.test(low.trim()),
  },
  {
    id: "C-04",
    label: "Passive voice boilerplate detected",
    category: "communication",
    test: (_, low) => PASSIVE_REGEX.test(low),
  },
  {
    id: "C-05",
    label: "First-person plural 'we' in essay context (we can see, we must)",
    category: "communication",
    test: (_, low) =>
      /\b(we can see|we must|we should|we need to|we have seen|we have discussed|we observe|we note)\b/i.test(low),
  },
  {
    id: "C-06",
    label: "Rhetorical question followed immediately by an answer",
    category: "communication",
    test: (s) =>
      /\?\s*(the answer (is|lies)|this (is|means|demonstrates|shows|reveals))/i.test(s),
  },
  {
    id: "C-07",
    label: "Over-qualifying adverbs in excess (3+ per sentence)",
    category: "communication",
    test: (_, low) => {
      const qualifiers = /\b(very|quite|rather|somewhat|fairly|relatively|moderately)\b/gi;
      return ((low.match(qualifiers) ?? []).length) >= 3;
    },
  },
  {
    id: "C-08",
    label: "Imperative instructional tone (make sure to, remember to, bear in mind)",
    category: "communication",
    test: (_, low) =>
      /\b(do not forget to|don't forget to|make sure to|be sure to|remember to|keep in mind that|bear in mind that|note that)\b/i.test(low),
  },
];

// ─── Document-Level (Structural / Burstiness) Rules ─────────────────────────

interface DocumentSignal {
  ruleId: string;
  label: string;
  sentenceIndices: number[];
  weight: number;
}

/**
 * Analyse the whole sentence array for structural / burstiness signals.
 * Returns a list of signals, each carrying which sentences are implicated.
 */
function analyzeDocumentStructure(sentences: string[]): DocumentSignal[] {
  const signals: DocumentSignal[] = [];
  const lengths = sentences.map(wordCount);

  // S-01 – Low sentence-length variation (AI uniform rhythm)
  //
  // Measured as spread relative to the mean, not in raw words: 7 words of
  // spread is uniform in a document averaging 30-word sentences and bursty in
  // one averaging 12. An absolute `sd < 8` threshold could not tell those
  // apart, and fired on almost any tidy human paragraph.
  //
  // Human prose typically sits at 0.5–0.7 relative spread; a model that has
  // settled into one rhythm sits near 0.2–0.35. Four sentences was far too
  // small a sample to call either way, hence the floor of 8.
  const sd = stdDev(lengths);
  const avg = mean(lengths);
  const relativeSpread = avg > 0 ? sd / avg : 0;
  if (sentences.length >= 8 && relativeSpread < 0.35 && avg > 8) {
    signals.push({
      ruleId: "S-01",
      label: "Low sentence-length variation (uniform rhythm typical of AI)",
      sentenceIndices: sentences.map((_, i) => i),
      weight: 0.8,
    });
  }

  // S-02 – Overly long average sentence length
  if (avg > 28) {
    const longIdx = lengths
      .map((l, i) => (l > 28 ? i : -1))
      .filter((i) => i >= 0);
    signals.push({
      ruleId: "S-02",
      label: "Average sentence length exceeds 28 words (verbose AI style)",
      sentenceIndices: longIdx,
      weight: 0.7,
    });
  }

  // S-03 – 70 %+ of sentences in the 15–25 word AI sweet-spot
  const uniformBand = lengths.filter((l) => l >= 15 && l <= 25).length;
  if (sentences.length >= 5 && uniformBand / sentences.length > 0.7) {
    signals.push({
      ruleId: "S-03",
      label: "70 %+ of sentences fall in the 15–25 word band (AI sweet-spot)",
      sentenceIndices: lengths
        .map((l, i) => (l >= 15 && l <= 25 ? i : -1))
        .filter((i) => i >= 0),
      weight: 0.75,
    });
  }

  // S-04 – Absence of very short sentences
  const shortSentences = lengths.filter((l) => l < 6).length;
  if (sentences.length >= 6 && shortSentences === 0) {
    signals.push({
      ruleId: "S-04",
      label: "No short sentences (< 6 words) — humans naturally vary length",
      sentenceIndices: sentences.map((_, i) => i),
      weight: 0.6,
    });
  }

  // S-05 – Repeated three-part parallel structure
  const triplePattern = /\b(\w+),\s\w+,\s(?:and|or)\s\w+\b/i;
  const tripleHits = sentences
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => triplePattern.test(s));
  if (tripleHits.length >= 2) {
    signals.push({
      ruleId: "S-05",
      label: "Repeated use of three-part parallel lists (e.g. 'X, Y, and Z')",
      sentenceIndices: tripleHits.map(({ i }) => i),
      weight: 0.5,
    });
  }

  // S-06 – Multiple conclusory sentence openers
  const conclusoryStarters = [
    /^in conclusion/i,
    /^to summarize/i,
    /^in summary/i,
    /^ultimately/i,
    /^overall/i,
    /^in short/i,
    /^all in all/i,
    /^thus/i,
    /^therefore/i,
    /^as a result/i,
  ];
  const conclusoryHits = sentences
    .map((s, i) => ({ s: s.trim(), i }))
    .filter(({ s }) => conclusoryStarters.some((re) => re.test(s)));
  if (conclusoryHits.length >= 2) {
    signals.push({
      ruleId: "S-06",
      label: "Multiple sentences begin with conclusory transitions",
      sentenceIndices: conclusoryHits.map(({ i }) => i),
      weight: 0.8,
    });
  }

  return signals;
}

// ─── Scoring Maths ────────────────────────────────────────────────────────────

/**
 * Convert a raw rule-hit ratio (0–1) into a 0–100 score.
 *
 * Measured calibration over the 28 sentence-level rules:
 *   0 rules fired  →  16   (baseline noise floor — the scale does not start at 0)
 *   1 rule  fired  →  24
 *   2 rules fired  →  34
 *   3 rules fired  →  46
 *   5 rules fired  →  69
 *   8 rules fired  →  91
 *
 * Logistic centred at 0.12 with steepness 14.
 */
function ruleRatioToScore(hitRatio: number): number {
  const score = 100 / (1 + Math.exp(-14 * (hitRatio - 0.12)));
  return Math.min(100, Math.max(0, Math.round(score)));
}

/**
 * Apply a structural signal by closing `weight × fraction` of the distance to
 * 100, rather than adding flat points.
 *
 * Flat addition saturated: six signals at +14 each pinned any document with a
 * few structural hits to exactly 100, so "very likely AI" could not be graded
 * any finer and the top of the scale carried no information. Closing a share of
 * the remaining headroom keeps every signal meaningful and never reaches 100.
 */
function closeGap(score: number, weight: number, fraction: number): number {
  return score + (100 - score) * weight * fraction;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Analyse a piece of text and return a structured AI-detection result.
 *
 * @param text - The raw essay / passage to analyse.
 * @returns    - An `AnalysisResult` with `overallScore`, `breakdown`, and `sentences`.
 */
export function analyzeText(text: string): AnalysisResult {
  if (!text || text.trim().length === 0) {
    return { overallScore: 0, breakdown: [], sentences: [] };
  }

  const rawSentences = splitIntoSentences(text);

  // ── 1. Per-sentence rule evaluation ────────────────────────────────────────

  const sentenceResults: SentenceResult[] = rawSentences.map((sentence) => {
    const lower = sentence.toLowerCase();
    const firedRules: string[] = [];

    for (const rule of SENTENCE_RULES) {
      if (rule.test(sentence, lower)) {
        firedRules.push(`${rule.id}: ${rule.label}`);
      }
    }

    const rawRatio = firedRules.length / SENTENCE_RULES.length;
    const score = ruleRatioToScore(rawRatio);

    return { text: sentence, score, triggeredRules: firedRules };
  });

  // ── 2. Document-level structural analysis ──────────────────────────────────

  const docSignals = analyzeDocumentStructure(rawSentences);

  for (const signal of docSignals) {
    const tag = `${signal.ruleId}: ${signal.label}`;
    for (const idx of signal.sentenceIndices) {
      if (idx < sentenceResults.length) {
        const sr = sentenceResults[idx];
        if (!sr.triggeredRules.includes(tag)) {
          sr.triggeredRules.push(tag);
          sr.score = Math.round(closeGap(sr.score, signal.weight, 0.2));
        }
      }
    }
  }

  // ── 3. Overall score ───────────────────────────────────────────────────────

  // Component A: word-count-weighted average of per-sentence scores (0–100)
  const sentenceWeights = rawSentences.map(wordCount);
  const totalWeight = sentenceWeights.reduce((a, b) => a + b, 0) || 1;
  const weightedSum = sentenceResults.reduce(
    (acc, sr, i) => acc + sr.score * sentenceWeights[i],
    0
  );
  const weightedAvg = weightedSum / totalWeight;

  // Component B: flagged-sentence ratio (0–100).
  // Sentences with ≥1 vocabulary/communication rule are counted as "flagged".
  // This prevents a few clean sentences from diluting a heavily AI-flagged doc.
  const flaggedCount = sentenceResults.filter(
    (sr) => sr.triggeredRules.some((r) => !r.startsWith("S-"))
  ).length;
  const flaggedRatio = sentenceResults.length > 0
    ? flaggedCount / sentenceResults.length
    : 0;
  // Apply same logistic to the flagged ratio for a consistent scale
  const flaggedScore = 100 / (1 + Math.exp(-14 * (flaggedRatio - 0.35)));

  // Blend: 65% sentence-level signal + 35% document-wide flagged ratio
  let overallScore = 0.65 * weightedAvg + 0.35 * flaggedScore;

  // Component C: structural document signals — each closes a share of the gap
  // to 100, so several signals compound without ever pinning the scale.
  for (const signal of docSignals) {
    overallScore = closeGap(overallScore, signal.weight, 0.2);
  }
  overallScore = Math.min(100, Math.max(0, Math.round(overallScore)));

  // ── 4. Breakdown ───────────────────────────────────────────────────────────

  const hitMap = new Map<string, { label: string; category: string; hitCount: number }>();

  for (const rule of SENTENCE_RULES) {
    hitMap.set(rule.id, { label: rule.label, category: rule.category, hitCount: 0 });
  }
  for (const signal of docSignals) {
    hitMap.set(signal.ruleId, { label: signal.label, category: "structural", hitCount: 0 });
  }

  for (const sr of sentenceResults) {
    for (const tag of sr.triggeredRules) {
      const ruleId = tag.split(":")[0].trim();
      const entry = hitMap.get(ruleId);
      if (entry) {
        entry.hitCount += 1;
      }
    }
  }

  const breakdown = Array.from(hitMap.entries())
    .filter(([, v]) => v.hitCount > 0)
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.hitCount - a.hitCount);

  return { overallScore, breakdown, sentences: sentenceResults };
}
