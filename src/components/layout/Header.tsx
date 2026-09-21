"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import DoccysMark from "@/components/logo/DoccysMark";
import LanguageSwitcher from "@/components/layout/LanguageSwitcher";
import UserMenu from "@/components/layout/UserMenu";

const NAV_LINKS = [
  { href: "/", labelKey: "home" },
  { href: "/creators", labelKey: "creators" },
] as const;

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("header");
  const searchT = useTranslations("search");
  // Mobil-overlay: glas-knappen folder en fuldbredde-række ud under
  // baren — h-11-baren er for tæt til et felt i smalle viewports.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const overlayRef = useRef<HTMLFormElement | null>(null);
  const overlayInputRef = useRef<HTMLInputElement | null>(null);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const term = searchValue.trim();
    if (!term) return;
    router.push(`/search?q=${encodeURIComponent(term)}`);
    setSearchOpen(false);
  };

  // Autofokus når mobil-overlayet åbnes, og luk ved klik udenfor —
  // samme containerRef-mønster som UserMenu/LanguageSwitcher.
  useEffect(() => {
    if (!searchOpen) return;
    overlayInputRef.current?.focus();
    const handleOutside = (event: MouseEvent) => {
      if (!overlayRef.current?.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [searchOpen]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-50 border-b border-smoke/60 bg-noir/80 backdrop-blur-md">
      {/* Stram luft paa mobil (px-4/gap-2) — 640 px+ er urorvet. */}
      <div className="mx-auto flex h-11 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5"
          aria-label="Doccys — forside"
        >
          <DoccysMark className="h-6 w-6" />
          {/* Ordmaerket er bredt (0,35em tracking) — paa mobil stikker det
              baren ud, saa kun logo-maerket vises der. */}
          <span className="hidden font-display text-base font-medium tracking-[0.35em] text-bone sm:inline">
            DOCCYS
          </span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-5">
          <nav className="flex items-center gap-4 sm:gap-6" aria-label="Hovednavigation">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-xs tracking-wide transition-colors ${
                  isActive(link.href)
                    ? "text-champagne"
                    : "text-ash hover:text-bone"
                }`}
              >
                {t(`nav.${link.labelKey}`)}
              </Link>
            ))}
          </nav>
          {/* Søgning: lille felt på desktop (vokser ved fokus), glas-
              knap på mobil. Feltet beholdes fyldt efter navigation —
              seeren ser sin forespørgsel igen på resultatsiden. */}
          <form onSubmit={submitSearch} className="hidden sm:block">
            <input
              type="search"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder={searchT("placeholder")}
              aria-label={searchT("searchLabel")}
              className="w-36 rounded-full border border-smoke bg-onyx px-4 py-1.5 text-xs text-bone transition-all placeholder:text-ash/60 focus:w-56 focus:border-champagne focus:outline-none"
            />
          </form>
          <button
            type="button"
            onClick={() => setSearchOpen((open) => !open)}
            aria-label={searchT("searchLabel")}
            aria-expanded={searchOpen}
            className="text-ash transition-colors hover:text-bone sm:hidden"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path
                d="m21 21-4.3-4.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {/* Konto-state: "Log ind" + "Min profil" — eller bruger-chip, når
              man er logget ind (UserMenu erstatter nav-linken). */}
          <UserMenu />
          <LanguageSwitcher />
        </div>
      </div>

      {/* Mobilens søgefelt: fuldbredde-række under baren, lukket som
          default. Enter søger, Esc lukker (udenforklik håndteres af
          useEffect'et ovenfor). */}
      {searchOpen && (
        <form
          ref={overlayRef}
          onSubmit={submitSearch}
          className="border-t border-smoke/60 bg-noir sm:hidden"
        >
          <input
            ref={overlayInputRef}
            type="search"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSearchOpen(false);
            }}
            placeholder={searchT("placeholder")}
            aria-label={searchT("searchLabel")}
            className="w-full bg-transparent px-4 py-3 text-sm text-bone placeholder:text-ash/60 focus:outline-none sm:px-6"
          />
        </form>
      )}
    </header>
  );
}