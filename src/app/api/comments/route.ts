import { NextRequest, NextResponse } from "next/server";
import { doccysStore } from "@/lib/store/supabaseStore";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/comments?slug=... — henter diskussionen under én dokumentar.
 * POST /api/comments — opretter en kommentar.
 *
 * Forfatter-identiteten afgøres server-side ud fra Supabase-sessionen i
 * requestens cookies: er brugeren logget ind, bruges dennes e-mail (eller
 * gemte fulde navn) og bruger-id — et authorName fra klienten ignoreres
 * og kan ikke forfalskes. Er brugeren gæst, kræves stadig et frit navn.
 *
 * Likes kan kun afgives af loggede brugere; likedByMe i svaret afgøres
 * derfor ud fra sessionen på samme måde.
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
  return NextResponse.json({
    comments: await doccysStore.listComments(slug, user?.id ?? null),
  });
}

export async function POST(request: NextRequest) {
  let body: { documentarySlug?: string; authorName?: string; body?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON-body" }, { status: 400 });
  }

  const { documentarySlug, body: text } = body;
  const trimmedGuestName = body.authorName?.trim() ?? "";
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

  // Sessionen læses fra cookies — serveren er eneste autoritet for identiteten.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const authorName = user
    ? ((user.user_metadata?.full_name as string | undefined) ?? user.email ?? "")
    : trimmedGuestName;
  if (!authorName) {
    return NextResponse.json(
      { error: "authorName er påkrævet for gæster" },
      { status: 400 },
    );
  }

  const comment = await doccysStore.addComment({
    documentarySlug,
    authorName,
    userId: user?.id ?? null,
    body: trimmedBody,
  });

  return NextResponse.json({ comment }, { status: 201 });
}