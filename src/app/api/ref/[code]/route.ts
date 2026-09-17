import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Henvisningskoder: 8 tegn [a-z0-9] — matcher DB-check-constraintet */
const CODE_PATTERN = /^[a-z0-9]{8}$/;

/** Cookie-levetid: 30 dage — vinduet hvor et køb kan indfri en henvisning */
const REF_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

/**
 * GET /api/ref/[code] — et affiliate-besøg.
 *
 * Sætter doccys_ref-cookien (httpOnly, sameSite lax) hvis koden
 * findes, og redirecter altid til forsiden. Findes koden ikke,
 * sker redirecten uden cookie — stille og uden forskel i svartid,
 * så man ikke kan sondere for koders eksistens.
 * API-ruter er ikke omfattet af middleware-matcheren, så dette
 * er den eneste måde kodens besøg lander uden locale-prefiks.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const response = NextResponse.redirect(new URL("/", request.nextUrl.origin));

  if (!CODE_PATTERN.test(code)) {
    return response;
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("user_referral_codes")
    .select("user_id")
    .eq("code", code.toLowerCase())
    .maybeSingle();

  if (data) {
    response.cookies.set("doccys_ref", code.toLowerCase(), {
      maxAge: REF_COOKIE_MAX_AGE,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }

  return response;
}