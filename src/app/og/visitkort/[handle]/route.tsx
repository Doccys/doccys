import { ImageResponse } from "next/og";
import { createTranslator } from "next-intl";
import { routing } from "@/i18n/routing";
import { localizedCountry } from "@/lib/i18n/content";

/**
 * Skaberens delbare visitkort som PNG (1200×630):
 *   /og/visitkort/{handle}?lang={locale}
 *
 * To jobs: skaberen kan hente kortet i studiet og dele det (sociale
 * medier, mails, festivaler) — OG det er og:image på skaberprofilen,
 * så delte doccys-links viser som et flot kort. Beskeden er bevidst
 * "doccys.com"-reklame (brugerens ønske): domænet står både i
 * sidehovedet og som profil-URL — det er en fast marketing-tekst,
 * IKKE siteUrl() (som i dev er localhost og kun bruges af metadata).
 *
 * Arkitektur som /og/film (offentlig + cache-bar): data hentes via
 * PostgREST med anon-nøglen — ikke createClient, som rører cookies og
 * ville gøre ruten dynamisk. Teksterne løses med createTranslator +
 * direkte messages-import (samme vej som content.ts) af samme
 * grund: next-intl's request-API'er læser headers → dynamisk rute.
 */
export const revalidate = 3600;

const NOIR = "#08080a";
const ASH = "#9a9aa8";
const BONE = "#efece5";
const CHAMPAGNE = "#d4b678";

/** fast marketing-tekst — se header-kommentaren */
const BRAND_DOMAIN = "doccys.com";

interface CreatorRow {
  id: string;
  name: string;
  handle: string;
  founded_year: number;
  country: string;
}

async function restFetch(path: string): Promise<unknown | null> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`,
    {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" },
      next: { revalidate: 3600 },
    },
  );
  if (!res.ok) return null;
  return res.json();
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  const lang = new URL(request.url).searchParams.get("lang");
  const locale = (routing.locales as readonly string[]).includes(lang ?? "")
    ? (lang as string)
    : routing.defaultLocale;

  // Skaberprofilen (offentlig række — creators er select using (true))
  const creators = (await restFetch(
    `creators?select=id,name,handle,founded_year,country&handle=eq.${encodeURIComponent(handle)}`,
  )) as CreatorRow[] | null;
  const creator = creators?.[0];
  if (!creator) {
    return new Response("Ikke fundet", { status: 404 });
  }

  // Film-tal: KUN publicerede film tælles — kladder er private
  const films = (await restFetch(
    `documentaries?select=slug&creator_handle=eq.${encodeURIComponent(handle)}&status=eq.published`,
  )) as { slug: string }[] | null;

  // Følger-tal (offentligt). Try/catch: tabellen er ny — i et frisk
  // miljø uden migrationen er tallet pynt, ikke en fejlside.
  let followerCount = 0;
  try {
    const followers = (await restFetch(
      `creator_followers?select=user_id&creator_id=eq.${encodeURIComponent(creator.id)}`,
    )) as { user_id: string }[] | null;
    followerCount = followers?.length ?? 0;
  } catch {
    followerCount = 0;
  }

  // Tekster uden next-intl's request-API'er (header-kommentaren).
  // Projectet har ingen global Messages-type-deklaration (next-intl
  // AppConfig), så createTranslator får namespace-formen eksplicit —
  // ellers udledes nøglerne som never.
  interface VisitkortMessages {
    visitkort: {
      eyebrow: string;
      founded: string;
      films: string;
      followers: string;
    };
  }
  const messages = (await import(`../../../../../messages/${locale}.json`))
    .default as unknown as VisitkortMessages;
  const t = createTranslator({ locale, namespace: "visitkort", messages });

  const country = await localizedCountry(creator.country, locale);
  // NB: én samlet streng pr. tekst-div — satori fejler på flere
  // tekst-children uden display:flex (samme faldgrube som /og/film)
  const metaLine = `${t("founded", { year: creator.founded_year })} · ${country}`;
  const countsLine = `${t("films", { count: films?.length ?? 0 })} · ${t("followers", { count: followerCount })}`;

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
          {BRAND_DOMAIN}
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
          {t("eyebrow")}
        </div>
        <div
          style={{
            color: BONE,
            fontSize: 64,
            fontWeight: 700,
            lineHeight: 1.15,
            marginTop: 18,
          }}
        >
          {creator.name}
        </div>
        <div style={{ color: ASH, fontSize: 28, marginTop: 12 }}>
          @{creator.handle}
        </div>
        <div style={{ color: ASH, fontSize: 26, marginTop: 16 }}>
          {metaLine}
        </div>
        <div
          style={{
            color: CHAMPAGNE,
            fontSize: 32,
            fontWeight: 700,
            marginTop: 10,
          }}
        >
          {countsLine}
        </div>
      </div>

      <div style={{ display: "flex" }}>
        <div style={{ color: BONE, fontSize: 24, letterSpacing: 3 }}>
          {BRAND_DOMAIN}/creator/{creator.handle}
        </div>
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
}