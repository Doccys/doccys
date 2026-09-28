"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

type Phase = "working" | "error";

/**
 * Landingskort for bekræftelses-linket i signup-mailen.
 *
 * Appens egne mails peger på /auth/confirm?token_hash=…, som veksles
 * via verifyOtp (ældre Supabase-mails bar PKCE-?code=, der veksles
 * med exchangeCodeForSession — grenen er beholdt) — og brugeren
 * sendes derefter videre til profilen.
 * Det SKAL ske på en dedikeret klientside: landede linket direkte på
 * /profile, server-renderede siden den logged-ud-variant uden nogen
 * Supabase-klient — og ?code= blev aldrig vekslet (brugeren ramte
 * login-tilstanden). Samme mekanik som ResetPasswordForm.
 *
 * Koden er enkelt-brug: et gen-klik (eller delt link) lander i
 * fejltilstanden med en vej til login.
 */
export default function ConfirmEmailClient() {
  const t = useTranslations("auth");
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("working");

  // Dev/strict mode kalder effekten to gange — et dobbelt kald ville
  // bruge tokenet to gange, og det andet rammer otp_expired. Ref-vagten
  // sikrer, at vekslingen kun sættes i gang én gang (et remount deler
  // refs, så vagten overlever; udførelsen kører altid færdig).
  const startedRef = useRef(false);

  useEffect(() => {
    const supabase = createClient();

    const goToProfile = () => {
      // refresh() lader server-komponenterne genlæse sessions-cookies.
      router.replace("/profile");
      router.refresh();
    };

    (async () => {
      // detectSessionInUrl (client-initialiseringen) når typisk at
      // veksle koden først — getSession afventer initialiseringen, så
      // dens resultat ses her. Ellers veksler vi selv som fallback.
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        goToProfile();
        return;
      }
      if (startedRef.current) return;
      startedRef.current = true;

      const params = new URLSearchParams(window.location.search);
      if (params.has("code")) {
        // Ældre Supabase-mails: PKCE-?code= veksles fra samme browser
        // (verifier-cookien fra signup-kørslen bor dér).
        const { error } = await supabase.auth.exchangeCodeForSession(
          window.location.href,
        );
        if (error) setPhase("error");
        else goToProfile();
        return;
      }
      const tokenHash = params.get("token_hash");
      const type = params.get("type");
      if (tokenHash && type === "signup") {
        // Appens egne mails: engangs-token fra generateLink — verifyOtp
        // bekræfter e-mailen og udsteder sessionen i ét kald.
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: "signup",
        });
        if (error) setPhase("error");
        else goToProfile();
        return;
      }
      // Hverken token eller kode (fx et recovery-token, der er landet
      // på forkert side) — vis fejl-tilstanden med vej til login.
      setPhase("error");
    })();
  }, [router]);

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-xl border border-smoke bg-onyx p-8 sm:p-10">
        <h1 className="text-center font-display text-3xl text-bone">
          {t("confirmTitle")}
        </h1>

        {phase === "working" ? (
          <p className="mt-2 text-center text-sm text-ash">
            {t("confirmWorking")}
          </p>
        ) : (
          <div className="mt-8 space-y-6">
            <p className="rounded-lg border border-champagne/30 bg-noir px-4 py-3 text-sm leading-relaxed text-champagne">
              {t("confirmError")}
            </p>
            <Link
              href="/login"
              className="block w-full rounded-full bg-champagne px-6 py-2.5 text-center text-xs font-medium tracking-wide text-noir transition-colors hover:bg-bone"
            >
              {t("login")}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}