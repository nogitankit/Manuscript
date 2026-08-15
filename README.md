# Manuscript

Paste an essay in, get a 0–100 guess at whether a machine wrote it, plus a
highlighted copy of the text showing which sentences caused the guess.

Nothing is sent anywhere. There is no model and no API key. Every judgement
comes from reading the text with plain rules that live in this repo, so you can
open `src/lib/detector.ts` and see exactly why any score came out the way it did.

---

## How it decides

Four families of checks run over your text. Twenty-eight of them look at one
sentence at a time; six look at the document as a whole.

| Family | What it notices | Count |
|---|---|---|
| Words and phrases | Vocabulary that chatbots reach for far more than people do | 15 (`V-01`…`V-15`) |
| Shape of the writing | Sentences that are all suspiciously similar in length | 6 (`S-01`…`S-06`) |
| Formatting | Chat-window furniture left behind in prose | 5 (`F-01`…`F-05`) |
| Tone and manner | Hedging, flattery, lecturing | 8 (`C-01`…`C-08`) |

### 1. Words and phrases

The biggest family, and the bluntest. Roughly 180 words and stock phrases are
kept in lists and matched as whole words. Not because a human would never write
them, but because chatbots write them constantly.

| Rule | Looks for | Examples from the actual lists |
|---|---|---|
| `V-01` | Signature chatbot vocabulary | *delve, tapestry, testament, nuanced, multifaceted, pivotal, paramount, underscore, foster, leverage, synergy, holistic, robust, myriad, plethora, cutting-edge, groundbreaking, transformative, paradigm, landscape, ecosystem, stakeholder, seamless, streamline, plays a crucial role, sheds light on, in today's world, when it comes to, cannot be overstated, pave the way, bridge the gap, navigate the complexities, drive innovation, lasting impact* — about 130 entries |
| `V-02` | Wrapping-up phrases | *in conclusion, to summarize, in summary, all in all, ultimately, at the end of the day, as demonstrated above* |
| `V-03` | Telling you something matters instead of showing it | *it is important to note, it is worth noting, it should be noted, we must recognize* |
| `V-04` | Rich-fabric metaphors | *a tapestry of, a mosaic of, a symphony of, a testament to, a cornerstone of, a beacon of* |
| `V-05` | Padding that adds nothing | *it goes without saying, needless to say, as everyone knows, suffice it to say, on the other hand* |
| `V-06` | Three or more office nouns crammed into one sentence | *framework, solution, strategy, initiative, approach, methodology, objective, outcome, deliverable, milestone, benchmark, metric, impact, alignment, vision* |
| `V-07` | Two or more superlatives in one sentence | *most, best, greatest, highest, lowest, worst, largest, fastest, strongest* |
| `V-08` | Praise with no content | *excellent, outstanding, exceptional, remarkable, extraordinary, unprecedented, unparalleled* |
| `V-09` | Meeting-speak about intent | *moving forward, going forward, in order to, with the aim of, with the goal of* |
| `V-10` | A long word where a short one would do | *utilize, commence, facilitate, ascertain, deem, elucidate, endeavour* |
| `V-11` | Filler connectives | *due to the fact that, in the event that, for the purpose of, on the basis of, by means of, in terms of* |
| `V-12` | Any use of *ensure* | *ensure, ensures, ensured, ensure that* |
| `V-13` | Hedging twice in a row | *may possibly, might perhaps, could potentially, might conceivably* |
| `V-14` | Turning verbs into nouns | *the achievement of, the implementation of, the development of, the establishment of, the provision of* |
| `V-15` | Essay-frame openers, only at the start of a sentence | *This essay will…, In this essay,…, This paper aims to…, The purpose of this essay…, One of the most important…* |

### 2. Shape of the writing

The only family that needs the whole document. People write in bursts — a
fourteen-word sentence, then a three-word one, then a rambling thirty-word one.
Chatbots tend to settle into one comfortable length and stay there. These six
checks measure that evenness directly.

| Rule | Fires when | Needs at least | Weight |
|---|---|---|---|
| `S-01` | Sentence lengths barely vary — spread is under 35% of the average length — and the average is over 8 words | 8 sentences | 0.8 |
| `S-02` | Average sentence runs over 28 words | — | 0.7 |
| `S-03` | Over 70% of sentences land in the 15–25 word band | 5 sentences | 0.75 |
| `S-04` | Not one sentence is shorter than 6 words | 6 sentences | 0.6 |
| `S-05` | Two or more "X, Y, and Z" triplets | — | 0.5 |
| `S-06` | Two or more sentences open with a wrap-up word (*in conclusion, ultimately, overall, thus, therefore, as a result*) | — | 0.8 |

`S-01` measures spread *relative* to the average, not in raw words. Seven words
of variation is uniform in a document averaging thirty-word sentences and bursty
in one averaging twelve; a fixed word threshold cannot tell those apart. Human
prose usually varies by 50–70% of its average; a model in a groove sits near
20–35%.


### 3. Formatting

Signs the text was copied out of a chat window rather than written into a
document.

| Rule | Fires on |
|---|---|
| `F-01` | A numbered list inlined into a paragraph — `1. … 2. …` |
| `F-02` | Four or more Title Case Words In A Row, mid-paragraph — a heading that lost its line break |
| `F-03` | More than two colons in one sentence |
| `F-04` | Leftover Markdown — `**bold**` or `##` headings in plain text |
| `F-05` | A line starting with `-`, `•` or `*` in the middle of continuous prose |

### 4. Tone and manner

| Rule | Fires on | Examples |
|---|---|---|
| `C-01` | Flattery and eager agreement | *great question, excellent question, I'm glad you asked, certainly, absolutely, happy to help* |
| `C-02` | Refusing to commit | *it could be argued, one might argue, arguably, seemingly, presumably, to some extent, broadly speaking* |
| `C-03` | A stiff connective opening the sentence | *furthermore, moreover, additionally, subsequently, consequently, in addition, in this regard, in this context, with this in mind, in light of this, given the above, as a result, as such, thus, hence, therefore, accordingly, notwithstanding, nevertheless, nonetheless* |
| `C-04` | Facts with the actor removed | *it has been shown, it was found, it was concluded, it is believed, it is known* |
| `C-05` | Textbook "we" | *we can see, we must, we should, we have seen, we observe* |
| `C-06` | Asking a question and answering it in the same breath | *"…? The answer is…"*, *"…? This demonstrates…"* |
| `C-07` | Three or more softeners in one sentence | *very, quite, rather, somewhat, fairly, relatively, moderately* |
| `C-08` | Talking to you like a manual | *make sure to, be sure to, remember to, keep in mind that, note that* |

---

## Turning checks into a number

**Step 1 — split into sentences.** Text is cut at `.`, `!` or `?` followed by a
space, keeping any closing quote or bracket with the sentence it belongs to. The
cut is skipped when the full stop belongs to a known abbreviation or a single
initial — *Dr.*, *e.g.*, *etc.*, *J. R. Tolkien* — so those stay in one piece.
Whether the next sentence starts with a capital makes no difference. If all that
produces nothing and the text has line breaks, each line is treated as a sentence
instead.

**Step 2 — score each sentence.** Count how many of the 28 sentence checks
fired, divide by 28, and push that share through a curve that rises steeply in
the middle. In practice:

| Checks fired | Sentence score |
|---|---|
| 0 | 16 |
| 1 | 24 |
| 2 | 34 |
| 3 | 46 |
| 4 | 58 |
| 5 | 69 |
| 6 | 79 |
| 8 | 91 |

**Step 3 — add the document-wide signals.** Every sentence implicated by a shape
check closes part of the gap between where it sits and 100 — 20% of that gap,
scaled by the check's weight. A sentence on 34 touched by `S-01` (weight 0.8)
goes to 34 + 66 × 0.16 ≈ **45**, not to a flat +18.

**Step 4 — combine into one number.**

```
overall = 0.65 × (average sentence score, weighted by sentence length)
        + 0.35 × (same curve applied to the share of flagged sentences)

then, once per shape check that fired:
overall = overall + (100 − overall) × weight × 0.2
```

Longer sentences pull the average harder, since a suspicious 40-word sentence is
more evidence than a suspicious 5-word one. The flagged-share term stops a few
clean sentences from washing out a document that is mostly suspect.

Shape checks close a share of the remaining distance rather than adding flat
points, so each one still moves the number but the total approaches 100 without
landing on it. That keeps the top of the range meaningful: a document with heavy
cliché use *and* every structural check firing scores higher than one with only
the clichés, instead of both pinning at 100. The result is clamped to 0–100.

**Step 5 — label it.**

| Score | Verdict |
|---|---|
| 76–100 | Very likely AI |
| 51–75 | Likely AI |
| 26–50 | Uncertain |
| 0–25 | Likely Human |

The marked-up copy uses its own thresholds per sentence: a heavy pencil
underline above 50, a light one 21–50, no mark at 20 or below. The rule codes
behind each sentence are set in the right margin; pick one to read the rules in
full.

---

## What the score is actually worth

Read this part before you trust a number.

**Nothing here proves anything.** These are guesses based on style. Every check
matches writing that plenty of humans produce on purpose, and none of them can
see intent, authorship, or truth. A high score means "this reads the way chatbots
tend to read," and that is all it means.

**The scale does not start at zero.** A sentence that trips no check at all still
scores 16. Clean, varied prose lands around 10 overall — never 0.

**Ordinary human writing used to set it off.** This paragraph, written by hand
about a tin of buttons, once scored **35 — "Uncertain"** on the strength of the
rhythm check alone:

> My grandmother kept her buttons in a tin that once held shortbread. Hundreds of
> them. Bone, brass, one carved from a walnut shell. She'd tip them onto the
> kitchen table and let me sort them while she talked about the war, or the
> neighbours, or nothing at all. I never asked where they came from. I wish I
> had. The tin is on my shelf now and I still don't know.

It now scores **11 — "Likely Human"**, with nothing firing at all. The rhythm
check was measuring spread in raw words, which made any tidy short paragraph look
uniform; it now measures spread against the average length and needs eight
sentences before it will call a rhythm. That case is in the test suite so it
cannot quietly come back.

**Formal writing is still penalised, by design.** Academic papers, legal writing,
corporate reports and technical documentation are built out of exactly the
vocabulary in the `V` lists. This paragraph, also written by hand, scores
**51 — "Likely AI"**:

> The present study examines the relationship between soil compaction and root
> depth in temperate pasture. Samples were drawn from twelve sites across the
> catchment, and it was found that compaction above 1.6 g/cm3 correlated with a
> marked reduction in rooting depth. This finding underscores the importance of
> grazing management in maintaining soil structure. It is worth noting that the
> sample size limits the strength of any causal claim. Nevertheless, the pattern
> held across all twelve sites, and further work should ensure that seasonal
> variation is controlled for.

Five checks fire, and every one of them is correct about the words on the page:
*underscores*, *it is worth noting*, *ensure*, *Nevertheless* opening a sentence,
*it was found* with the actor removed. The register is the problem, not the
authorship — and the engine cannot tell those apart. Some list entries are common
enough to be near-universal: `V-01` includes *both*, *not only*, *but also*, *a
number of* and *a variety of*, and `V-12` fires on any use of *ensure*.

---

## Getting text in

Paste it, load the built-in sample, or upload a file. Uploads accept `.txt`,
`.md` and `.pdf` (1 MB for text, 20 MB for PDF). PDF text is pulled out in the
browser and rewrapped so that hard line breaks rejoin into sentences, hyphenated
splits are healed, and real paragraph breaks and bullets survive — otherwise
the formatting checks would fire on page layout instead of writing style.

Scanned PDFs with no text layer will report that there is nothing to read; run
OCR first. Anything over 10,000 characters is trimmed to fit, and you are told
when that happens.

---

## Running it

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # 22 checks across the library modules
npm run lint
npm run build
```

Tests are plain `node:test` — no framework. TypeScript runs directly via Node's
type stripping.

---

## File map

| Path | What it is |
|---|---|
| `src/lib/detector.ts` | All 34 rules, the scoring maths, and `analyzeText()` |
| `src/lib/pdf.ts` | PDF text extraction and rewrapping, browser-side |
| `src/lib/sample.ts` | The passage used as the worked example on the page |
| `src/app/page.tsx` | Marks up the sample on the server so the example on the page cannot drift from the engine |
| `src/app/Desk.tsx` | The interface — the sheet, the reading, the mark rail, the tally |
| `src/app/api/analyze/route.ts` | `POST { text }` → score. Rejects empty text and anything over 10,000 characters |

---

## Rough edges in the engine

The six rough edges this file used to list — a stale rule count, a dead word
list, one phrase wired into two rules, `S-01` firing on any tidy paragraph,
sentence splitting that needed a capital letter, and a score that saturated at
100 — are fixed, and `src/lib/detector.test.ts` holds a check for each. What is
left is worth knowing if you touch it.

- **Every threshold is hand-picked.** 28 words for a long sentence, 70% for the
  mid-length band, 0.35 for relative spread, every rule weight, the shape of the
  score curve: all chosen by eye against a handful of sample texts, none fitted
  to a labelled corpus. They are defensible, not measured.
- **The abbreviation list is a fixed list.** Splitting knows about *Dr.*, *e.g.*,
  *etc.* and roughly twenty more, plus single initials. An abbreviation outside
  that list still splits a sentence in two, and both halves get scored.
- **English only.** Every word list, and the whole idea of measuring sentence
  length in words, assumes English prose.
- **Word lists drift out of date.** They describe how chatbots wrote when the
  lists were typed. Models change register faster than the lists get edited.



