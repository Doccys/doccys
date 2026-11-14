import { NextRequest, NextResponse } from "next/server";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createClient } from "@/lib/supabase/server";
import {
  bunnyDirectPlayUrl,
  FILM_VIDEOS_BUCKET,
  publicUrlToStoragePath,
} from "@/lib/storage/filmVideos";
import { downloadVideoToDisk } from "@/lib/subtitles/transcribe";
import { extractTrailerClip } from "@/lib/trailer/clip";
import {
  bunnyGuidFromUrl,
  createBunnyVideo,
  deleteBunnyVideo,
  getBunnyVideo,
  pickMp4Resolution,
  uploadBunnyBytes,
  waitForBunnyEncode,
} from "@/lib/bunny/stream";

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

interface RequireOwner {
  ok: true;
  supabase: SessionClient;
  userId: string;
  videoUrl: string;
  bunnyVideoId: string | null;
  durationSec: number;
}

async function requireFilmOwner(
  request: NextRequest,
  slug: string,
): Promise<
  | { ok: false; response: NextResponse }
  | RequireOwner
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
    .select("creator_handle, video_url, video_file_size_bytes, duration_sec, bunny_video_id")
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
    bunnyVideoId: film.bunny_video_id,
    durationSec: film.duration_sec,
  };
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { slug } = await context.params;
  const auth = await requireFilmOwner(request, slug);
  if (!auth.ok) return auth.response;
  const { supabase, userId, videoUrl, bunnyVideoId, durationSec } = auth;

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

  const workDir = await mkdtemp(path.join(tmpdir(), "doccys-trailer-"));
  let trailerBunnyGuid: string | null = null;
  try {
    const videoPath = path.join(workDir, "film.mp4");
    const trailerPath = path.join(workDir, "trailer.mp4");
    await downloadVideoToDisk(videoUrl, videoPath);
    await extractTrailerClip(videoPath, trailerPath, startSec, lengthSec);

    if (bunnyVideoId) {
      // Bunny-filmen (9/11): klippet oprettes som EGET Bunny-videoobjekt
      // (titel er ejer-bundet til kontoen = slette-fremgås via title), i
      // PUT-upload (verificeret 200 — samme mønster som e2e-testen),
      // og playback-URL'en afledes af den encodet opløsning.
      trailerBunnyGuid = await createBunnyVideo(`doccys:${userId}`);
      const trailerBytes = await readFile(trailerPath);
      await uploadBunnyBytes(trailerBunnyGuid, trailerBytes);
      const encode = await waitForBunnyEncode(trailerBunnyGuid);
      if (encode !== "ready") {
        throw new Error("Encode af trailer i video-CDN afvist eller timeout");
      }
      const video = await getBunnyVideo(trailerBunnyGuid);
      // Race (14/11, samme som films-rutens): Bunny kan flippe status 3
      // FOER availableResolutions fylder — vent op til ~30 s i 3-s
      // runder foer afvisning.
      let oplosning = pickMp4Resolution(video?.availableResolutions ?? null);
      for (let wait = 0; !oplosning && wait < 10; wait++) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const senere = await getBunnyVideo(trailerBunnyGuid);
        if (!senere) break;
        oplosning = pickMp4Resolution(senere.availableResolutions);
      }
      if (!oplosning) {
        throw new Error("Ingen encodet opløsning i video-CDN efter encode");
      }
      await supabase
        .from("film_trailers")
        .update({
          status: "ready",
          trailer_url: bunnyDirectPlayUrl(trailerBunnyGuid, oplosning),
          bunny_video_id: trailerBunnyGuid,
          error: null,
        })
        .eq("documentary_slug", slug);
    } else {
      // Legacy (seed/ældre kladder i Supabase): upload til film-videos —
      // Buffer-upload med contentType: virker modsat File-objekter,
      // hvor Supabase ignorerer contentType (dokumenteret gotcha).
      const objectPath = `${userId}/${slug}-trailer.mp4`;
      const trailerBytes = await readFile(trailerPath);
      const { error: uploadError } = await supabase.storage
        .from(FILM_VIDEOS_BUCKET)
        .upload(objectPath, trailerBytes, {
          upsert: true,
          contentType: "video/mp4",
        });
      if (uploadError) {
        throw new Error(
          `Traileren kunne ikke uploades: ${uploadError.message}`,
        );
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
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`trailer ${slug}:`, message);
    // Forladt Bunny-objekt ryddes bedste-indsats (titlerbunden delete)
    if (trailerBunnyGuid) {
      await deleteBunnyVideo(trailerBunnyGuid).catch(() => undefined);
    }
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
    .select("trailer_url, bunny_video_id")
    .eq("documentary_slug", slug)
    .maybeSingle();

  if (row?.trailer_url) {
    // Bunny-trailere slettes via Video-API'en (guid afledes af URL'en);
    // legacy Storage-trailere via storage-stien — samme hjælper som
    // kladsletningen bruger.
    const bunnyGuid = row.bunny_video_id ?? bunnyGuidFromUrl(row.trailer_url);
    if (bunnyGuid) {
      await deleteBunnyVideo(bunnyGuid).catch(() => undefined);
    } else {
      const storagePath = publicUrlToStoragePath(row.trailer_url);
      if (storagePath) {
        await supabase.storage.from(FILM_VIDEOS_BUCKET).remove([storagePath]);
      }
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