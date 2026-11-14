import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/**
 * LANCERINGS-LÅS (27/9): doccys.com er skjult for søgemaskiner,
 * indtil lanceringen. Feedback-runden kører på et katalog med
 * testfilm, og domænet må ikke blive fotograferet af Google i
 * den tilstand — robots.txt lukker for AL crawl (ingen sitemap-
 * pejling, intet indhold indekseres).
 *
 * DELINGS-KORTENE (14/11, brugerens observation): Facebook og
 * WhatsApp crawler med UA'en "facebookexternalhit" og RESPEKTERER
 * robots.txt — låsen gav dem 403, og delte skaberprofiler vises
 * som bar link. De to delings-crawlere (facebookexternalhit +
 * Twitterbot) er derfor explicitt tilladt ALLIGEVEL: kortene
 * læser kun metadata (og:title/og:image), der indekseres intet —
 * søgemaskinerne (Googlebot m.fl.) forbliver på "*" Disallow.
 *
 * VED LANCERING: sæt ÅBEN_NEDENFOR til true og commit
 * ("launch: aaben for indeksering") — så genoprettes den åbne
 * robots.txt med sitemap-pejling. Bemærk: allerede indekserede
 * sider (der burde være ingen endnu) fjernes bedst via en
 * fjernelsesanmodning i Google Search Console.
 */
const ÅBEN_NEDENFOR = false;

/** Delings-crawlerne: kortene skal virke under låsen (14/11). De nye
 *  Meta-fetcher-versioner (FB/WhatsApp's forhåndsvisninger) bruger et
 *  HeadlessChrome/méta-external UA og falder ellers under "*" Disallow
 *  → 403. */
const DELINGS_CRAWLERE = [
  "facebookexternalhit",
  "Twitterbot",
  "HeadlessChrome",
  "meta-externalagent",
  "meta-externalfetcher",
];

export default function robots(): MetadataRoute.Robots {
  if (!ÅBEN_NEDENFOR) {
    return {
      rules: [
        ...DELINGS_CRAWLERE.map((ua) => ({ userAgent: ua, allow: "/" })),
        { userAgent: "*", disallow: "/" },
      ],
    };
  }
  const base = siteUrl();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}