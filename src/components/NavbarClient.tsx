"use client";
import { ChevronDown, Coins, FlaskConical, LogOut, Menu, ShieldCheck, Sparkles, User as UserIcon, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { demoLoginAction, logoutAction } from "@/app/actions/auth";
import { resetDemoAction } from "@/app/actions/demo";
import { APP_NAME } from "@/config/brand";

export type NavbarProps = {
  /** null when logged out. */
  viewer: { firstName: string; email: string; isAdmin: boolean; isMember: boolean; personaKey: string | null } | null;
  credits: number;
  reliability: number;
  reliabilityIsLow: boolean;
  demo: { enabled: boolean; personas: { key: string; label: string; tag: string }[]; fastForwardLabel: string | null };
};

const MEMBER_LINKS = [
  { href: "/discover", label: "Discover" },
  { href: "/matches", label: "Matches" },
  { href: "/cohort", label: "Cohort" },
  { href: "/wallet", label: "Wallet" },
  { href: "/store", label: "Store" },
  { href: "/safety", label: "Safety" },
];

/** A small dropdown that closes on outside click, Escape, or navigation. */
function Dropdown({ label, button, children }: { label: string; button: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Close when the page changes.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" className="btn-ghost min-h-9 gap-1 px-2" aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen((v) => !v)}>
        {button}
        <ChevronDown size={14} aria-hidden />
      </button>
      {open && (
        <div role="menu" className="card absolute right-0 z-40 mt-1 w-64 p-2 shadow-lg">
          {children}
        </div>
      )}
    </div>
  );
}

const menuItem = "flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-ink hover:bg-brand-soft";

export function NavbarClient({ viewer, credits, reliability, reliabilityIsLow, demo }: NavbarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMobileOpen(false);
  }

  const links = viewer?.isMember ? MEMBER_LINKS : viewer?.isAdmin ? [{ href: "/admin", label: "Founder Dashboard" }] : [];
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const linkClass = (href: string) =>
    `rounded-md px-2.5 py-1.5 text-sm font-medium ${isActive(href) ? "bg-brand-soft text-brand-deep" : "text-ink-soft hover:text-ink"}`;

  const guideLink = (
    <Link href="/evaluator" className={`${linkClass("/evaluator")} inline-flex items-center gap-1 whitespace-nowrap`} aria-current={isActive("/evaluator") ? "page" : undefined}>
      <Sparkles size={14} aria-hidden /> Evaluator &amp; Founder Guide
    </Link>
  );

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        <Link href={viewer?.isAdmin ? "/admin" : viewer?.isMember ? "/discover" : "/"} className="font-serif text-xl font-semibold tracking-tight text-brand-deep">
          {APP_NAME}
        </Link>

        <nav aria-label="Main" className="ml-2 hidden items-center gap-0.5 xl:flex">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className={linkClass(link.href)} aria-current={isActive(link.href) ? "page" : undefined}>
              {link.label}
            </Link>
          ))}
          {guideLink}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          {viewer?.isMember && (
            <>
              <Link href="/wallet" className="pill-credit tnum" title="Available Trust Credits">
                <Coins size={12} aria-hidden /> {credits}
                <span className="sr-only"> available Trust Credits</span>
              </Link>
              <Link href="/wallet#reliability" className={`${reliabilityIsLow ? "pill-danger" : "pill-verified"} tnum`} title="Reliability Score">
                <ShieldCheck size={12} aria-hidden /> {reliability}%<span className="sr-only"> Reliability Score</span>
              </Link>
            </>
          )}

          {demo.enabled && viewer && (
            <Dropdown label="Demo tools and persona switcher" button={<><FlaskConical size={15} aria-hidden /><span className="hidden sm:inline">Demo</span></>}>
              <p className="eyebrow px-2.5 pt-1 pb-1">Switch persona</p>
              <form action={demoLoginAction}>
                {demo.personas.map((persona) => (
                  <button key={persona.key} type="submit" name="persona" value={persona.key} role="menuitem" className={menuItem} aria-current={viewer.personaKey === persona.key ? "true" : undefined}>
                    <span className="font-medium">{persona.label}</span>
                    <span className="text-xs text-ink-soft">{persona.tag}</span>
                    {viewer.personaKey === persona.key && <span className="pill-brand ml-auto">current</span>}
                  </button>
                ))}
              </form>
              <div className="hairline my-2" />
              <p className="eyebrow px-2.5 pb-1">Demo tools</p>
              <form action={resetDemoAction}>
                <button type="submit" role="menuitem" className={menuItem} title="Restores the seeded demo accounts. Real sign-ups are never touched.">
                  Reset Demo Data
                </button>
              </form>
            </Dropdown>
          )}

          {viewer ? (
            <Dropdown label="Account menu" button={<><UserIcon size={15} aria-hidden /><span className="hidden max-w-24 truncate sm:inline">{viewer.firstName}</span></>}>
              <p className="truncate px-2.5 py-1 text-xs text-ink-soft">{viewer.email}</p>
              {viewer.isMember && (
                <Link href="/profile" role="menuitem" className={menuItem}>
                  <UserIcon size={15} aria-hidden /> Profile &amp; non-negotiables
                </Link>
              )}
              <form action={logoutAction}>
                <button type="submit" role="menuitem" className={menuItem}>
                  <LogOut size={15} aria-hidden /> Log out
                </button>
              </form>
            </Dropdown>
          ) : (
            <div className="hidden items-center gap-1.5 sm:flex">
              <Link href="/login" className="btn-ghost min-h-9">Log in</Link>
              <Link href="/signup" className="btn-primary min-h-9">Sign up</Link>
            </div>
          )}

          <button type="button" className="btn-ghost min-h-9 px-2 xl:hidden" aria-label={mobileOpen ? "Close menu" : "Open menu"} aria-expanded={mobileOpen} onClick={() => setMobileOpen((v) => !v)}>
            {mobileOpen ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav aria-label="Mobile" className="border-t border-line bg-paper px-4 py-3 xl:hidden">
          <div className="mx-auto flex max-w-6xl flex-col gap-1">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className={linkClass(link.href)} aria-current={isActive(link.href) ? "page" : undefined}>
                {link.label}
              </Link>
            ))}
            {guideLink}
            {!viewer && (
              <div className="mt-2 flex gap-2 sm:hidden">
                <Link href="/login" className="btn-secondary flex-1">Log in</Link>
                <Link href="/signup" className="btn-primary flex-1">Sign up</Link>
              </div>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
