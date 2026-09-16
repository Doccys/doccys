import { NextRequest, NextResponse } from "next/server";
import { doccysStore } from "@/lib/store/supabaseStore";
import { getDocumentaryBySlug } from "@/lib/data/catalog";
import { createClient } from "@/lib/supabase/server";
import type { DeviceMetadata } from "@/lib/types";

/**
 * POST /api/views/sessions — starter en ny afspilningssession.
 *
 * Klienten sender enhedsmetadata ved start; herefter logges alle rå
 * hændelser mod /api/views/sessions/[id]/events. Når filmen er
 * færdigset, kalder klienten /api/views/sessions/[id]/validate.
 *
 * Er seeren logget ind, kobles bruger-id'et på sessionen server-side
 * (ud fra Supabase-cookies) — et userId fra klienten accepteres ikke,
 * så visninger ikke kan tilskrives en anden bruger.
 */
export async function POST(request: NextRequest) {
  let body: { documentarySlug?: string; device?: DeviceMetadata };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON-body" }, { status: 400 });
  }

  const { documentarySlug, device } = body;
  if (!documentarySlug || !device?.userAgent) {
    return NextResponse.json(
      { error: "documentarySlug og device.userAgent er påkrævede" },
      { status: 400 },
    );
  }

  const documentary = await getDocumentaryBySlug(documentarySlug);
  if (!documentary) {
    return NextResponse.json({ error: "Ukendt dokumentar" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const session = await doccysStore.createSession({
    documentarySlug,
    device,
    userId: user?.id ?? null,
  });

  return NextResponse.json(
    {
      sessionId: session.id,
      // intervallet klienten skal sende hjerteslag med (bliver brugt af feature-ekstraktionen)
      heartbeatIntervalSec: 10,
    },
    { status: 201 },
  );
}