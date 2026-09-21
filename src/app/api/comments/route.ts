import { NextRequest, NextResponse } from "next/server";
import { doccysStore } from "@/lib/store/supabaseStore";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/comments?slug=... — henter diskussionen under én dokumentar.
 * POST /api/comments — opretter en kommentar.
 *
 * Forfatter-identiteten afgøres server-side ud fra Supabase-sessionen i
 * requestens cookies: e-mail (eller gemte fulde navn) og bruger-id kan
 * ikke opgives fra klienten. Gæster kan ikke kommentere — felterne er
 * kun for folk der HAR SET filmen (se POST nedenfor).
 *
 * GET-svaret bærer desuden `viewer.canComment`: serverens afgørelse af
 * hvorvidt DENNE seer må skrive (logget ind + har_set_film-RPC'en, som
 * læser den append-only credit_ledger og ikke kan forfalskes).
 * Like-identiteten (likedByMe) afgøres samme sted.
 */
export async function GET(request: NextRequest) {
  const slug = new URL(request.url).searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "slug er påkrævet" }, { status: 400 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Må seeren skrive? Kun kendte konti, der har set filmen.
  let canComment = false;
  if (user) {
    const { data: hasWatched, error: watchError } = await supabase.rpc(
      "har_set_film",
      { p_slug: slug },
    );
    if (watchError) {
      console.warn("har_set_film:", watchError.message);
    } else {
      canComment = Boolean(hasWatched);
    }
  }

  return NextResponse.json({
    comments: await doccysStore.listComments(slug, user?.id ?? null),
    viewer: { canComment },
  });
}

export async function POST(request: NextRequest) {
  let body: {
    documentarySlug?: string;
    body?: string;
    parentId?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON-body" }, { status: 400 });
  }

  const { documentarySlug, body: text, parentId } = body;
  const trimmedBody = text?.trim() ?? "";

  if (!documentarySlug || !trimmedBody) {
    return NextResponse.json(
      { error: "documentarySlug og body er påkrævede" },
      { status: 400 },
    );
  }
  if (trimmedBody.length > 2000) {
    return NextResponse.json({ error: "Kommentaren er for lang (max 2000 tegn)" }, { status: 400 });
  }

  // Svar-tråde (maks ét niveau): forælderen skal findes i SAMME film
  // og selv være et topindlæg — ellers var det et svar på et svar.
  // DB-triggeren vagter det samme (PostgREST er direkte nåbar), her
  // gives bare pæne fejl i stedet for rå trigger-tekst.
  if (parentId != null && parentId !== "") {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parentId)) {
      return NextResponse.json(
        { error: "parentId er ikke et gyldigt id" },
        { status: 400 },
      );
    }
    const parent = await doccysStore.getCommentById(parentId);
    if (!parent) {
      return NextResponse.json(
        { error: "Indlægget du svarer på, findes ikke" },
        { status: 404 },
      );
    }
    if (parent.documentarySlug !== documentarySlug) {
      return NextResponse.json(
        { error: "Svar skal tilhøre samme film som indlægget" },
        { status: 400 },
      );
    }
    if (parent.parentId) {
      return NextResponse.json(
        { error: "Svar på svar er ikke tilladt — maks ét niveau" },
        { status: 400 },
      );
    }
  }

  // Sessionen læses fra cookies — serveren er eneste autoritet for
  // identiteten. Gæstekommentarer er lukket (DB'en håndhæver det også).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Log ind for at kommentere" },
      { status: 401 },
    );
  }

  // Kvalitetsfilteret: kun seere må kommentere. Tjekket går mod den
  // append-only credit_ledger (har_set_film-RPC'en) — forbruget kan
  // ikke forfalskes af klienten.
  const { data: hasWatched, error: watchError } = await supabase.rpc(
    "har_set_film",
    { p_slug: documentarySlug },
  );
  if (watchError) {
    console.warn("har_set_film:", watchError.message);
    return NextResponse.json(
      { error: "Kommentaren kunne ikke sendes. Prøv igen." },
      { status: 500 },
    );
  }
  if (!hasWatched) {
    return NextResponse.json(
      { error: "Se filmen først — kommentarfeltet er kun for seere" },
      { status: 403 },
    );
  }

  const authorName =
    (user.user_metadata?.full_name as string | undefined) ?? user.email ?? "";

  const comment = await doccysStore.addComment({
    documentarySlug,
    authorName,
    userId: user.id,
    body: trimmedBody,
    parentId: parentId && parentId !== "" ? parentId : null,
  });

  return NextResponse.json({ comment }, { status: 201 });
}