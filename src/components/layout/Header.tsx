"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import DoccysMark from "@/components/logo/DoccysMark";
import LanguageSwitcher from "@/components/layout/LanguageSwitcher";
import UserMenu from "@/components/layout/UserMenu";

const NAV_LINKS = [
  { href: "/", labelKey: "home" },
  { href: "/creators", labelKey: "creators" },
] as const;

export default function Header() {
  const pathname = usePathname();
  const t = useTranslations("header");
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-50 border-b border-smoke/60 bg-noir/80 backdrop-blur-md">
      <div className="mx-auto flex h-11 max-w-6xl items-center justify-between px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5"
          aria-label="Doccys — forside"
        >
          <DoccysMark className="h-6 w-6" />
          <span className="font-display text-base font-medium tracking-[0.35em] text-bone">
            DOCCYS
          </span>
        </Link>

        <div className="flex items-center gap-5">
          <nav className="flex items-center gap-6" aria-label="Hovednavigation">
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
          {/* Konto-state: "Log ind" + "Min profil" — eller bruger-chip, når
              man er logget ind (UserMenu erstatter nav-linken). */}
          <UserMenu />
          <LanguageSwitcher />
        </div>
      </div>
    </header>
  );
}