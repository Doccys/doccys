import { NextRequest, NextResponse } from "next/server";
import { doccysStore } from "@/lib/store/supabaseStore";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/creator-posts/[id] — redigerer teksten og/eller fastgør
 * eller frigør opslaget (feltet `pinned`).
 * DELETE /api/creator-posts/[id] — sletter opslaget.
 *
 * Ejerskab håndhæves af RLS som anden forsvarslinje: ruten validerer
 * input og kræver login, men en update/delete på en fremmed creators
 * opslag rammer ingen rækker (RLS skjuler dem) → 404.
 */
type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  let body: { body?: string; pinned?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON-body" }, { status: 400 });
  }

  const trimmedBody = body.body?.trim();
  if (trimmedBody !== undefined && trimmedBody.length === 0) {
    return NextResponse.json({ error: "Opslaget må ikke være tomt" }, { status: 400 });
  }
  if (trimmedBody !== undefined && trimmedBody.length > 2000) {
    return NextResponse.json(
      { error: "Opslaget er for langt (max 2000 tegn)" },
      { status: 400 },
    );
  }
  if (trimmedBody === undefined && body.pinned === undefined) {
    return NextResponse.json(
      { error: "Intet at opdatere — angiv body eller pinned" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Log ind for at redigere opslag" },
      { status: 401 },
    );
  }

  try {
    const post = await doccysStore.updateCreatorPost({
      postId: id,
      body: trimmedBody === undefined ? undefined : trimmedBody,
      pinned: body.pinned,
    });
    if (post === "konflikt") {
      return NextResponse.json(
        { error: "Et andet opslag er allerede fastgjort — prøv igen" },
        { status: 409 },
      );
    }
    if (!post) {
      return NextResponse.json({ error: "Opslaget findes ikke" }, { status: 404 });
    }
    return NextResponse.json({ post });
  } catch (err) {
    console.error("updateCreatorPost:", err);
    return NextResponse.json(
      { error: "Opslaget kunne ikke gemmes. Prøv igen." },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Log ind for at slette opslag" },
      { status: 401 },
    );
  }

  const ok = await doccysStore.deleteCreatorPost(id);
  if (!ok) {
    return NextResponse.json({ error: "Opslaget findes ikke" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}