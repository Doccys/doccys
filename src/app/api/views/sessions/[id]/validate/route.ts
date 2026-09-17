import { NextRequest, NextResponse } from "next/server";
import { doccysStore } from "@/lib/store/supabaseStore";
import { getDocumentaryBySlug, recordValidCompletion } from "@/lib/data/catalog";
import { validateSession } from "@/lib/analytics/viewValidation";
import { createClient } from "@/lib/supabase/server";
import type { SessionVerdict } from "@/lib/types";

/**
 * POST /api/views/sessions/[id]/validate — kør anti-fraud-validering.
 *
 * Kaldes af klienten, når filmen er færdigset (handleEnded) og som
 * sendBeacon ved pagehide (tab lukket) — og kan senere også kaldes
 * asynkront af et job, når en ML-model skal revurdere domme.
 *
 * Tillidsmodel: dommet beregnes altid her server-side. For loggede
 * seere sker al forbrugsafregning i security definer-RPC'en
 * afregn_session (beregner sete sekunder i SQL, trækker saldoen,
 * skriver watched_seconds, flipper status) — ruten kan ikke selv
 * skrive i credit_ledger, og RPC'en er idempotent, så dobbelt-
 * validate (ended + beacon) er et no-op. Anonyme sessioner får
 * blot status som før. Idempotens-garden: en allerede afregnet
 * session returnerer blot sit eksisterende dom.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await doccysStore.getSession(id);
  if (!session) {
    return NextResponse.json({ error: "Session ikke fundet" }, { status: 404 });
  }

  // Idempotens: en afsluttet/afregnet session valideres ikke igen
  if (session.status !== "active") {
    const existing = session.verdict as SessionVerdict | null;
    return NextResponse.json(existing ?? { verdict: "invalid" });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const documentary = await getDocumentaryBySlug(session.documentarySlug);
  const verdict = validateSession(session, documentary?.durationSec ?? 0);
  await doccysStore.setVerdict(id, verdict);

  const hasCompleteEvent = session.events.some((e) => e.type === "complete");

  if (user && session.userId === user.id) {
    // Logget seer: afregn forbruget atomisk i RPC'en — den skriver
    // watched_seconds og sætter status completed/abandoned ud fra
    // om der er kommet et 'complete'-event
    const { error } = await supabase.rpc("afregn_session", {
      p_session_id: id,
    });
    if (error) {
      console.error("afregn_session fejlede:", error);
      // dommet er gemt — fald tilbage til den gamle manuelle afslutning,
      // så sessionen ikke hænger i 'active' (saldoen trækkes så aldrig)
      await doccysStore.finishSession(id, hasCompleteEvent ? "completed" : "abandoned");
    }
  } else {
    // Anonym seer: ingen saldo at afregne — status som før
    await doccysStore.finishSession(id, "completed");
  }

  if (verdict.verdict === "valid" && hasCompleteEvent) {
    if (user && session.userId === user.id) {
      await recordValidCompletion(user.id, session.documentarySlug);
    }
  }

  return NextResponse.json(verdict);
}