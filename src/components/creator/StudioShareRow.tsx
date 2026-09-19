"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

/**
 * Del & indlejr-rækken for en PUBLICERET film i studiet —
 * creatorens egne organiske kanaler: det lokale watch-link at dele
 * (og optjene affiliate-minutter på) og iframe-uddraget til at
 * indlejre smagsprøven på egen hjemmeside/blog.
 */
export default function StudioShareRow({
  slug,
  title,
}: {
  slug: string;
  title: string;
}) {
  const t = useTranslations("creatorStudio");
  const tShare = useTranslations("share");
  const locale = useLocale();
  const [copied, setCopied] = useState<"link" | "embed" | null>(null);

  async function copy(kind: "link" | "embed") {
    const origin = window.location.origin;
    const text =
      kind === "link"
        ? `${origin}/${locale}/watch/${slug}`
        : `<iframe src="${origin}/api/embed/${slug}" width="960" height="620" style="border:0;border-radius:12px;overflow:hidden" allow="fullscreen; picture-in-picture" allowfullscreen title="${title}"></iframe>`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // clipboard kan være blokeret (fx http) — intet sker
    }
  }

  const buttonBase =
    "rounded-full border border-smoke px-4 py-2 text-xs tracking-wide transition-colors hover:border-champagne/50 hover:text-bone";

  return (
    <div className="mt-4 max-w-xl">
      <p className="text-xs uppercase tracking-[0.3em] text-ash">
        {t("shareHeading")}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void copy("link")}
          className={
            copied === "link"
              ? "rounded-full bg-champagne px-4 py-2 text-xs font-medium text-noir"
              : buttonBase + " text-ash"
          }
        >
          {copied === "link" ? tShare("copied") : t("copyWatchLink")}
        </button>
        <button
          type="button"
          onClick={() => void copy("embed")}
          className={
            copied === "embed"
              ? "rounded-full bg-champagne px-4 py-2 text-xs font-medium text-noir"
              : buttonBase + " text-ash"
          }
        >
          {copied === "embed" ? tShare("copied") : t("copyEmbedCode")}
        </button>
      </div>
    </div>
  );
}