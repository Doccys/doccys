import { NextRequest, NextResponse } from "next/server";
import { doccysStore } from "@/lib/store/supabaseStore";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/creator-posts?creatorId=... — alle opslag for én creator
 * (pinned først, derefter nyeste først).
 * POST /api/creator-posts — opretter et opslag på egen profil.
 *
 * Opslag kan KUN skrives af kontoen bag creatorens owner_user_id.
 * Ruten validerer input (længde, login) — ejerskabet håndhæves af
 * RLS som anden forsvarslinje: en insert med en fremmed creator_id
 * afvises af databasen, og fejlen oversættes her til 403.
 */
export async function GET(request: NextRequest) {
  const creatorId = new URL(request.url).searchParams.get("creatorId");
  if (!creatorId) {
    return NextResponse.json({ error: "creatorId er påkrævet" }, { status: 400 });
  }
  return NextResponse.json({
    posts: await doccysStore.listCreatorPosts(creatorId),
  });
}

export async function POST(request: NextRequest) {
  let body: { creatorId?: string; body?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON-body" }, { status: 400 });
  }

  const { creatorId, body: text } = body;
  const trimmedBody = text?.trim() ?? "";
  if (!creatorId || !trimmedBody) {
    return NextResponse.json(
      { error: "creatorId og body er påkrævede" },
      { status: 400 },
    );
  }
  if (trimmedBody.length > 2000) {
    return NextResponse.json(
      { error: "Opslaget er for langt (max 2000 tegn)" },
      { status: 400 },
    );
  }

  // Opslag kræver en logget-ind konto — identiteten er server-side autoritet.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Log ind for at skrive opslag" },
      { status: 401 },
    );
  }

  try {
    const post = await doccysStore.addCreatorPost({
      creatorId,
      body: trimmedBody,
    });
    return NextResponse.json({ post }, { status: 201 });
  } catch (err) {
    // RLS afviste skrivningen (kontoen ejer ikke denne creator-profil)
    console.error("addCreatorPost:", err);
    return NextResponse.json(
      { error: "Du ejer ikke denne skaber-profil" },
      { status: 403 },
    );
  }
}