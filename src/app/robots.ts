import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/**
 * robots.txt — åben for alt offentligt indhold; API-ruter holdes
 * ude (de er ikke til crawlere). Sitemap-pejling giver Google og
 * andre en automatisk indgang til hele kataloget.
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}