import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/**
 * LANCERINGS-LÅS (27/9): doccys.com er skjult for søgemaskiner,
 * indtil lanceringen. Feedback-runden kører på et katalog med
 * testfilm, og domænet må ikke blive fotograferet af Google i
 * den tilstand — robots.txt lukker for AL crawl (ingen sitemap-
 * pejling, intet indhold indekseres).
 *
 * VED LANCERING: sæt ÅBEN_NEDENFOR til true og commit
 * ("launch: aaben for indeksering") — så genoprettes den åbne
 * robots.txt med sitemap-pejling. Bemærk: allerede indekserede
 * sider (der burde være ingen endnu) fjernes bedst via en
 * fjernelsesanmodning i Google Search Console.
 */
const ÅBEN_NEDENFOR = false;

export default function robots(): MetadataRoute.Robots {
  if (!ÅBEN_NEDENFOR) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  const base = siteUrl();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}