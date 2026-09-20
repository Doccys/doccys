import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { getCreatorByHandle, getDocumentaryBySlug } from "@/lib/data/catalog";
import { formatCurrency, formatNumber } from "@/lib/utils/format";
import { siteUrl } from "@/lib/site";

/**
 * Personligt støtte-bevis som PNG (1200×630):
 *   /api/bevis/{slug}?lang={locale}
 *
 * Delbart modstykke til bevis-overlayet i afspilleren — seeren kan
 * hente kortet og dele det ("Jeg så X — Y kr gik direkte til
 * skaberen"). Ruten er TVUNGET dynamisk (persondata: seerens egne
 * afspilninger) og må aldrig caches.
 *
 * Sikkerhed: identiteten læses server-side fra Supabase-cookies;
 * sessionerne filteres på user_id (RLS + eksplicit dobbeltforsvar),
 * og kun VALIDE afspilninger (verdict.verdict = 'valid') kan blive
 * et bevis. Beløbet regnes med samme formel som overlayet — ingen
 * nye sandheder, kun en ny indpakning.
 */
export const dynamic = "force-dynamic";

const NOIR = "#08080a";
const ASH = "#9a9aa8";
const BONE = "#efece5";
const CHAMPAGNE = "#d4b678";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const lang = new URL(request.url).searchParams.get("lang");
  const locale = (routing.locales as readonly string[]).includes(lang ?? "")
    ? (lang as string)
    : routing.defaultLocale;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Log ind for at hente dit bevis", { status: 401 });
  }

  // Seneste validerte afspilning af DENNE film (nyeste først)
  const { data: sessions, error } = await supabase
    .from("view_sessions")
    .select("watched_seconds, verdict, started_at")
    .eq("user_id", user.id)
    .eq("documentary_slug", slug)
    .neq("status", "active")
    .order("started_at", { ascending: false })
    .limit(50);
  if (error) {
    return new Response("Beviset kunne ikke hentes", { status: 500 });
  }
  const valid = (sessions ?? []).find(
    (row) =>
      (row.verdict as { verdict?: string } | null)?.verdict === "valid" &&
      row.watched_seconds > 0,
  );
  if (!valid) {
    return new Response("Ingen gyldig afspilning fundet", { status: 404 });
  }

  const documentary = await getDocumentaryBySlug(slug, locale);
  if (!documentary) {
    return new Response("Ikke fundet", { status: 404 });
  }
  const creator = await getCreatorByHandle(documentary.creatorHandle);

  // Samme tal som overlayet: minutter + beløb efter filmens sats
  const minutes = Math.round(valid.watched_seconds / 60);
  const amountDkk =
    ((valid.watched_seconds / 60) * documentary.payoutRateDkk) / 100;

  const t = await getTranslations({ locale, namespace: "watch" });
  const minutesLine = t("proofMinutes", {
    minutes: formatNumber(minutes, locale),
  });
  const supportLine = creator
    ? t("proofSupport", {
        amount: formatCurrency(amountDkk, locale),
        creator: creator.name,
      })
    : t("proofSupportUnnamed", {
        amount: formatCurrency(amountDkk, locale),
      });

  // NB: én samlet streng pr. tekst-div — satori fejler på flere
  // tekst-children uden display:flex (samme faldgrube som /og/film)
  let host = "";
  try {
    host = new URL(siteUrl()).host;
  } catch {
    // faldgrube-safe: footeren er pynt
  }

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 56,
        background: NOIR,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div
          style={{
            color: CHAMPAGNE,
            fontSize: 34,
            fontWeight: 700,
            letterSpacing: 14,
          }}
        >
          DOCCYS
        </div>
        <div style={{ color: ASH, fontSize: 24, letterSpacing: 6 }}>
          {host}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          border: `2px solid ${CHAMPAGNE}55`,
          borderRadius: 24,
          padding: 44,
          width: "100%",
          backgroundColor: "#101014",
        }}
      >
        <div
          style={{
            color: CHAMPAGNE,
            fontSize: 22,
            letterSpacing: 8,
            textTransform: "uppercase",
          }}
        >
          {t("proofEyebrow")}
        </div>
        <div
          style={{
            color: BONE,
            fontSize: 56,
            fontWeight: 700,
            lineHeight: 1.15,
            marginTop: 18,
          }}
        >
          {documentary.title}
        </div>
        <div style={{ color: ASH, fontSize: 28, marginTop: 16 }}>
          {minutesLine}
        </div>
        <div
          style={{
            color: CHAMPAGNE,
            fontSize: 32,
            fontWeight: 700,
            marginTop: 10,
          }}
        >
          {supportLine}
        </div>
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
}