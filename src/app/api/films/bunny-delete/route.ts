import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasBunnyEnv } from "@/lib/bunny/config";
import { deleteBunnyVideo, getBunnyVideo } from "@/lib/bunny/stream";

export const dynamic = "force-dynamic";

/**
 * POST /api/films/bunny-delete?id={guid} — sletter et Bunny-video-
 * objekt, EJER-tjekket er bibliotekets titel ("doccys:{user.id}"):
 * bruges af uploadformens fejl-vej (forladte opload uden DB-række)
 * og af StudioDeleteFilmButton (kladsletningen) — begge gange
 * best-effort en sletning, da Bunny-videoen ikke må hænge løst i
 * biblioteket når rækken (eller kladden) er væk.
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

  const guid = request.nextUrl.searchParams.get("id");
  if (!guid || !/^[0-9a-f-]{36}$/i.test(guid)) {
    return NextResponse.json({ error: "Ugyldigt video-id" }, { status: 400 });
  }

  try {
    const video = await getBunnyVideo(guid);
    if (!video) {
      // Allerede væk = OK (idempotent oprydning)
      return NextResponse.json({ slettet: true }, { status: 200 });
    }
    if (video.title !== `doccys:${user.id}`) {
      return NextResponse.json(
        { error: "Videoen hører ikke til din konto" },
        { status: 403 },
      );
    }
    await deleteBunnyVideo(guid);
    return NextResponse.json({ slettet: true }, { status: 200 });
  } catch (err) {
    console.error("bunny-delete fejlede:", err);
    return NextResponse.json(
      { error: "Sletning kunne ikke gennemføres — prøv igen" },
      { status: 500 },
    );
  }
}
