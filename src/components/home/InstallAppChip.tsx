"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Fronsidens synlige PWA-installering (brugerens ønske 8/11):
 * - Chrome/Edge (desktop + Android) fyrer beforeinstallprompt — knappen
 *   fremkaller den native installationsdialog.
 * - iOS/iPadOS udsender ALDRIG beforeinstallprompt — der vises i stedet
 *   instruktionslinjen (Del → Føj til startskærm).
 * - Andet uden prompt-event: intet renderes (en knap, der fejler, er
 *   værre end ingen).
 * - Appen allerede installeret (display-mode: standalone): skjules.
 * KOMMUNIKERER MED SW'en IKKE — der kræves bare en SW med fetch-handler
 * (public/sw.js), som ServiceWorkerRegister registrerer i production.
 */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua);
}

export default function InstallAppChip() {
  const t = useTranslations("installApp");
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(
    null,
  );
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    // Allerede installeret (PWA-tilstand) → intet chip.
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setHidden(true);
      return;
    }
    const handler = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === "accepted") setHidden(true);
  };

  if (hidden) return null;

  if (promptEvent) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 px-6 sm:flex-row sm:items-center">
        <p className="text-sm text-ash">{t("title")}</p>
        <button
          type="button"
          onClick={install}
          className="shrink-0 rounded-full border border-smoke bg-onyx px-4 py-2 text-xs font-medium text-champagne transition-colors hover:border-champagne"
        >
          {t("button")}
        </button>
      </div>
    );
  }

  if (isIosDevice()) {
    return (
      <div className="mx-auto max-w-6xl px-6">
        <p className="text-xs text-ash/70">{t("iosHint")}</p>
      </div>
    );
  }

  return null;
}
