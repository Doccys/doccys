"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup";

/**
 * Maps a supabase-js auth error code to a key in the `auth.errors`
 * translation namespace — falls back to the generic message.
 */
const ERROR_KEYS: Record<string, string> = {
  invalid_credentials: "invalidCredentials",
  user_already_exists: "emailExists",
  email_exists: "emailExists",
  email_not_confirmed: "emailNotConfirmed",
  weak_password: "weakPassword",
  validation_failed: "invalidCredentials",
};

/**
 * Login and registration in one minimalist card. A tab switcher flips
 * between the two modes; everything runs client-side against
 * `supabase.auth` via the browser client.
 *
 * - Login: signInWithPassword → on success go to the profile.
 * - Signup: signUp → if the project requires e-mail confirmation, show a
 *   notice instead of redirecting (the session is not issued until the
 *   address is confirmed).
 */
export default function AuthForm() {
  const t = useTranslations("auth");
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [showConfirmNotice, setShowConfirmNotice] = useState(false);
  const [busy, setBusy] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setErrorKey(null);
    setShowConfirmNotice(false);
  };

  const handleError = (code: string | undefined) => {
    setErrorKey(code && ERROR_KEYS[code] ? ERROR_KEYS[code] : "generic");
  };

  const goToProfile = () => {
    // refresh() lets server components re-read the session cookies.
    router.replace("/profile");
    router.refresh();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setErrorKey(null);
    setShowConfirmNotice(false);

    const supabase = createClient();
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          handleError(error.code);
        } else {
          goToProfile();
        }
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) {
          handleError(error.code);
        } else if (data.session) {
          // E-mail confirmation is disabled in the project — signed up and in.
          goToProfile();
        } else {
          // Confirmation required: the session is not issued yet.
          setShowConfirmNotice(true);
        }
      }
    } catch {
      setErrorKey("generic");
    } finally {
      setBusy(false);
    }
  };

  const inputClassName =
    "mt-2 w-full rounded-lg border border-smoke bg-noir px-4 py-2.5 text-sm text-bone placeholder:text-ash/50 transition-colors focus:border-champagne/60 focus:outline-none";

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-xl border border-smoke bg-onyx p-8 sm:p-10">
        <h1 className="text-center font-display text-3xl text-bone">
          {mode === "login" ? t("loginTitle") : t("signupTitle")}
        </h1>
        <p className="mt-2 text-center text-sm text-ash">
          {mode === "login" ? t("loginSubtitle") : t("signupSubtitle")}
        </p>

        <div
          role="tablist"
          className="mt-8 grid grid-cols-2 rounded-full border border-smoke bg-noir p-1"
        >
          {(["login", "signup"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={mode === tab}
              onClick={() => switchMode(tab)}
              className={`rounded-full py-1.5 text-xs tracking-wide transition-colors ${
                mode === tab
                  ? "bg-smoke text-champagne"
                  : "text-ash hover:text-bone"
              }`}
            >
              {tab === "login" ? t("login") : t("signup")}
            </button>
          ))}
        </div>

        {showConfirmNotice ? (
          <p className="mt-6 rounded-lg border border-champagne/30 bg-noir px-4 py-3 text-sm leading-relaxed text-champagne">
            {t("checkEmail")}
          </p>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-5">
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

            <div>
              <label
                htmlFor="password"
                className="text-xs uppercase tracking-widest text-ash"
              >
                {t("password")}
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
              {busy ? t("working") : mode === "login" ? t("login") : t("signup")}
            </button>
          </form>
        )}
      </div>

      <p className="mt-6 text-center text-xs text-ash">
        {mode === "login" ? t("noAccount") : t("hasAccount")}{" "}
        <button
          type="button"
          onClick={() => switchMode(mode === "login" ? "signup" : "login")}
          className="text-champagne underline-offset-4 transition-colors hover:text-bone hover:underline"
        >
          {mode === "login" ? t("signup") : t("login")}
        </button>
      </p>
    </div>
  );
}