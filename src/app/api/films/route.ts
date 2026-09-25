import { NextRequest, NextResponse } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { POSTER_GRADIENTS, isPosterGradient } from "@/lib/data/gradients";
import { isPlatformLocale } from "@/lib/i18n/languageNames";
import type { DocumentaryRow } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

/**
 * POST /api/films — opretter en film-række med status 'draft'
 * (upload til storage er sket forinden i browseren).
 *
 * Server-autoritet ala comments/likes-ruterne: identiteten tages
 * ALTID fra sessionen, og KUN ejeren af en godkendt skaber-profil
 * kan oprette film — betalende seere uden creator-status får 403.
 * RLS håndhæver det samme i databasen; ruten tilføjer validering,
 * ikke privilegier: tvungen draft-status, gradient-safelist (med
 * standard — tapetvalget er fjernet fra studie-UI'et), slug-
 * generering, video-OG-plakat-URL bundet til uploaderens egen mappe
 * samt plakat-PÅKRÆVET (uden foto blev filmene kedelige farveflader)
 * og licens-PÅKRÆVET (licenseAccepted + version — jf. 20260923_film_
 * licens.sql og Handelsbetingelserne afsnit 11).
 */

const MAX_TITLE = 200;
const MAX_SYNOPSIS = 5000;

/** Licens-version pr. upload: bundet til "Senest opdateret"-datoen i
 *  legal.terms.intro og klausulen i legal.terms.sections.s11 —
 *  ændres licens-teksten væsentligt, bumpes alle tre steder. */
const FILM_LICENSE_VERSION = "2026-09-23";

/** Dansk-venlig slug: æ→ae, ø→o, å→a, små bogstaver, bindestreger. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isPlainText(value: unknown, minLength: number, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length >= minLength &&
    value.trim().length <= maxLength
  );
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON-body" }, { status: 400 });
  }

  const title = body.title;
  const synopsis = body.synopsis;
  const year = body.year;
  const genres = body.genres;
  // Tapetvalget er fjernet fra studie-UI'et (20/9) — gradienten lever
  // dog videre som skjult baggrundslag under plakaten overalt i
  // renderingen, så nye film får lydløst palettens standard.
  const gradient =
    typeof body.gradient === "string" && isPosterGradient(body.gradient)
      ? body.gradient
      : POSTER_GRADIENTS[0];
  const durationSec = body.durationSec;
  const videoUrl = body.videoUrl;
  const posterUrl = body.posterUrl;
  const spokenLanguage = body.spokenLanguage;
  // Licens-accept: strikt !== true — fx strengen "true" afvises.
  // Ruten + insert-policyn (RLS) håndhæver begge; beviset (tidspunkt
  // + version) skrives af SERVEREN her, aldrig fra klient-ur.
  const licenseAccepted = body.licenseAccepted === true;

  // Talesprog: valgfrit felt, default 'da' (databasen). Kun de 8
  // platformssprog accepteres — pipelinen skal kunne levere alle
  // undertekst-sprog ud fra kilden, og check-constrainten i
  // databasen har præcis samme liste.
  const spoken = isPlatformLocale(spokenLanguage) ? spokenLanguage : "da";

  if (!isPlainText(title, 2, MAX_TITLE)) {
    return NextResponse.json(
      { error: `Titel skal være 2–${MAX_TITLE} tegn` },
      { status: 400 },
    );
  }
  if (!isPlainText(synopsis, 1, MAX_SYNOPSIS)) {
    return NextResponse.json(
      { error: `Synopsis skal være 1–${MAX_SYNOPSIS} tegn` },
      { status: 400 },
    );
  }
  const currentYear = new Date().getFullYear();
  if (
    typeof year !== "number" ||
    !Number.isInteger(year) ||
    year < 1900 ||
    year > currentYear + 1
  ) {
    return NextResponse.json(
      { error: `Årstal skal være 1900–${currentYear + 1}` },
      { status: 400 },
    );
  }
  if (
    !Array.isArray(genres) ||
    genres.length < 1 ||
    genres.length > 5 ||
    !genres.every((g): g is string => isPlainText(g, 1, 40))
  ) {
    return NextResponse.json(
      { error: "Vælg 1–5 genrer" },
      { status: 400 },
    );
  }
  if (
    typeof durationSec !== "number" ||
    !Number.isInteger(durationSec) ||
    durationSec < 1 ||
    durationSec > 4 * 24 * 60 * 60
  ) {
    return NextResponse.json(
      { error: "Filens længde kunne ikke bruges" },
      { status: 400 },
    );
  }
  if (!licenseAccepted) {
    return NextResponse.json(
      { error: "Du skal bekræfte licensvilkårene, før filmen uploades" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Log ind for at uploade film" },
      { status: 401 },
    );
  }

  // Kun ejeren af en godkendt skaber-profil kan oprette film
  const { data: owned } = await supabase
    .from("creators")
    .select("handle")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!owned) {
    return NextResponse.json(
      { error: "Din skaber-ansøgning er endnu ikke godkendt" },
      { status: 403 },
    );
  }

  // Videoen SKAL ligge i uploaderens egen mappe i film-videos-bucketet
  const { url: supabaseUrl } = getSupabaseEnv();
  const ownFolderPrefix = `${supabaseUrl}/storage/v1/object/public/film-videos/${user.id}/`;
  if (typeof videoUrl !== "string" || !videoUrl.startsWith(ownFolderPrefix)) {
    return NextResponse.json(
      { error: "Video-URL hører ikke til din upload-mappe" },
      { status: 400 },
    );
  }

  // Plakat-billedet er PÅKRÆVT (20/9) — og skal ligge i uploaderens
  // egen mappe (film-posters-bucketet)
  const ownPosterPrefix = `${supabaseUrl}/storage/v1/object/public/film-posters/${user.id}/`;
  if (typeof posterUrl !== "string" || !posterUrl.startsWith(ownPosterPrefix)) {
    return NextResponse.json(
      { error: "Forsidebilledet mangler eller hører ikke til din upload-mappe" },
      { status: 400 },
    );
  }

  // Slug: dansk-venlig base, -2/-3/… ved kollision, tilfældigt
  // suffiks som sidste udvej (bounded retries)
  const base = slugify(title);
  if (!base) {
    return NextResponse.json(
      { error: "Titlen skal indeholde bogstaver eller tal" },
      { status: 400 },
    );
  }
  let slug = base;
  for (let attempt = 2; ; attempt++) {
    const { data: existing } = await supabase
      .from("documentaries")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!existing) break;
    if (attempt > 20) {
      slug = `${base}-${crypto.randomUUID().slice(0, 6)}`;
      break;
    }
    slug = `${base}-${attempt}`;
  }

  // Filens størrelse til egress-estimatet: server-side HEAD på den
  // offentlige URL (klientens File.size kan lyves om; HEAD koster ingen
  // egress — kun headers). Best-effort: fejl ⇒ null, blokerer ALDRIG
  // uploaden.
  let videoFileBytes: number | null = null;
  try {
    const head = await fetch(videoUrl, { method: "HEAD" });
    const length = Number(head.headers.get("content-length"));
    if (head.ok && Number.isFinite(length) && length > 0) {
      videoFileBytes = length;
    }
  } catch {
    // ukendt størrelse → sessioner på filmen får egress-skønnet 0
  }

  // sort_order 1000: default 0 ville straks overtage HeroBannerens
  // "Månedens udvalgte" (forsiden tager laveste sort_order).
  // Redaktionen sætter den endelige position ved publicering.
  const { data: row, error: insertError } = await supabase
    .from("documentaries")
    .insert({
      id: crypto.randomUUID(),
      slug,
      title: title.trim(),
      synopsis: synopsis.trim(),
      year,
      duration_sec: durationSec,
      genres: genres.map((g) => g.trim()),
      creator_handle: owned.handle,
      spoken_language: spoken,
      gradient,
      video_url: videoUrl,
      video_file_size_bytes: videoFileBytes,
      poster_url: posterUrl,
      status: "draft",
      sort_order: 1000,
      license_accepted_at: new Date().toISOString(),
      license_version: FILM_LICENSE_VERSION,
    })
    .select("*")
    .single();

  if (insertError || !row) {
    console.warn("POST /api/films:", insertError?.message);
    return NextResponse.json(
      { error: "Filmen kunne ikke oprettes" },
      { status: 500 },
    );
  }

  const created = row as DocumentaryRow;
  return NextResponse.json(
    {
      documentary: {
        id: created.id,
        slug: created.slug,
        title: created.title,
        status: created.status,
      },
    },
    { status: 201 },
  );
}