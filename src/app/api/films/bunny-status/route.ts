import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasBunnyEnv } from "@/lib/bunny/config";
import { getBunnyVideo } from "@/lib/bunny/stream";

export const dynamic = "force-dynamic";

/**
 * GET /api/films/bunny-status?id={guid} — studiet poller encoding-
 * status mens Bunny klargør kladen (auth: skaber-session; guid-titlen
 * skal være brugerens "doccys:{user.id}" — samme afgrænsning som
 * POST /api/films' ejerskabsvalidering).
 */

export async function GET(request: NextRequest) {
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

  const guid = request.nextUrl.searchParams.get("id");
  if (!guid || !/^[0-9a-f-]{36}$/i.test(guid)) {
    return NextResponse.json({ error: "Ugyldigt video-id" }, { status: 400 });
  }

  try {
    const video = await getBunnyVideo(guid);
    if (!video) {
      return NextResponse.json(
        { error: "Videoen findes ikke i video-CDN" },
        { status: 404 },
      );
    }
    if (video.title !== `doccys:${user.id}`) {
      return NextResponse.json(
        { error: "Videoen hører ikke til din konto" },
        { status: 403 },
      );
    }

    return NextResponse.json(
      {
        status: video.status,
        encodeProgress: video.encodeProgress,
        // status 4 kan være Bunny's VFR-quirk MED fuld stige — poller-
        // klienten skelner på opløsningerne, ikke status alene (14/11)
        availableResolutions: video.availableResolutions,
        storageSize: video.storageSize,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("bunny-status fejlede:", err);
    return NextResponse.json(
      { error: "Status kunne ikke hentes — prøv igen" },
      { status: 500 },
    );
  }
}
