import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/**
 * LANCERINGS-LÅSEN (27/9) — LÆFTET 18/11 (brugerens beslutning, før
 * planlagt 1/12): Google må nu crawl doccys.com. Search Console er
 * verificeret + sitemap submit'et siden 16/11, så indeksering starter
 * straks efter dette deploy (dage — brand-søgning først, "Request
 * indexing" på forsiden/watch fremskynder).
 *
 * DELINGS-CRAWLERNE (facebookexternalhit/Twitterbot/HeadlessChrome/
 * meta-external × 14/11-fundet) forbliver explicit tilladt — FB's
 * robots-cache og delings-kortene tager ingen skade af det åbne
 * rules.
 *
 * /api/ forbliver Disallowed (API-rutene er ikke for indeksering).
 * RENDITION-MODELLEN (brugerens VFR-observation 13/11) er nu kode-
 * understøttet — film rør kun Bunny/Supabase, ingen trace-glob
 * behøvet her.
 */
const ÅBEN_NEDENFOR = true;

/** Delings-crawlerne: kortene skal virke uanset tilstand (14/11). */
const DELINGS_CRAWLERE = [
  "facebookexternalhit",
  "Twitterbot",
  "HeadlessChrome",
  "meta-externalagent",
  "meta-externalfetcher",
];

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: [
      ...DELINGS_CRAWLERE.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: ["/api/"],
      })),
      { userAgent: "*", allow: "/", disallow: ["/api/"] },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
