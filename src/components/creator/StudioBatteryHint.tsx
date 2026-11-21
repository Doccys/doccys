"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BATTERI_ADVARSGRAENSE, laesBatteri } from "@/lib/battery";

/**
 * Batteri-varsel i skaber-studiet — vises KUN når batteriet er lavt
 * og enheden ikke lader (grænsen: BATTERI_ADVARSGRAENSE i lib/battery).
 *
 * Én forekomst øverst i studiet dækker hele arbejdsgangen (upload →
 * undertekster → trailer), så der ikke opstår et varsel pr. film-række.
 * Understøtter ikke batteri-API'en (iOS Safari) → ingen linje — der
 * kan ikke måles, og en blind advarsel er bare støj.
 */
export default function StudioBatteryHint() {
  const t = useTranslations("creatorStudio");
  // null = ikke målt/ok; tal = vist procent under grænsen.
  const [lavt, setLavt] = useState<number | null>(null);

  useEffect(() => {
    let aktiv = true;
    void (async () => {
      const b = await laesBatteri();
      if (b && aktiv && !b.charging && b.level < BATTERI_ADVARSGRAENSE) {
        setLavt(Math.round(b.level * 100));
      }
    })();
    return () => {
      aktiv = false;
    };
  }, []);

  if (lavt === null) return null;

  return (
    <p className="mt-3 max-w-2xl rounded-lg border border-champagne/30 bg-noir px-4 py-3 text-sm leading-relaxed text-champagne">
      {t("batteryLow", { percent: lavt })}
    </p>
  );
}
