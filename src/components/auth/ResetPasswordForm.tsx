"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

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
 * - No session → "request" form: `resetPasswordForEmail` sends a recovery
 *   link whose target is this very page (the origin must be in the
 *   Supabase dashboard's redirect-URL allowlist).
 * - Recovery link followed → the URL carries `?code=`, the browser
 *   client exchanges it for a recovery session and fires
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

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    // E-mail-linket udveksles normalt af browser-klienten selv ved indlæsning
    // (detectSessionInUrl) — PASSWORD_RECOVERY-hændelsen fanger det. Som
    // fallback udveksler vi koden selv, hvis der endnu ingen session er.
    const hasCode = new URLSearchParams(window.location.search).has("code");
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (active && event === "PASSWORD_RECOVERY") setPhase("new");
    });

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        if (active) setPhase("new");
        return;
      }
      if (hasCode) {
        const { error } = await supabase.auth.exchangeCodeForSession(
          window.location.href,
        );
        if (active && !error) setPhase("new");
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

    const supabase = createClient();
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: `${window.location.origin}/${locale}/auth/reset` },
      );
      // Uanset om e-mailen findes vises samme besked — ingen konto-afsløring.
      if (error) {
        handleError(error.code);
      } else {
        setPhase("sent");
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
              <input
                id="new-password"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClassName}
              />
            </div>

            <div>
              <label
                htmlFor="confirm-password"
                className="text-xs uppercase tracking-widest text-ash"
              >
                {t("newPasswordConfirm")}
              </label>
              <input
                id="confirm-password"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
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