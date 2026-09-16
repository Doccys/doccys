import { NextRequest, NextResponse } from "next/server";
import { doccysStore } from "@/lib/store/supabaseStore";
import { getDocumentaryBySlug, recordValidCompletion } from "@/lib/data/catalog";
import { validateSession } from "@/lib/analytics/viewValidation";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/views/sessions/[id]/validate — kør anti-fraud-validering.
 *
 * Kaldes af klienten, når filmen er færdigset (og kan senere også
 * kaldes asynkront af et job, når en ML-model skal revurdere domme).
 * Kun dommet "valid" tæller som en betalbar completion i
 * pay-per-completion-modellen — og kun validerte completions skrives
 * til den loggede brugers watch_history i databasen.
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

  const documentary = await getDocumentaryBySlug(session.documentarySlug);
  const verdict = validateSession(session, documentary?.durationSec ?? 0);

  await doccysStore.setVerdict(id, verdict);
  await doccysStore.finishSession(id, "completed");

  if (verdict.verdict === "valid") {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await recordValidCompletion(user.id, session.documentarySlug);
    }
  }

  return NextResponse.json(verdict);
}