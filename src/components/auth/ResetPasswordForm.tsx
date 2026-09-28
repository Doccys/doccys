"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import PasswordInput from "./PasswordInput";

type Phase = "request" | "sent" | "new" | "done";

/**
 * Maps a supabase-js auth error code to a key in the `auth.errors`
 * translation namespace — falls back to the generic message.
 */
const ERROR_KEYS: Record<string, string> = {
  weak_password: "weakPassword",
};

/**
 * Password recovery in one minimalist card (same visual language as
 * AuthForm). The card has two faces and flips automatically:
 *
 * - No session → "request" form: POST /api/auth/reset — appen sender selv
 *   mailen (nodemailer, brugerens gemte sprog fra signup) og svarer altid
 *   ok, uanset om e-mailen findes (ingen konto-afsløring).
 * - Recovery link followed → the URL carries `?token_hash=` (appens egne
 *   mails; ældre Supabase-mails bar `?code=` — begge grene håndteres),
 *   the browser client exchanges it for a recovery session and fires
 *   `PASSWORD_RECOVERY` — then the "choose new password" form is shown
 *   and saved with `updateUser`.
 *
 * A logged-in user visiting the page directly also gets the "new
 * password" form (their session counts as recovery access).
 */
export default function ResetPasswordForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const locale = useLocale();

  const [phase, setPhase] = useState<Phase>("request");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Dev/strict mode kalder effekten to gange — ref-vagten sikrer, at
  // token-vekslingen kun sættes i gang én gang (et andet kald ville
  // ramme otp_expired og fejl-flimre). Se ConfirmEmailClient.
  const startedRef = useRef(false);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    // E-mail-linket udveksles normalt af browser-klienten selv ved indlæsning
    // (detectSessionInUrl) — PASSWORD_RECOVERY-hændelsen fanger det. Som
    // fallback udveksler vi koden selv, hvis der endnu ingen session er.
    const params = new URLSearchParams(window.location.search);
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setPhase("new");
    });

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        if (active) setPhase("new");
        return;
      }
      if (startedRef.current) return;
      startedRef.current = true;
      if (params.has("code")) {
        // Ældre Supabase-mails: PKCE-?code= veksles fra samme browser.
        const { error } = await supabase.auth.exchangeCodeForSession(
          window.location.href,
        );
        if (!error) setPhase("new");
        return;
      }
      // Appens egne mails: engangs-token fra generateLink — verifyOtp
      // udsteder recovery-sessionen, og PASSWORD_RECOVERY-hændelsen
      // (lytteren ovenfor) flipper kortet; setPhase er dobbeltforsvar.
      const tokenHash = params.get("token_hash");
      if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: "recovery",
        });
        if (!error) setPhase("new");
      }
    })();

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleError = (code: string | undefined) => {
    setErrorKey(code && ERROR_KEYS[code] ? ERROR_KEYS[code] : "generic");
  };

  const requestReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setErrorKey(null);

    try {
      // Appen sender selv mailen (nodemailer, brugerens sprog — ruten
      // læser locale-metadata fra signup). Uanset om e-mailen findes
      // vises samme besked — ingen konto-afsløring; ruten svarer altid ok
      // undtagen ved rate-limit/teknisk fejl.
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), locale }),
      });
      if (res.ok) {
        setPhase("sent");
      } else {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setErrorKey(data?.error === "rateLimited" ? "rateLimited" : "generic");
      }
    } catch {
      setErrorKey("generic");
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorKey(null);
    if (password !== confirm) {
      setErrorKey("passwordMismatch");
      return;
    }

    setBusy(true);
    const supabase = createClient();
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        handleError(error.code);
      } else {
        setPhase("done");
      }
    } catch {
      setErrorKey("generic");
    } finally {
      setBusy(false);
    }
  };

  const goToProfile = () => {
    // refresh() lets server components re-read the session cookies.
    router.replace("/profile");
    router.refresh();
  };

  const inputClassName =
    "mt-2 w-full rounded-lg border border-smoke bg-noir px-4 py-2.5 text-sm text-bone placeholder:text-ash/50 transition-colors focus:border-champagne/60 focus:outline-none";

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-xl border border-smoke bg-onyx p-8 sm:p-10">
        <h1 className="text-center font-display text-3xl text-bone">
          {phase === "request" || phase === "sent"
            ? t("resetTitle")
            : t("newPasswordTitle")}
        </h1>
        <p className="mt-2 text-center text-sm text-ash">
          {phase === "request" || phase === "sent"
            ? t("resetSubtitle")
            : t("newPasswordSubtitle")}
        </p>

        {phase === "request" && (
          <form onSubmit={requestReset} className="mt-8 space-y-5">
            <div>
              <label
                htmlFor="email"
                className="text-xs uppercase tracking-widest text-ash"
              >
                {t("email")}
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("emailPlaceholder")}
                className={inputClassName}
              />
            </div>

            {errorKey && (
              <p className="text-sm text-red-400">
                {t(`errors.${errorKey}`)}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full bg-champagne px-6 py-2.5 text-xs font-medium tracking-wide text-noir transition-colors hover:bg-bone disabled:opacity-50"
            >
              {busy ? t("working") : t("resetSend")}
            </button>
          </form>
        )}

        {phase === "sent" && (
          <p className="mt-8 rounded-lg border border-champagne/30 bg-noir px-4 py-3 text-sm leading-relaxed text-champagne">
            {t("resetSent")}
          </p>
        )}

        {phase === "new" && (
          <form onSubmit={savePassword} className="mt-8 space-y-5">
            <div>
              <label
                htmlFor="new-password"
                className="text-xs uppercase tracking-widest text-ash"
              >
                {t("newPassword")}
              </label>
              <PasswordInput
                id="new-password"
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
              />
            </div>

            <div>
              <label
                htmlFor="confirm-password"
                className="text-xs uppercase tracking-widest text-ash"
              >
                {t("newPasswordConfirm")}
              </label>
              <PasswordInput
                id="confirm-password"
                value={confirm}
                onChange={setConfirm}
                autoComplete="new-password"
              />
            </div>

            {errorKey && (
              <p className="text-sm text-red-400">
                {t(`errors.${errorKey}`)}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full bg-champagne px-6 py-2.5 text-xs font-medium tracking-wide text-noir transition-colors hover:bg-bone disabled:opacity-50"
            >
              {busy ? t("working") : t("newPasswordTitle")}
            </button>
          </form>
        )}

        {phase === "done" && (
          <div className="mt-8 space-y-6">
            <p className="rounded-lg border border-champagne/30 bg-noir px-4 py-3 text-sm leading-relaxed text-champagne">
              {t("passwordUpdated")}
            </p>
            <button
              type="button"
              onClick={goToProfile}
              className="w-full rounded-full bg-champagne px-6 py-2.5 text-xs font-medium tracking-wide text-noir transition-colors hover:bg-bone"
            >
              {t("goToProfile")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}