import Link from "next/link";
import { APP_NAME } from "@/config/brand";

/** Site footer. Carries the honesty note that this is a demo with simulated parts. */
export function Footer() {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-ink-soft sm:flex-row sm:items-center sm:justify-between">
        <p>
          {APP_NAME} is an assignment demo. eLitmus verification, payments and mixers are simulated, and all seed profiles are fictional.
        </p>
        <p className="flex gap-4">
          <Link href="/evaluator" className="underline underline-offset-2">Evaluator &amp; Founder Guide</Link>
          <Link href="/safety" className="underline underline-offset-2">Safety &amp; Legal</Link>
        </p>
      </div>
    </footer>
  );
}
