import { NextRequest, NextResponse } from "next/server";
import { doccysStore } from "@/lib/store/supabaseStore";
import type { PlaybackEvent, PlaybackEventType } from "@/lib/types";

const VALID_EVENT_TYPES: PlaybackEventType[] = [
  "session_start",
  "play",
  "pause",
  "seek",
  "heartbeat",
  "complete",
  "session_end",
  "error",
];

/**
 * POST /api/views/sessions/[id]/events — append rå hændelser til sessionens log.
 *
 * Hændelserne er append-only og bliver aldrig redigeret eller sorteret om:
 * dette er den strukturerede rådata, som fremtidig ML trænes direkte på.
 * Klienten sender i batches (typisk pr. hjerteslag) eller via
 * navigator.sendBeacon ved side-lukning.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: { events?: PlaybackEvent[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON-body" }, { status: 400 });
  }

  const incoming = Array.isArray(body.events) ? body.events : [];
  if (incoming.length === 0) {
    return NextResponse.json({ error: "Ingen hændelser sendt" }, { status: 400 });
  }

  // Grundlæggende skema-tjek: hændelser uden gyldig type/tidsstempel kasseres.
  const accepted = incoming.filter(
    (e): e is PlaybackEvent =>
      e !== null &&
      typeof e === "object" &&
      typeof e.type === "string" &&
      VALID_EVENT_TYPES.includes(e.type as PlaybackEventType) &&
      typeof e.clientTimestamp === "number" &&
      typeof e.videoTimeSec === "number",
  );

  const stored = await doccysStore.appendEvents(id, accepted);
  if (stored === 0) {
    return NextResponse.json({ error: "Session ikke fundet" }, { status: 404 });
  }

  return NextResponse.json({ accepted: stored, rejected: incoming.length - stored });
}