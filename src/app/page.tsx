import { analyzeText } from "@/lib/detector";
import { SAMPLE_TEXT } from "@/lib/sample";
import Desk from "./Desk";

/**
 * The worked example is marked up here, on the server, by the same
 * `analyzeText` the API route calls — so the example on the page can never
 * drift from what the engine actually returns, and the rule set stays out of
 * the browser bundle.
 */
export default function Page() {
  return <Desk example={analyzeText(SAMPLE_TEXT)} />;
}
