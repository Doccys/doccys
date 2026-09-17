"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

interface ReferralCardProps {
  /** brugerens henvisningskode (8 tegn [a-z0-9]) */
  code: string;
}

/**
 * Affiliate-kortet — viser brugerens henvisningslink.
 *
 * Besøg via linket (/api/ref/{kode}) sætter doccys_ref-cookien i
 * 30 dage; kode-ejeren får 250 minutter, når den henviste bruger
 * gennemfører sit FØRSTE pakke-køb. Linket bygges på klienten af
 * window.location.origin, så det altid peger på det domæne der
 * faktisk betjener seeren.
 */
export default function ReferralCard({ code }: ReferralCardProps) {
  const t = useTranslations("affiliate");
  const [copied, setCopied] = useState(false);

  const link =
    typeof window === "undefined"
      ? `/api/ref/${code}`
      : `${window.location.origin}/api/ref/${code}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard kan være blokeret (fx http) — linket kan stadig
      // markeres og kopieres manuelt
    }
  }

  return (
    <div className="rounded-xl border border-smoke bg-onyx px-6 py-6">
      <p className="text-sm leading-relaxed text-ash">{t("explainer")}</p>
      <p className="mt-3 text-xs uppercase tracking-[0.3em] text-ash">
        {t("yourLink")}
      </p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
        <code className="flex-1 overflow-x-auto rounded-lg border border-smoke/60 bg-noir px-4 py-2.5 text-sm text-champagne">
          {link}
        </code>
        <button
          type="button"
          onClick={() => void copyLink()}
          className="rounded-full border border-champagne/60 px-6 py-2.5 text-xs font-medium tracking-wide text-champagne transition-colors hover:bg-champagne hover:text-noir"
        >
          {copied ? t("copied") : t("copy")}
        </button>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-ash">{t("reward")}</p>
    </div>
  );
}