import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";

interface PaywallCardProps {
  /**
   * login = seeren er ikke logget ind; buy = logget ind men
   * saldoen dækker ikke filmens fulde længde.
   */
  mode: "login" | "buy";
  /** Filmens længde i minutter (buy-varianten) */
  requiredMinutes?: number;
  /** Seerens aktuelle saldo i minutter (buy-varianten) */
  balanceMinutes?: number;
}

/**
 * Paywall-kortet — vises i stedet for afspilleren, når seeren
 * ikke kan starte filmen. Al film-info (titel, synopsis, creator,
 * kommentarer) forbliver synlig bag kortet; det er kun selve
 * afspilningen, der kræver saldo ("fuld dækning": filmen kan kun
 * startes, hvis saldoen dækker hele længden).
 */
export default async function PaywallCard({
  mode,
  requiredMinutes,
  balanceMinutes,
}: PaywallCardProps) {
  const t = await getTranslations("paywall");

  return (
    <div className="mx-auto w-full max-w-[calc((100dvh-12rem)*16/9)]">
      <div className="relative flex aspect-video flex-col items-center justify-center gap-6 overflow-hidden rounded-xl border border-smoke bg-onyx px-6 text-center shadow-2xl shadow-black/60">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(0,0,0,0.75)_100%)]"
        />
        <div className="relative flex flex-col items-center gap-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-champagne/40 text-2xl text-champagne">
            🔒
          </div>
          <div>
            <h2 className="font-display text-2xl text-bone">
              {mode === "login" ? t("loginTitle") : t("buyTitle")}
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ash">
              {mode === "login"
                ? t("loginBody")
                : t("buyBody", {
                    minutes: Math.max(requiredMinutes ?? 0, 0),
                    balance: Math.max(balanceMinutes ?? 0, 0),
                  })}
            </p>
          </div>
          {mode === "login" ? (
            <Link
              href="/login"
              className="rounded-full bg-champagne px-8 py-3 text-sm font-semibold text-onyx transition-colors hover:bg-champagne/85"
            >
              {t("loginCta")}
            </Link>
          ) : (
            <Link
              href="/profile#minutter"
              className="rounded-full bg-champagne px-8 py-3 text-sm font-semibold text-onyx transition-colors hover:bg-champagne/85"
            >
              {t("buyCta")}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}