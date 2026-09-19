import { NextRequest, NextResponse } from "next/server";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createClient } from "@/lib/supabase/server";
import {
  FILM_VIDEOS_BUCKET,
  publicUrlToStoragePath,
} from "@/lib/storage/filmVideos";
import { downloadVideoToDisk } from "@/lib/subtitles/transcribe";
import { extractTrailerClip } from "@/lib/trailer/clip";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

/** Klippet er altid 90 sekunder — langt nok til at smage, kort nok til at deles. */
const TRAILER_LENGTH_SEC = 90;

/**
 * Trailer-pipelinen for én film (klip af filmens egen fil).
 *
 * POST { startSec? }: kører synkront — download → ffmpeg-klip (90 s
 * fra startSec, 720p/crf 26, +faststart) → upload til film-videos
 * under {user_id}/{slug}-trailer.mp4 (deterministisk sti + upsert:
 * genkørsel overskriver og efterlader ingen forældreløse objekter)
 * → film_trailers-rækken sættes ready/failed.
 *
 * GET: statusrækken til studiet. DELETE: ryd trailer-række + objekt
 * (bruges af kladsletning; rækken har on delete cascade via filmen,
 * men objektet skal fjernes eksplicit).
 *
 * Tillidsmodel som underteksterne: ruten kører med creatorens EGEN
 * session, alle skrivninger går igennem RLS, ejerskab valideres
 * først i requireFilmOwner (policies er anden forsvarslinje).
 */
type SessionClient = Awaited<ReturnType<typeof createClient>>;

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
      durationSec: number;
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
        { error: "Log ind for at generere en trailer" },
        { status: 401 },
      ),
    };
  }

  // Kladder kan traileres — studiet kan forberede filmen, før den
  // publiceres, og paywall/embed viser den kun for published alligevel.
  const { data: film } = await supabase
    .from("documentaries")
    .select("creator_handle, video_url, duration_sec")
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
        { error: "Kun filmens skaber kan generere en trailer" },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true,
    supabase,
    userId: user.id,
    videoUrl: film.video_url,
    durationSec: film.duration_sec,
  };
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { slug } = await context.params;
  const auth = await requireFilmOwner(request, slug);
  if (!auth.ok) return auth.response;
  const { supabase, userId, videoUrl, durationSec } = auth;

  // Starttid: valgfrit fra studiet — klampes til filmens længde, så
  // klippet altid har plads (filmen skal være mindst klippets længde).
  const body = (await request.json().catch(() => ({}))) as {
    startSec?: unknown;
  };
  const requestedStart = Number(body.startSec ?? 0);
  const maxStart = Math.max(0, durationSec - TRAILER_LENGTH_SEC);
  const startSec =
    Number.isFinite(requestedStart) && requestedStart >= 0
      ? Math.min(Math.floor(requestedStart), maxStart)
      : 0;

  // Idempotent start: rækken sættes 'processing' (klip fra 0 ved
  // ulæseligt input). Filmen kortere end klippet? Så er HELE filmen
  // traileren — den tekniske smagsprøve eksisterer alligevel.
  const lengthSec = Math.min(TRAILER_LENGTH_SEC, durationSec);
  const { error: upsertError } = await supabase
    .from("film_trailers")
    .upsert(
      {
        documentary_slug: slug,
        start_sec: startSec,
        length_sec: lengthSec,
        status: "processing",
        trailer_url: null,
        error: null,
      },
      { onConflict: "documentary_slug" },
    );
  if (upsertError) {
    console.warn("POST /api/films/[slug]/trailer:", upsertError.message);
    return NextResponse.json(
      { error: "Traileren kunne ikke startes" },
      { status: 500 },
    );
  }

  const objectPath = `${userId}/${slug}-trailer.mp4`;
  const workDir = await mkdtemp(path.join(tmpdir(), "doccys-trailer-"));
  try {
    const videoPath = path.join(workDir, "film.mp4");
    const trailerPath = path.join(workDir, "trailer.mp4");
    await downloadVideoToDisk(videoUrl, videoPath);
    await extractTrailerClip(videoPath, trailerPath, startSec, lengthSec);

    // Buffer-upload med contentType: virker modsat File-objekter,
    // hvor Supabase ignorerer contentType (dokumenteret gotcha).
    const trailerBytes = await readFile(trailerPath);
    const { error: uploadError } = await supabase.storage
      .from(FILM_VIDEOS_BUCKET)
      .upload(objectPath, trailerBytes, {
        upsert: true,
        contentType: "video/mp4",
      });
    if (uploadError) {
      throw new Error(`Traileren kunne ikke uploades: ${uploadError.message}`);
    }

    const { data } = supabase.storage
      .from(FILM_VIDEOS_BUCKET)
      .getPublicUrl(objectPath);
    await supabase
      .from("film_trailers")
      .update({
        status: "ready",
        trailer_url: data.publicUrl,
        error: null,
      })
      .eq("documentary_slug", slug);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`trailer ${slug}:`, message);
    await supabase
      .from("film_trailers")
      .update({ status: "failed", error: message, trailer_url: null })
      .eq("documentary_slug", slug);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }

  return NextResponse.json({ trailer: "ready" });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { slug } = await context.params;
  const auth = await requireFilmOwner(request, slug);
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from("film_trailers")
    .select("*")
    .eq("documentary_slug", slug)
    .maybeSingle();
  if (error) {
    console.warn("GET /api/films/[slug]/trailer:", error.message);
    return NextResponse.json(
      { error: "Statussen kunne ikke hentes" },
      { status: 500 },
    );
  }
  return NextResponse.json({ trailer: data ?? null });
}

/**
 * DELETE: fjern trailer-RÆKKEN og dens storage-objekt. Rækken har
 * on delete cascade via filmen — men kladsletning skal kunne rydde
 * objektet FØR filmrækken forsvinder (film-videos' delete-policy
 * kræver at objektet stadig er læsbart = select-policynet).
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const { slug } = await context.params;
  const auth = await requireFilmOwner(request, slug);
  if (!auth.ok) return auth.response;

  const { supabase } = auth;
  const { data: row } = await supabase
    .from("film_trailers")
    .select("trailer_url")
    .eq("documentary_slug", slug)
    .maybeSingle();

  if (row?.trailer_url) {
    // Der afledes sti af URL'en i stedet for at regne den ud igen —
    // samme hjælper som kladsletningen bruger.
    const storagePath = publicUrlToStoragePath(row.trailer_url);
    if (storagePath) {
      await supabase.storage.from(FILM_VIDEOS_BUCKET).remove([storagePath]);
    }
  }

  const { error } = await supabase
    .from("film_trailers")
    .delete()
    .eq("documentary_slug", slug);
  if (error) {
    console.warn("DELETE /api/films/[slug]/trailer:", error.message);
    return NextResponse.json(
      { error: "Traileren kunne ikke slettes" },
      { status: 500 },
    );
  }
  return NextResponse.json({ trailer: null });
}