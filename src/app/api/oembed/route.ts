import { NextRequest, NextResponse } from "next/server";

/**
 * oEmbed-endepunkt:  GET /api/oembed?url={watch-URL}
 *
 * Gør filmen indlejrbar i CMS'er og platforme, der taler oEmbed
 * (WordPress m.fl.): send dem watch-URL'en, få en iframe med
 * filmens embed-side (/api/embed/{slug} — trailer-smagsprøven eller
 * plakaten + CTA) tilbage. Watch-sidens metadata annoncerer netop
 * denne rute via <link rel="alternate" type="application/json+oembed">.
 *
 * Data hentes via PostgREST med anon-nøglen — ingen cookies, ingen
 * session, så svaret kan cacheles.
 */
export const dynamic = "force-dynamic";

/** Iframe-mål til html-feltet: 16:9-scenen + CTA-bjælken under den */
const EMBED_WIDTH = 960;
const EMBED_HEIGHT = 620;

interface FilmRow {
  title: string;
  poster_url: string | null;
  creator_handle: string;
}

/** HTML-escape af alt tekstindhold fra databasen (titler m.m.). */
function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Udtrækker slug'en af en watch-URL (/da/watch/{slug}, /embed/…). */
function slugFromUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const segments = url.pathname.split("/").filter(Boolean);
    const watchIndex = segments.indexOf("watch");
    if (watchIndex === -1 || watchIndex + 1 >= segments.length) return null;
    // locale-segmentet kan indeholde "?"-rest — URL-klassen har allerede
    // adskilt query; tag kun selve slug-delen.
    return segments[watchIndex + 1];
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const urlParam = request.nextUrl.searchParams.get("url");
  if (!urlParam) {
    return NextResponse.json({ error: "url-parameter mangler" }, { status: 400 });
  }
  const slug = slugFromUrl(urlParam);
  if (!slug) {
    return NextResponse.json(
      { error: "URL'en peger ikke på en film" },
      { status: 400 },
    );
  }

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/documentaries` +
      `?select=title,poster_url,creator_handle` +
      `&slug=eq.${encodeURIComponent(slug)}&status=eq.published`,
    { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" } },
  );
  const films = res.ok ? ((await res.json()) as FilmRow[]) : [];
  const film = films[0];
  if (!film) {
    return NextResponse.json({ error: "Filmen findes ikke" }, { status: 404 });
  }

  const origin = request.nextUrl.origin;
  const title = escapeHtml(film.title);

  return NextResponse.json(
    {
      version: "1.0",
      type: "video",
      provider_name: "Doccys",
      provider_url: origin,
      title: film.title,
      author_name: film.creator_handle,
      author_url: `${origin}/creator/${encodeURIComponent(film.creator_handle)}`,
      thumbnail_url:
        film.poster_url ?? `${origin}/og/film/${encodeURIComponent(slug)}`,
      html:
        `<iframe src="${origin}/api/embed/${encodeURIComponent(slug)}"` +
        ` width="${EMBED_WIDTH}" height="${EMBED_HEIGHT}"` +
        ` style="border:0;border-radius:12px;overflow:hidden"` +
        ` allow="fullscreen; picture-in-picture" allowfullscreen` +
        ` title="${title}"></iframe>`,
      width: EMBED_WIDTH,
      height: EMBED_HEIGHT,
    },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}