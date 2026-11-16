import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from "@/config/brand";
import { assertConfigValid } from "@/config/businessRules";
import "./globals.css";

// Fail loudly at startup (and at build time) if src/config/businessRules.ts is invalid.
assertConfigValid();

// Self-hosted fonts (SIL Open Font License). No network call at build or runtime.
const fraunces = localFont({
  src: [
    { path: "./fonts/Fraunces-Variable.woff2", style: "normal" },
    { path: "./fonts/Fraunces-Variable-Italic.woff2", style: "italic" },
  ],
  variable: "--font-fraunces",
  display: "swap",
});
const inter = localFont({ src: "./fonts/Inter-Variable.woff2", variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: `${APP_NAME} — ${APP_TAGLINE}`, template: `%s · ${APP_NAME}` },
  description: APP_DESCRIPTION,
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#FAF9F6" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
