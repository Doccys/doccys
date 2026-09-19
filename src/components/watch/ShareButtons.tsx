"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Del-rækken under afspilleren: direkte delings-links til de store
 * platforme + "Kopiér link". URL'en læses ved KLIK-tid (window.
 * location.href), så det lokaliserede link (/da/watch/…) deles som
 * seeren ser det — og prerender uden window sprænger ikke.
 *
 * Åbner platformens delings-dialog i nyt faneblad (noopener), og
 * mailto: lægges i samme fane, hvor mail-klienten tager over.
 */

/** brand-navne er universelle og er IKKE i i18n-filerne */
const PLATFORMS: { name: string; build: (url: string, title: string) => string }[] = [
  {
    name: "Facebook",
    build: (url) => `https://www.facebook.com/sharer/sharer.php?u=${url}`,
  },
  {
    name: "WhatsApp",
    build: (url, title) => `https://wa.me/?text=${title}%20${url}`,
  },
  {
    name: "X",
    build: (url, title) => `https://twitter.com/intent/tweet?url=${url}&text=${title}`,
  },
  {
    name: "Telegram",
    build: (url, title) => `https://t.me/share/url?url=${url}&text=${title}`,
  },
  {
    name: "Reddit",
    build: (url, title) => `https://www.reddit.com/submit?url=${url}&title=${title}`,
  },
];

export default function ShareButtons({ title }: { title: string }) {
  const t = useTranslations("share");
  const [copied, setCopied] = useState(false);

  function openPlatform(build: (url: string, title: string) => string) {
    const href = build(
      encodeURIComponent(window.location.href),
      encodeURIComponent(title),
    );
    window.open(href, "_blank", "noopener,noreferrer");
  }

  function openEmail() {
    const href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(
      window.location.href,
    )}`;
    window.location.href = href; // mail-klienten tager over i samme fane
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
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
      {PLATFORMS.map(({ name, build }) => (
        <button
          key={name}
          type="button"
          onClick={() => openPlatform(build)}
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