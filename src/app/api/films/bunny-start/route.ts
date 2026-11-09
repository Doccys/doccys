import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasBunnyEnv, getBunnyEnv, TUS_SIGNATURE_TTL_SEC } from "@/lib/bunny/config";
import { createBunnyVideo, tusSignature } from "@/lib/bunny/stream";

export const dynamic = "force-dynamic";

/**
 * POST /api/films/bunny-start — forbereder en Bunny-upload:
 *
 * 1) authet skaber-session (som POST /api/films' ejer-gate)
 * 2) opretter et Bunny-video-objekt med EJERSKABS-token som titel
 *    ("doccys:{user.id}") — POST /api/films validerer senere, at
 *    det guid, der angives som bunnyVideoId, er dette brugers
 *    (et andet users upload kan ellers hærges — guid er trods alt
 *    offentlig i en publiceret films video_url)
 * 3) returnerer { videoId, tusSignature, tusExpire, libraryId } —
 *    klienten uploader dernæst DIREKTE til video.bunnycdn.com/tusupload
 *    (TUS-resumable; Vercel's 4,5 MB request-body-grænse forbyder
 *    server-gennemstrømning af 2 GB-filer).
 */

export async function POST(request: NextRequest) {
  if (!hasBunnyEnv()) {
    return NextResponse.json(
      { error: "Bunny Stream er ikke konfigureret" },
      { status: 503 },
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

  try {
    const env = getBunnyEnv();
    const guid = await createBunnyVideo(`doccys:${user.id}`);
    const tusExpire = Math.floor(Date.now() / 1000) + TUS_SIGNATURE_TTL_SEC;
    const signature = tusSignature(guid, tusExpire);
    return NextResponse.json(
      {
        videoId: guid,
        tusSignature: signature,
        tusExpire,
        libraryId: env.libraryId,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("bunny-start fejlede:", err);
    return NextResponse.json(
      { error: "Videoen kunne ikke forberedes i video-CDN — prøv igen" },
      { status: 500 },
    );
  }
}
