// pdf.js ships no declarations for its worker bundle; it is imported only for the
// `globalThis.pdfjsWorker` side effect (see src/lib/pdf.ts).
declare module "pdfjs-dist/build/pdf.worker.mjs";
