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
  /**
   * Klar trailer (film_trailers, status 'ready') — den gratis
   * smagsprøve: findes den, afspilles den i stedet for låsen, og
   * CTA'en står i en stribe under traileren. Filmens SELV er stadig
   * låst (konto + fuld dækning) — traileren er reklame, ikke minutter.
   */
  trailerUrl?: string | null;
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
  trailerUrl,
}: PaywallCardProps) {
  const t = await getTranslations("paywall");

  // CTA-teksterne deles af smagsprøve- og lås-varianten.
  const body =
    mode === "login"
      ? t("loginBody")
      : t("buyBody", {
          minutes: Math.max(requiredMinutes ?? 0, 0),
          balance: Math.max(balanceMinutes ?? 0, 0),
        });
  const ctaHref = mode === "login" ? "/login" : "/profile#minutter";
  const ctaText = mode === "login" ? t("loginCta") : t("buyCta");

  return (
    <div className="mx-auto w-full max-w-[calc((100dvh-12rem)*16/9)]">
      <div className="flex aspect-video flex-col overflow-hidden rounded-xl border border-smoke bg-onyx shadow-2xl shadow-black/60">
        {trailerUrl ? (
          <>
            {/* Smagsprøven: traileren afspilles frit — den ER filmens
                reklame — og CTA-stripen under den fører videre. */}
            <div className="relative flex-1">
              <span className="absolute left-4 top-4 z-10 rounded-full bg-noir/85 px-3 py-1 text-[11px] uppercase tracking-[0.25em] text-champagne">
                {t("trailerLabel")}
              </span>
              <video
                src={trailerUrl}
                controls
                playsInline
                preload="metadata"
                className="absolute inset-0 h-full w-full object-contain"
              />
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-smoke px-6 py-4 text-center">
              <p className="max-w-md text-sm leading-relaxed text-ash">{body}</p>
              <Link
                href={ctaHref}
                className="rounded-full bg-champagne px-6 py-2.5 text-sm font-semibold text-onyx transition-colors hover:bg-champagne/85"
              >
                {ctaText}
              </Link>
            </div>
          </>
        ) : (
          <div className="relative flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
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
                  {body}
                </p>
              </div>
              <Link
                href={ctaHref}
                className="rounded-full bg-champagne px-8 py-3 text-sm font-semibold text-onyx transition-colors hover:bg-champagne/85"
              >
                {ctaText}
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}