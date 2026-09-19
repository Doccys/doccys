"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/**
 * Account state in the header.
 *
 * - Logged out: a discreet "Log ind" link next to the usual "Min profil"
 *   nav item, so the login page is always reachable.
 * - Logged in: replaces "Min profil" with a chip showing the user's
 *   avatar initial + e-mail. The dropdown holds "Min profil" and "Log ud".
 *
 * The logged-in state is read client-side (supabase.auth), so the header
 * always renders the logged-out version on the server and upgrades once
 * the browser has checked the session cookie.
 */
export default function UserMenu() {
  const navT = useTranslations("header");
  const authT = useTranslations("auth");
  const router = useRouter();
  const pathname = usePathname();
  const profileActive = pathname.startsWith("/profile");

  const [user, setUser] = useState<User | null>(null);
  // egen skaber-profil (hvis kontoen ejer én) — styrer om rullemenuen
  // viser "Udbetaling"-linket. creators er offentligt læsbar (RLS).
  const [creatorHandle, setCreatorHandle] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const supabase = createClient();

    // Initial read + live updates so login/logout anywhere in the app
    // is reflected immediately in the header.
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      },
    );
    return () => subscription.subscription.unsubscribe();
  }, []);

  // Håndtaget hentes ved login/udvidet men ikke ved logud-signal —
  // nulstilles i stedet her, så et link aldrig overlever sessionen.
  useEffect(() => {
    if (!user) {
      setCreatorHandle(null);
      return;
    }
    const supabase = createClient();
    supabase
      .from("creators")
      .select("handle")
      .eq("owner_user_id", user.id)
      .maybeSingle()
      .then(({ data }) => setCreatorHandle(data?.handle ?? null));
  }, [user]);

  // Close the dropdown on clicks outside (same pattern as LanguageSwitcher).
  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const signOut = async () => {
    setBusy(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    setOpen(false);
    setUser(null);
    router.refresh();
    setBusy(false);
  };

  if (!user) {
    return (
      <div className="flex items-center gap-4">
        <Link
          href="/login"
          className="text-xs tracking-wide text-champagne transition-colors hover:text-bone"
        >
          {authT("login")}
        </Link>
        <Link
          href="/profile"
          className={`text-xs tracking-wide transition-colors ${
            profileActive
              ? "text-champagne"
              : "text-ash hover:text-bone"
          }`}
        >
          {navT("nav.profile")}
        </Link>
      </div>
    );
  }

  const initial = (user.email ?? "?").charAt(0).toUpperCase();

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-md border border-smoke bg-onyx px-2 py-1 transition-colors hover:border-champagne/40"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full border border-champagne/50 text-[10px] font-medium text-champagne">
          {initial}
        </span>
        <span className="max-w-28 truncate text-xs text-bone">
          {user.email}
        </span>
        <svg
          viewBox="0 0 12 12"
          className={`h-2.5 w-2.5 text-ash transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path
            d="M2 4.5 L6 8.5 L10 4.5"
            stroke="currentColor"
            strokeWidth="1.4"
            fill="none"
          />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 min-w-52 rounded-lg border border-smoke bg-onyx py-1 shadow-xl shadow-black/50"
        >
          <div className="border-b border-smoke/60 px-4 py-2.5">
            <p className="text-[10px] uppercase tracking-widest text-ash">
              {authT("loggedInAs")}
            </p>
            <p className="truncate text-xs text-bone">{user.email}</p>
          </div>
          <Link
            href="/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-xs text-ash transition-colors hover:bg-smoke/30 hover:text-bone"
          >
            {navT("nav.profile")}
          </Link>
          <Link
            href="/creator/studio"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-xs text-ash transition-colors hover:bg-smoke/30 hover:text-bone"
          >
            {navT("nav.creator")}
          </Link>
          {/* direkte vej til udbetaling (ankret til panelet) — kun for
              konti der ejer en skaber-profil, andre ser intet punkt */}
          {creatorHandle && (
            <Link
              href={`/creator/${creatorHandle}#udbetaling`}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-xs text-ash transition-colors hover:bg-smoke/30 hover:text-bone"
            >
              {navT("nav.payout")}
            </Link>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            disabled={busy}
            className="block w-full px-4 py-2 text-left text-xs text-ash transition-colors hover:bg-smoke/30 hover:text-bone disabled:opacity-50"
          >
            {authT("logout")}
          </button>
        </div>
      )}
    </div>
  );
}