/**
 * Client-side PDF → plain text extraction.
 *
 * pdf.js is loaded on demand (it is ~1 MB) and runs on the main thread: importing
 * `pdf.worker.mjs` sets `globalThis.pdfjsWorker`, which makes pdf.js skip its
 * `new Worker(workerSrc)` path entirely, so no worker URL or bundler asset plumbing
 * is needed.
 *
 * ponytail: main-thread parsing blocks the UI while a PDF is read. Fine for the
 * essays this tool takes (10k char cap); move to a real Worker if big PDFs matter.
 */

/** Line-start markers that begin a new block and must keep their line break. */
const BLOCK_START = /^(?:[-•*·•▪]\s|\d+[.)]\s|#{1,6}\s)/;

/**
 * Turn raw pdf.js line output into flowing prose: hard wraps inside a sentence are
 * joined, while paragraph breaks and list/heading lines keep their own line.
 */
export function normalizePdfText(raw: string): string {
  const lines = raw
    .normalize("NFKC") // ﬁ ligatures, non-breaking spaces → plain ASCII equivalents
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim());

  let out = "";
  for (const line of lines) {
    if (line === "") {
      out = out.replace(/[ \n]+$/, "") + "\n\n";
      continue;
    }
    if (out === "" || out.endsWith("\n") || BLOCK_START.test(line)) {
      out = out.replace(/ +$/, "");
      if (out !== "" && !out.endsWith("\n")) out += "\n";
      out += line;
      continue;
    }
    // Word split across a line break: "para-\ndigm" → "paradigm".
    if (/[a-z]-$/.test(out) && /^[a-z]/.test(line)) {
      out = out.slice(0, -1) + line;
    } else {
      out += " " + line;
    }
  }

  return out.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Extract the text of `file`, stopping once `maxChars` is reached (a long report
 * would blow past the analyser's limit anyway). Throws if the PDF cannot be read.
 */
export async function extractPdfText(file: File, maxChars = Infinity): Promise<string> {
  const [pdfjs] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.mjs"),
  ]);

  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    disableFontFace: true, // text only — no need to load or convert fonts
  });

  try {
    const doc = await task.promise;
    const pages: string[] = [];
    let chars = 0;
    for (let n = 1; n <= doc.numPages && chars < maxChars; n++) {
      const page = await doc.getPage(n);
      const { items } = await page.getTextContent();
      const pageText = items
        .map((it) => ("str" in it ? it.str + (it.hasEOL ? "\n" : "") : ""))
        .join("");
      pages.push(pageText);
      chars += pageText.length;
      page.cleanup();
    }
    return normalizePdfText(pages.join("\n\n"));
  } finally {
    await task.destroy();
  }
}
