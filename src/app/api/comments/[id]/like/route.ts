import { NextRequest, NextResponse } from "next/server";
import { doccysStore } from "@/lib/store/supabaseStore";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/comments/[id]/like — liker kommentaren.
 * DELETE /api/comments/[id]/like — fjerner liket igen.
 *
 * Likes kræver en logget-in konto: bruger-id'et tages ALTID fra
 * sessionen i requestens cookies og kan ikke opgives fra klienten.
 * RLS + den sammensatte primærnøgle (comment_id, user_id) gør én
 * like pr. konto pr. kommentar til en databasestyring.
 */
async function handleLike(commentId: string, liked: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Log ind for at like kommentarer" },
      { status: 401 },
    );
  }

  try {
    const comment = await doccysStore.setCommentLike({
      commentId,
      userId: user.id,
      liked,
    });
    if (!comment) {
      return NextResponse.json(
        { error: "Kommentaren findes ikke" },
        { status: 404 },
      );
    }
    return NextResponse.json({ comment });
  } catch {
    return NextResponse.json(
      { error: "Liket kunne ikke registreres" },
      { status: 500 },
    );
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handleLike(id, true);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handleLike(id, false);
}