import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from "@/config/brand";
import { assertConfigValid } from "@/config/businessRules";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
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
      <body className="flex min-h-dvh flex-col antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
          Skip to content
        </a>
        <Navbar />
        <div id="main" className="flex-1">
          {children}
        </div>
        <Footer />
      </body>
    </html>
  );
}
