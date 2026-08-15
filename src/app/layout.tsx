import type { Metadata, Viewport } from "next";
import { Newsreader, Archivo, Sometype_Mono } from "next/font/google";
import "./globals.css";

/**
 * Three faces, three voices, so you can always tell who is speaking:
 * Newsreader is the author's prose, Archivo is the tool, Sometype is machine codes.
 */
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
});

const sometype = Sometype_Mono({
  variable: "--font-sometype",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Manuscript — a copy-desk for machine prose",
  description:
    "Paste an essay and get it back marked up: a 0–100 reading, every sentence scored, and the rule behind every mark. 34 local rules, no model, nothing leaves the page.",
};

/** Browser chrome takes the colour of the desk, in whichever light. */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#dedfd8" },
    { media: "(prefers-color-scheme: dark)", color: "#131311" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${archivo.variable} ${sometype.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-desk font-sans text-ink">{children}</body>
    </html>
  );
}
