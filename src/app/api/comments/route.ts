import { NextRequest, NextResponse } from "next/server";
import { doccysStore } from "@/lib/store/supabaseStore";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Er brugeren ejer af filmens skaber-profil? To-trins-læsning
 * (documentaries.creator_handle → creators.owner_user_id), begge
 * offentligt læselige — bruges til ejer-undtagelsen i comment-gaten
 * (svare + egne indlæg på egen film, brugerens beslutning 14/11).
 */
async function erFilmejer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  slug: string,
): Promise<boolean> {
  const { data: film } = await supabase
    .from("documentaries")
    .select("creator_handle")
    .eq("slug", slug)
    .maybeSingle();
  if (!film?.creator_handle) return false;
  const { data: owned } = await supabase
    .from("creators")
    .select("id")
    .eq("handle", film.creator_handle)
    .eq("owner_user_id", userId)
    .maybeSingle();
  return Boolean(owned);
}

/**
 * GET /api/comments?slug=... — henter diskussionen under én dokumentar.
 * POST /api/comments — opretter en kommentar.
 *
 * Forfatter-identiteten afgøres server-side ud fra Supabase-sessionen i
 * requestens cookies: brugernavnet (auth-metadata full_name) og
 * bruger-id kan ikke opgives fra klienten. Seer-gaten: felterne er kun
 * for folk der HAR SET filmen — FILS SKABER-EJER er undtagelsen (kan
 * kommentere og svare uden seertid).
 *
 * GET-svaret bærer desuden `viewer.canComment`: serverens afgørelse af
 * hvorvidt DENNE seer må skrive (logget ind + har_set_film-RPC'en, som
 * læser den append-only credit_ledger og ikke kan forfalskes — eller
 * ejerskab). Like-identiteten (likedByMe) afgøres samme sted.
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

  // Må seeren skrive? Kun kendte konti, der har set filmen — ELLER
  // filmens skaber-ejer (brugerens beslutning 14/11): ejeren har lavet
  // filmen og skal kunne svare i sin egen diskussion uden at have
  // "brugt" minutter på den. Gatten er uændret for ALLE andre.
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
    if (!canComment) {
      canComment = await erFilmejer(supabase, user.id, slug);
    }
  }

  const comments = await doccysStore.listComments(slug, user?.id ?? null);

  // Offentlig flair (backlog 13, beslutning 10/11): forfatterens grove
  // tier fra seer_flair-viewet (migration 20261110) — ÉN .in-læsning
  // for alle forfattere; læsefejl (viewet findes endnu ikke) = ingen
  // chips, aldrig fejlside. user_id følger med til klienten som i dag.
  const authorIds = [
    ...new Set(
      comments
        .map((c) => c.userId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const flair = new Map<string, number>();
  if (authorIds.length > 0) {
    const { data: flairRows } = await supabase
      .from("seer_flair")
      .select("user_id, tier")
      .in("user_id", authorIds);
    for (const row of flairRows ?? []) {
      flair.set(row.user_id, row.tier);
    }
  }

  return NextResponse.json({
    comments: comments.map((c) => ({
      ...c,
      authorTier:
        c.userId != null ? (flair.get(c.userId) ?? 0) : null,
    })),
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
  // ikke forfalskes af klienten. Filens skaber-ejer er undtagelsen
  // (brugerens beslutning 14/11): ejeren må kommentere OG svare —
  // i sin EGEN film, hvor alle andre indlæg allerede er gennem
  // seer-gaten, så ejerskabet aldrig åbner en støjflade.
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
  let permission = Boolean(hasWatched);
  if (!permission) {
    permission = await erFilmejer(supabase, user.id, documentarySlug);
  }
  if (!permission) {
    return NextResponse.json(
      { error: "Se filmen først — kommentarfeltet er kun for seere" },
      { status: 403 },
    );
  }

  // Navnet kommer altid fra brugerens metadata — aldrig fra klienten.
  // DB-triggeren saet_kommentar_navn() overskriver author_name alligevel
  // (uforfalskelig), men en pæn 422 her er venligere end en DB-fejl.
  const authorName = (user.user_metadata?.full_name as string | undefined)
    ?.trim();
  if (!authorName) {
    return NextResponse.json(
      { error: "Vælg dit brugernavn på din profil, før du kommenterer" },
      { status: 422 },
    );
  }

  const comment = await doccysStore.addComment({
    documentarySlug,
    authorName,
    userId: user.id,
    body: trimmedBody,
    parentId: parentId && parentId !== "" ? parentId : null,
  });

  return NextResponse.json({ comment }, { status: 201 });
}