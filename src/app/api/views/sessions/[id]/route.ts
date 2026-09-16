import { NextRequest, NextResponse } from "next/server";
import { doccysStore } from "@/lib/store/supabaseStore";

/**
 * GET /api/views/sessions/[id] — henter en session med dens rålog
 * og evt. afgivet anti-fraud-dom. Bruges bl.a. til fejlfinding og
 * til at inspicere, hvad en fremtidig model skal trænes på.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await doccysStore.getSession(id);
  if (!session) {
    return NextResponse.json({ error: "Session ikke fundet" }, { status: 404 });
  }
  return NextResponse.json({ session });
}