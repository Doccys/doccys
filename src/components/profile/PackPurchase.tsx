"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MINUTE_PACKS } from "@/lib/data/minutePacks";
import { formatCurrency } from "@/lib/utils/format";

interface PackPurchaseProps {
  locale: string;
}

/**
 * Køb af minutpakker (klient-komponent).
 *
 * POST /api/checkout → Stripe Checkout-hosted side → redirect
 * tilbage til profilen (?koeb=ok). Købet registreres som 'pending'
 * server-side; først webhooken (checkout.session.completed)
 * kreditér pakken atomisk via indfri_koeb.
 */
export default function PackPurchase({ locale }: PackPurchaseProps) {
  const t = useTranslations("minutes");
  const [pendingPack, setPendingPack] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function buyPack(packId: string) {
    setPendingPack(packId);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId, locale }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? t("purchaseError"));
        setPendingPack(null);
        return;
      }
      // ud til Stripe Checkout
      window.location.assign(data.url);
    } catch {
      setError(t("purchaseError"));
      setPendingPack(null);
    }
  }

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-3">
        {MINUTE_PACKS.map((pack) => (
          <div
            key={pack.id}
            className="flex flex-col items-center gap-4 rounded-xl border border-smoke bg-onyx px-6 py-6 text-center"
          >
            <div>
              <p className="font-display text-3xl text-bone">
                {t("packMinutes", { minutes: pack.minutes })}
              </p>
              <p className="mt-1 text-sm text-champagne">
                {t("packPrice", {
                  price: formatCurrency(pack.priceDkkInclDkVat, locale),
                })}
              </p>
              <p className="mt-1 text-xs text-ash">{t("vatNote")}</p>
            </div>
            <button
              type="button"
              disabled={pendingPack !== null}
              onClick={() => void buyPack(pack.id)}
              className="rounded-full bg-champagne px-6 py-2.5 text-xs font-semibold tracking-wide text-noir transition-colors hover:bg-bone disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pendingPack === pack.id ? "…" : t("packBuy")}
            </button>
          </div>
        ))}
      </div>
      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
    </div>
  );
}