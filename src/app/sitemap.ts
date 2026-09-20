import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { siteUrl } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { getCollections } from "@/lib/data/catalog";

/**
 * sitemap.xml — ét entry pr. side med hreflang-alternater for alle
 * 8 sprog (search engines aflæser alternaterne og viser den rette
 * sprogversion i søgeresultater). Kun offentligt indhold: publice-
 * rede film, alle skabere og alle kuraterede samlinger med mindst
 * én publiceret film; kladder og tomme samlinger holdes ude.
 *
 * Revalideres hver time — ikke på hvert besøg (sitemaps besøges
 * sjældent, og DB-kaldet er det samme alligevel).
 */
export const revalidate = 3600;

function entry(
  path: string,
  lastModified: Date,
  priority: number,
): MetadataRoute.Sitemap[number] {
  const base = siteUrl();
  // hreflang: alle 8 sprogversioner af samme side
  const languages: Record<string, string> = {};
  for (const locale of routing.locales) {
    languages[locale] = `${base}/${locale}${path}`;
  }
  return {
    url: `${base}/${routing.defaultLocale}${path}`,
    lastModified,
    changeFrequency: "weekly",
    priority,
    alternates: { languages },
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const now = new Date();

  const supabase = await createClient();
  const [filmsRes, creatorsRes, collections] = await Promise.all([
    supabase
      .from("documentaries")
      .select("slug, created_at")
      .eq("status", "published")
      .order("created_at", { ascending: false }),
    supabase.from("creators").select("handle").order("handle"),
    getCollections(),
  ]);

  return [
    {
      url: base,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    entry("/creators", now, 0.8),
    entry("/collections", now, 0.6),
    ...(creatorsRes.data ?? []).map((c) =>
      entry(`/creator/${c.handle}`, now, 0.7),
    ),
    ...(filmsRes.data ?? []).map((f) =>
      entry(`/watch/${f.slug}`, new Date(f.created_at), 0.9),
    ),
    // kun samlinger med mindst én publiceret film
    ...collections
      .filter((c) => c.filmCount > 0)
      .map((c) => entry(`/collections/${c.slug}`, now, 0.6)),
  ];
}