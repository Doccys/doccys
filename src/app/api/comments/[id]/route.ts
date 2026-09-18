import { NextRequest, NextResponse } from "next/server";
import { doccysStore } from "@/lib/store/supabaseStore";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/comments/[id] — fastgør eller frigør kommentaren (feltet
 * `pinned`). Kun filmens creator-ejer kan det.
 * DELETE /api/comments/[id] — sletter kommentaren. Samme ejerskab.
 *
 * Ejerskab håndhæves af RLS som anden forsvarslinje: ruten validerer
 * input og kræver login, men update/delete på en fremmed films
 * kommentar rammer ingen rækker (RLS skjuler dem) → 404. DB-triggeren
 * trg_comment_pin_kun sikrer desuden, at ordlyden aldrig kan ændres.
 */
type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  let body: { pinned?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON-body" }, { status: 400 });
  }

  if (typeof body.pinned !== "boolean") {
    return NextResponse.json(
      { error: "Angiv pinned (true/false)" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Log ind for at moderere kommentarer" },
      { status: 401 },
    );
  }

  try {
    const comment = await doccysStore.pinComment({
      commentId: id,
      pinned: body.pinned,
    });
    if (comment === "konflikt") {
      return NextResponse.json(
        { error: "Et andet indlæg er allerede fastgjort — prøv igen" },
        { status: 409 },
      );
    }
    if (!comment) {
      return NextResponse.json({ error: "Kommentaren findes ikke" }, { status: 404 });
    }
    return NextResponse.json({ comment });
  } catch (err) {
    console.error("pinComment:", err);
    return NextResponse.json(
      { error: "Kommentaren kunne ikke fastgøres. Prøv igen." },
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
      { error: "Log ind for at moderere kommentarer" },
      { status: 401 },
    );
  }

  const ok = await doccysStore.deleteComment(id);
  if (!ok) {
    return NextResponse.json({ error: "Kommentaren findes ikke" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}