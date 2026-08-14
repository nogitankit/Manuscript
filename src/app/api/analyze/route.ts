import { analyzeText } from "@/lib/detector";

const MAX_TEXT_LENGTH = 10_000;

export async function POST(request: Request): Promise<Response> {
  // ── 1. Parse body ────────────────────────────────────────────────────────

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  // ── 2. Validate input ────────────────────────────────────────────────────

  if (
    typeof body !== "object" ||
    body === null ||
    !("text" in body)
  ) {
    return Response.json(
      { error: "Request body must be a JSON object containing a 'text' field." },
      { status: 400 }
    );
  }

  const { text } = body as Record<string, unknown>;

  if (typeof text !== "string") {
    return Response.json(
      { error: "'text' must be a string." },
      { status: 400 }
    );
  }

  if (text.trim().length === 0) {
    return Response.json(
      { error: "'text' must not be empty." },
      { status: 400 }
    );
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return Response.json(
      {
        error: `'text' exceeds the maximum allowed length of ${MAX_TEXT_LENGTH.toLocaleString()} characters.`,
      },
      { status: 400 }
    );
  }

  // ── 3. Run detection ─────────────────────────────────────────────────────

  try {
    const result = analyzeText(text);
    return Response.json(result, { status: 200 });
  } catch (err) {
    console.error("[/api/analyze] Internal error:", err);
    return Response.json(
      { error: "An internal server error occurred while analysing the text." },
      { status: 500 }
    );
  }
}
