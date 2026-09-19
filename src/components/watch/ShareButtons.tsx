"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { getSharedWatchSeconds } from "@/lib/player/shareTime";

/**
 * Del-rækken under afspilleren: direkte delings-links til de store
 * platforme + "Kopiér link". URL'en læses ved KLIK-tid (window.
 * location.href), så det lokaliserede link (/da/watch/…) deles som
 * seeren ser det — og prerender uden window sprænger ikke.
 *
 * Linket beriges med tre ting, før det sendes af sted:
 * - ?ref={seerens affiliate-kode} — vennens første pakke-køb krediterer
 *   seeren 250 min (middleware sætter doccys_ref-cookien fra parametret).
 * - ?t={sektal} — når seeren er mindst 10 sek inde, deler hun selve
 *   øjeblikket; VideoPlayer søger til tiden ved ankomst.
 * - utm_source/medium/campaign pr. platform — så konverteringen kan
 *   måles pr. delings-kanal.
 *
 * Åbner platformens delings-dialog i nyt faneblad (noopener), og
 * mailto: lægges i samme fane, hvor mail-klienten tager over.
 */

/** Fra hvilket sekund tidskoden først skal med i linket */
const TIMESTAMP_MIN_SEC = 10;

interface ShareButtonsProps {
  title: string;
  /** Seerens affiliate-kode — null for gæster (intet ?ref=) */
  refCode?: string | null;
}

/** brand-navne er universelle og er IKKE i i18n-filerne */
const PLATFORMS: {
  name: string;
  /** UTM-kilde + nøgle i delings-URL'en */
  source: string;
  build: (url: string, title: string) => string;
}[] = [
  {
    name: "Facebook",
    source: "facebook",
    build: (url) => `https://www.facebook.com/sharer/sharer.php?u=${url}`,
  },
  {
    name: "WhatsApp",
    source: "whatsapp",
    build: (url, title) => `https://wa.me/?text=${title}%20${url}`,
  },
  {
    name: "X",
    source: "x",
    build: (url, title) => `https://twitter.com/intent/tweet?url=${url}&text=${title}`,
  },
  {
    name: "Telegram",
    source: "telegram",
    build: (url, title) => `https://t.me/share/url?url=${url}&text=${title}`,
  },
  {
    name: "Reddit",
    source: "reddit",
    build: (url, title) => `https://www.reddit.com/submit?url=${url}&title=${title}`,
  },
  {
    name: "LinkedIn",
    source: "linkedin",
    build: (url) => `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
  },
  {
    name: "Bluesky",
    source: "bluesky",
    build: (url, title) => `https://bsky.app/intent/compose?text=${title}%20${url}`,
  },
  {
    name: "Mastodon",
    source: "mastodon",
    build: (url, title) => `https://mastodonshare.com/?url=${url}&text=${title}`,
  },
];

export default function ShareButtons({ title, refCode }: ShareButtonsProps) {
  const t = useTranslations("share");
  const [copied, setCopied] = useState(false);

  /** Det link, der deles: nuværende URL + ref + tidskode + UTM. */
  function buildShareUrl(source: string): string {
    const url = new URL(window.location.href);
    if (refCode) url.searchParams.set("ref", refCode);
    const watchSeconds = getSharedWatchSeconds();
    if (watchSeconds >= TIMESTAMP_MIN_SEC) {
      url.searchParams.set("t", String(watchSeconds));
    }
    url.searchParams.set("utm_source", source);
    url.searchParams.set("utm_medium", "share");
    url.searchParams.set("utm_campaign", "doccys");
    return url.toString();
  }

  function openPlatform(
    build: (url: string, title: string) => string,
    source: string,
  ) {
    const href = build(
      encodeURIComponent(buildShareUrl(source)),
      encodeURIComponent(title),
    );
    window.open(href, "_blank", "noopener,noreferrer");
  }

  function openEmail() {
    const href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(
      buildShareUrl("email"),
    )}`;
    window.location.href = href; // mail-klienten tager over i samme fane
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(buildShareUrl("copy"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard-API kan være blokeret (fx HTTP i nogle browsere) —
      // stil: der sker bare intet; linket står i adressefeltet
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase tracking-widest text-ash">{t("label")}</span>
      {PLATFORMS.map(({ name, source, build }) => (
        <button
          key={name}
          type="button"
          onClick={() => openPlatform(build, source)}
          aria-label={t("shareOn", { platform: name })}
          className="rounded-full border border-smoke px-4 py-2 text-xs tracking-wide text-ash transition-colors hover:border-champagne/50 hover:text-bone"
        >
          {name}
        </button>
      ))}
      <button
        type="button"
        onClick={() => void openEmail()}
        aria-label={t("email")}
        className="rounded-full border border-smoke px-4 py-2 text-xs tracking-wide text-ash transition-colors hover:border-champagne/50 hover:text-bone"
      >
        {t("email")}
      </button>
      <button
        type="button"
        onClick={() => void copyLink()}
        className={
          copied
            ? "rounded-full bg-champagne px-4 py-2 text-xs font-medium tracking-wide text-noir"
            : "rounded-full border border-smoke px-4 py-2 text-xs tracking-wide text-ash transition-colors hover:border-champagne/50 hover:text-bone"
        }
      >
        {copied ? t("copied") : t("copyLink")}
      </button>
    </div>
  );
}