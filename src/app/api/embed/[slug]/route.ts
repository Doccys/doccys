import { NextRequest, NextResponse } from "next/server";

import { isPlatformLocale } from "@/lib/i18n/languageNames";

export const dynamic = "force-dynamic";

/**
 * Indlejring af én film — HTML ud af en API-rute, bevidst UDEN om
 * app-layoutet (header/footer), så iframen er ren.
 *
 *   https://doccys.com/api/embed/{slug}?lang=da
 *
 * Indholdet er filmens GRATIS del: er der en klar trailer (film_
 * trailers 'ready'), afspilles den — ellers vises plakaten i filmens
 * gradient. Selve filmen er fortsat bag paywallen: CTA-linket fører
 * til watch-siden (åbner i nyt faneblad, da iframen ikke kan top-
 * navigere). oEmbed-ruten (/api/oembed) leverer præcis denne URL
 * som sin html-værdi.
 *
 * Data hentes via PostgREST med anon-nøglen (som /og/film) — ingen
 * cookies, ingen dynamisk session, så svaret kan cacheles frit
 * (Cache-Control: 1 time) og virker uafhængigt af seerens login.
 * Kun publicerede film findes her — kladder kan ikke indlejres.
 */

const NOIR = "#08080a";
const BONE = "#efece5";
const ASH = "#9a9aa8";
const CHAMPAGNE = "#d4b678";

/** HTML-escape af alt tekstindhold fra databasen (titler m.m.). */
function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** hex-koderne ud af "from-[#0f2027] via-[#203a43] to-[#2c5364]" */
function gradientHexes(gradient: string): string[] {
  const hexes = gradient.match(/#[0-9a-fA-F]{6}/g);
  return hexes && hexes.length >= 2 ? hexes : [NOIR, "#16161c"];
}

interface FilmRow {
  title: string;
  year: number;
  duration_sec: number;
  gradient: string;
  poster_url: string | null;
  creator_handle: string;
}

interface EmbedStrings {
  cta: string;
  trailerLabel: string;
}

async function loadStrings(locale: string): Promise<EmbedStrings> {
  // Samme import-mønster som src/i18n/request.ts — her fra
  // src/app/api/embed/[slug]/ er roden 5 niveauer op.
  const messages = (await import(`../../../../../messages/${locale}.json`))
    .default as { embed?: { cta?: string; trailerLabel?: string } };
  return {
    cta: messages.embed?.cta ?? "Se hele filmen på Doccys",
    trailerLabel: messages.embed?.trailerLabel ?? "Trailer",
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  // Sproget vælges af indlejringen (?lang=) — ukendt falder til dansk
  const langParam = request.nextUrl.searchParams.get("lang") ?? "da";
  const lang = isPlatformLocale(langParam) ? langParam : "da";

  const headers = { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" };
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;

  const filmRes = await fetch(
    `${base}/documentaries?select=title,year,duration_sec,gradient,poster_url,creator_handle` +
      `&slug=eq.${encodeURIComponent(slug)}&status=eq.published`,
    { headers },
  );
  if (!filmRes.ok) {
    return new NextResponse("Ikke fundet", { status: 404 });
  }
  const films = (await filmRes.json()) as FilmRow[];
  const film = films[0];
  if (!film) {
    return new NextResponse("Ikke fundet", { status: 404 });
  }

  const [trailerRes, creatorRes, strings] = await Promise.all([
    fetch(
      `${base}/film_trailers?select=trailer_url` +
        `&documentary_slug=eq.${encodeURIComponent(slug)}&status=eq.ready`,
      { headers },
    ),
    fetch(
      `${base}/creators?select=name&handle=eq.${encodeURIComponent(film.creator_handle)}`,
      { headers },
    ),
    loadStrings(lang),
  ]);

  const trailerUrl =
    ((await trailerRes.json()) as { trailer_url: string | null }[])[0]
      ?.trailer_url ?? null;
  const creatorName =
    ((await creatorRes.json()) as { name: string }[])[0]?.name ?? null;

  const hexes = gradientHexes(film.gradient);
  const bg = `linear-gradient(135deg, ${hexes[0]}, ${hexes[hexes.length - 1]})`;
  const minutes = Math.round(film.duration_sec / 60);

  // CTA fører videre til watch-siden — Uden locale-præfiks: next-intl
  // middleware redirecter til seerens eget sprog automatisk.
  const watchHref = `${request.nextUrl.origin}/watch/${encodeURIComponent(slug)}?utm_source=embed&utm_medium=embed&utm_campaign=doccys`;

  const metaLine = escapeHtml(
    [String(film.year), `${minutes} min`, "DOCCYS"].join(" · "),
  );
  const title = escapeHtml(film.title);
  const cta = escapeHtml(strings.cta);
  const trailerLabel = escapeHtml(strings.trailerLabel);
  const byCreator = creatorName
    ? ` · ${escapeHtml(creatorName)}`
    : "";

  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · DOCCYS</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: ${NOIR};
    color: ${BONE};
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  /* Scenen er altid 16:9; CTA-bjælken står UNDER den, så videoens
     egne kontroller aldrig bliver overdækket af noget. */
  .stage {
    position: relative;
    aspect-ratio: 16 / 9;
    background: ${bg};
    background-size: cover;
    background-position: center;
    overflow: hidden;
  }
  .poster {
    position: absolute; inset: 0;
    width: 100%; height: 100%;
    object-fit: cover;
    opacity: 0.9;
  }
  video { position: absolute; inset: 0; width: 100%; height: 100%; }
  .brand {
    position: absolute;
    top: 16px; left: 20px;
    color: ${CHAMPAGNE};
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 6px;
    text-decoration: none;
  }
  .badge {
    position: absolute;
    top: 16px; right: 20px;
    background: rgba(8,8,10,0.85);
    color: ${CHAMPAGNE};
    font-size: 11px;
    letter-spacing: 3px;
    text-transform: uppercase;
    border-radius: 999px;
    padding: 4px 12px;
  }
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 16px;
    padding: 14px 20px;
  }
  h1 { font-size: 16px; line-height: 1.3; }
  .meta { color: ${ASH}; font-size: 12px; margin-top: 3px; }
  .cta {
    display: inline-block;
    background: ${CHAMPAGNE};
    color: ${NOIR};
    font-size: 13px;
    font-weight: 600;
    text-decoration: none;
    border-radius: 999px;
    padding: 9px 20px;
    white-space: nowrap;
  }
</style>
</head>
<body>
<div class="stage">
  ${
    trailerUrl
      ? `<video src="${escapeHtml(trailerUrl)}" controls playsinline preload="metadata"></video>
         <span class="badge">${trailerLabel}</span>`
      : film.poster_url
        ? `<img class="poster" src="${escapeHtml(film.poster_url)}" alt="${title}">`
        : ""
  }
  <a class="brand" href="${escapeHtml(request.nextUrl.origin)}/" target="_blank" rel="noopener">DOCCYS</a>
</div>
<div class="bar">
  <div>
    <h1>${title}</h1>
    <p class="meta">${metaLine}${byCreator}</p>
  </div>
  <a class="cta" href="${escapeHtml(watchHref)}" target="_blank" rel="noopener">${cta}</a>
</div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Traileren/indholdet kan cacheles frit — der er ingen session
      // i stykket. En nyligt genereret trailer ses senest efter en time.
      "Cache-Control": "public, max-age=3600",
    },
  });
}