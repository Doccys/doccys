import { NextRequest, NextResponse } from "next/server";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createClient } from "@/lib/supabase/server";
import {
  LOCALE_LANGUAGE_NAMES,
  PLATFORM_LOCALES,
  TRANSLATION_LANGUAGE_HINTS,
  isPlatformLocale,
} from "@/lib/i18n/languageNames";
import { FILM_SUBTITLES_BUCKET } from "@/lib/storage/filmSubtitles";
import { buildVtt, type SubtitleSegment } from "@/lib/subtitles/vtt";
import {
  downloadVideoToDisk,
  extractMp3,
  readMp3,
  transcribeAudio,
} from "@/lib/subtitles/transcribe";
import { translateSegmentTexts } from "@/lib/subtitles/translate";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

/**
 * Undertekst-pipelinen for én film.
 *
 * POST: kører HELE pipelinen synkront (download → ffmpeg → whisper →
 * VTT pr. sprog → oversættelser → upload → film_subtitles-rækker).
 * Det er bevidst: Doccys er selv-hostet, og en typisk film tager
 * 3–15 min (13 sprog). NB: Under serverless (fx Vercel) er der
 * maks-request-tider — dér kræver det en baggrundsjob-arkitektur.
 * Ruten gemmer status pr. sprog i film_subtitles, så en afbrudt
 * kørsel altid kan ses i studiet og genoptages med samme knap
 * (upsert = idempotent).
 *
 * GET: statuslisten pr. sprog — til studio-badgene efter kørslen.
 *
 * Tillidsmodel: ruten kører med creatorens EGEN session, så alle
 * skrivninger går igennem RLS (ruten validerer ejerskab først;
 * policies er anden forsvarslinje, ikke første).
 */

/**
 * Pipeline-sprogene = platformens sprog (13 efter den globale
 * udrulning — jf. 20260923_global_sprog.sql). KILDEN er filmens
 * talesprog (documentaries.spoken_language): whisper skriver lyden
 * af på det sprog, og transskriptionen oversættes derefter direkte
 * til ALLE de andre — aldrig via et pivot-sprog (fejl ville ellers
 * hobbe op over to led).
 */
const ALL_LOCALES = PLATFORM_LOCALES;

/** Supabase-klient bundet til requestens session (RLS gælder 1:1). */
type SessionClient = Awaited<ReturnType<typeof createClient>>;

/** Opdaterer én (film, sprog)-række — fejler lydløst med console.warn. */
async function updateSubtitleRow(
  supabase: SessionClient,
  slug: string,
  locale: string,
  fields: { status?: string; vtt_url?: string | null; error?: string | null },
): Promise<void> {
  const { error } = await supabase
    .from("film_subtitles")
    .update(fields)
    .eq("documentary_slug", slug)
    .eq("locale", locale);
  if (error) {
    console.warn(`film_subtitles (${slug}/${locale}):`, error.message);
  }
}

/** Uploader én VTT til {user_id}/{slug}/{locale}.vtt og returnér URL'en. */
async function uploadVtt(
  supabase: SessionClient,
  objectPath: string,
  vtt: string,
): Promise<string> {
  const { error } = await supabase.storage
    .from(FILM_SUBTITLES_BUCKET)
    .upload(objectPath, vtt, { upsert: true, contentType: "text/vtt" });
  if (error) {
    throw new Error(`VTT-filen kunne ikke uploades: ${error.message}`);
  }
  const { data } = supabase.storage
    .from(FILM_SUBTITLES_BUCKET)
    .getPublicUrl(objectPath);
  return data.publicUrl;
}

/**
 * Fælles auth + ejerskab for begge metoder.
 * Returnerer enten en fejl-respons eller klienten + filmens
 * video-URL og talesprog.
 */
async function requireFilmOwner(
  request: NextRequest,
  slug: string,
): Promise<
  | { ok: false; response: NextResponse }
  | {
      ok: true;
      supabase: SessionClient;
      userId: string;
      videoUrl: string;
      spokenLanguage: string;
    }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Log ind for at generere undertekster" },
        { status: 401 },
      ),
    };
  }

  // Film uden status-filter: kladder kan undertekstes, så creatoren
  // kan publicere med undertekster fra første færdig.
  const { data: film } = await supabase
    .from("documentaries")
    .select("creator_handle, video_url, spoken_language")
    .eq("slug", slug)
    .maybeSingle();
  if (!film) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Filmen findes ikke" }, { status: 404 }),
    };
  }

  const { data: owner } = await supabase
    .from("creators")
    .select("owner_user_id")
    .eq("handle", film.creator_handle)
    .maybeSingle();
  if (owner?.owner_user_id !== user.id) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Kun filmens skaber kan generere undertekster" },
        { status: 403 },
      ),
    };
  }

  // Kolonnen er not null default 'da' — men læses defensivt, hvis
  // sproglisten en dag udvides uden migration af gamle rækker.
  const spoken = isPlatformLocale(film.spoken_language)
    ? film.spoken_language
    : "da";

  return {
    ok: true,
    supabase,
    userId: user.id,
    videoUrl: film.video_url,
    spokenLanguage: spoken,
  };
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { slug } = await context.params;
  const auth = await requireFilmOwner(request, slug);
  if (!auth.ok) return auth.response;
  const { supabase, userId, videoUrl, spokenLanguage } = auth;

  // Kilden er filmens talesprog; ALLE andre platformssprog er mål.
  const sourceLocale = spokenLanguage;
  const targetLocales = ALL_LOCALES.filter(
    (locale) => locale !== sourceLocale,
  );

  // Idempotent start: alle sprog-rækker sættes 'processing' (og gammel
  // URL/fejl ryddes) — en genkørsel overskriver præcis de samme stier.
  const { error: upsertError } = await supabase
    .from("film_subtitles")
    .upsert(
      ALL_LOCALES.map((locale) => ({
        documentary_slug: slug,
        locale,
        status: "processing",
        vtt_url: null,
        error: null,
      })),
      { onConflict: "documentary_slug,locale" },
    );
  if (upsertError) {
    console.warn("POST /api/films/[slug]/subtitles:", upsertError.message);
    return NextResponse.json(
      { error: "Underteksterne kunne ikke startes" },
      { status: 500 },
    );
  }

  // Transskription: download → MP3 → whisper på filmens talesprog.
  // Fejler dette trin, kan intet sprog blive færdigt — alle
  // rækker markeres 'failed'.
  let segments: SubtitleSegment[];
  const workDir = await mkdtemp(path.join(tmpdir(), "doccys-subtitles-"));
  try {
    const videoPath = path.join(workDir, "film.mp4");
    const mp3Path = path.join(workDir, "film.mp3");
    await downloadVideoToDisk(videoUrl, videoPath);
    await extractMp3(videoPath, mp3Path);
    segments = await transcribeAudio(await readMp3(mp3Path), sourceLocale);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await Promise.all(
      ALL_LOCALES.map((locale) =>
        updateSubtitleRow(supabase, slug, locale, {
          status: "failed",
          error: message,
        }),
      ),
    );
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }

  if (segments.length === 0) {
    const message = "Transskriptionen var tom — har filmen talt indhold?";
    await Promise.all(
      ALL_LOCALES.map((locale) =>
        updateSubtitleRow(supabase, slug, locale, { status: "failed", error: message }),
      ),
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Kilde-VTT'en: timings + originaltekst på filmens talesprog,
  // klar fra whisper alene — ingen oversættelse indvolveret.
  const sourceVtt = buildVtt(segments);
  let sourceUrl: string;
  try {
    sourceUrl = await uploadVtt(
      supabase,
      `${userId}/${slug}/${sourceLocale}.vtt`,
      sourceVtt,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateSubtitleRow(supabase, slug, sourceLocale, {
      status: "failed",
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
  await updateSubtitleRow(supabase, slug, sourceLocale, {
    status: "ready",
    vtt_url: sourceUrl,
    error: null,
  });

  // Oversættelser: ét sprog pr. try/catch — ét fejlet sprog må
  // aldrig tage de færdige med sig. Timings genbruges 1:1 fra kilden.
  const texts = segments.map((segment) => segment.text);
  for (const locale of targetLocales) {
    try {
      const translations = await translateSegmentTexts(
        texts,
        // Hintet bærer varianten, hvor den betyder noget: "português"
        // alene kunne give europæisk portugisisk, og kinesisk skal
        // være forenklet. Fald pænt tilbage til navnet/koden.
        TRANSLATION_LANGUAGE_HINTS[locale] ?? LOCALE_LANGUAGE_NAMES[locale] ?? locale,
      );
      const localized = segments.map((segment, i) => ({
        ...segment,
        text: translations[i],
      }));
      const vttUrl = await uploadVtt(
        supabase,
        `${userId}/${slug}/${locale}.vtt`,
        buildVtt(localized),
      );
      await updateSubtitleRow(supabase, slug, locale, {
        status: "ready",
        vtt_url: vttUrl,
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`oversættelse ${slug}/${locale}:`, message);
      await updateSubtitleRow(supabase, slug, locale, {
        status: "failed",
        error: message,
      });
    }
  }

  // Status pr. sprog — badgene i studiet opdateres via router.refresh().
  const { data: rows } = await supabase
    .from("film_subtitles")
    .select("locale, status")
    .eq("documentary_slug", slug)
    .order("locale");
  return NextResponse.json({
    subtitles: rows ?? [],
  });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { slug } = await context.params;
  const auth = await requireFilmOwner(request, slug);
  if (!auth.ok) return auth.response;

  const { data: rows, error } = await auth.supabase
    .from("film_subtitles")
    .select("locale, status, error, vtt_url")
    .eq("documentary_slug", slug)
    .order("locale");
  if (error) {
    console.warn("GET /api/films/[slug]/subtitles:", error.message);
    return NextResponse.json(
      { error: "Statussen kunne ikke hentes" },
      { status: 500 },
    );
  }
  return NextResponse.json({ subtitles: rows ?? [] });
}