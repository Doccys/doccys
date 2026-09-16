"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

/** Sprogenes egne navne — vises altid på eget sprog, som konventionen er. */
const LOCALE_LABELS: Record<string, string> = {
  da: "Dansk",
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  no: "Norsk",
  sv: "Svenska",
  fi: "Suomi",
};

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" />
      <ellipse
        cx="8"
        cy="8"
        rx="2.8"
        ry="6.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path d="M1.5 8 H14.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/**
 * Sprogvælger til headeren. Skifter sprog med next-intl's router, som
 * bevarer den aktuelle side og blot udskifter sprogpræfikset i URL'en
 * (f.eks. /da/watch/x → /fr/watch/x).
 */
export default function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("header");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Luk dropdownen ved klik udenfor.
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

  const switchTo = (nextLocale: string) => {
    setOpen(false);
    router.replace(pathname, { locale: nextLocale });
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("language")}
        className="flex items-center gap-1.5 rounded-md border border-smoke bg-onyx px-2.5 py-1.5 text-xs text-ash transition-colors hover:text-bone"
      >
        <GlobeIcon className="h-3.5 w-3.5" />
        {LOCALE_LABELS[locale] ?? locale}
        <svg
          viewBox="0 0 12 12"
          className={`h-2.5 w-2.5 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path d="M2 4.5 L6 8.5 L10 4.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
        </svg>
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute right-0 top-full z-50 mt-2 min-w-40 rounded-lg border border-smoke bg-onyx py-1 shadow-xl shadow-black/50"
        >
          {routing.locales.map((available) => (
            <li key={available} role="option" aria-selected={available === locale}>
              <button
                type="button"
                onClick={() => switchTo(available)}
                className={`block w-full px-4 py-2 text-left text-xs transition-colors ${
                  available === locale
                    ? "bg-smoke/50 text-champagne"
                    : "text-ash hover:bg-smoke/30 hover:text-bone"
                }`}
              >
                {LOCALE_LABELS[available] ?? available}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}