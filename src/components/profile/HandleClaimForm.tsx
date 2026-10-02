"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import {
  HANDLE_MAX_LENGTH,
  normalizeHandle,
  probeHandleTakenClient,
  validateHandleSyntax,
} from "@/lib/handles";

/**
 * @ tag-claim-formularen på profilen — til konti uden et reserveret
 * tag (oprettet før signup-feltet kom til, eller som sprang feltet
 * over).
 *
 * Skriver direkte via browser-klienten ala CreatorApplicationForm:
 * RLS tvinger user_id = auth.uid(), PK'en håndhæver ét tag pr. konto,
 * og user_handles_tjek-triggeren afviser tags der allerede findes hos
 * skabere, ansøgninger eller andre kontos reservationer. Ingen
 * update-sti nogen steder — tag'et er uforanderligt, når det er valgt.
 */
export default function HandleClaimForm() {
  const t = useTranslations("profile");
  const router = useRouter();
  const [handle, setHandle] = useState("");
  // Debounced live-tjek — advisivt (DB'ens trigger afgør); "unknown"
  // = tabellen findes ikke endnu el. netværksfejl → intet vises
  const [status, setStatus] = useState<
    "idle" | "checking" | "free" | "taken" | "unknown"
  >("idle");
  const [state, setState] = useState<"idle" | "saved" | "taken" | "error">("idle");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const tag = normalizeHandle(handle);
    if (tag === "" || validateHandleSyntax(tag) !== null) {
      setStatus("idle");
      return;
    }
    setStatus("checking");
    const timer = setTimeout(async () => {
      const taken = await probeHandleTakenClient(createClient(), tag);
      setStatus(taken === null ? "unknown" : taken ? "taken" : "free");
    }, 500);
    return () => clearTimeout(timer);
  }, [handle]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setState("idle");

    const tag = normalizeHandle(handle);
    if (tag === "" || validateHandleSyntax(tag) !== null) {
      setState("error");
      setBusy(false);
      return;
    }

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setState("error");
      setBusy(false);
      return;
    }

    // 23505 (unique/PK) og P0001 (triggerens afvisning) = tag'et er
    // taget; PGRST205 (tabellen findes endnu ikke) og alt andet =
    // "prøv igen senere" — DB'en er autoriteten, klienten gætter ikke.
    const { error } = await supabase
      .from("user_handles")
      .insert({ user_id: session.user.id, handle: tag });
    setBusy(false);
    if (error) {
      setState(
        error.code === "23505" || error.code === "P0001" ? "taken" : "error",
      );
      return;
    }
    setState("saved");
    // Server-komponenten genhenter @-visningen → kortet forsvinder.
    router.refresh();
  };

  const inputClassName =
    "mt-2 w-full rounded-lg border border-smoke bg-noir px-4 py-2.5 text-sm text-bone placeholder:text-ash/50 transition-colors focus:border-champagne/60 focus:outline-none";

  return (
    <form onSubmit={submit} className="mt-5 space-y-4">
      <div>
        <label
          htmlFor="handle-claim"
          className="text-xs uppercase tracking-widest text-ash"
        >
          {t("handleLabel")}
        </label>
        <input
          id="handle-claim"
          type="text"
          required
          maxLength={HANDLE_MAX_LENGTH}
          autoComplete="off"
          value={handle}
          onChange={(e) => setHandle(e.target.value.toLowerCase())}
          placeholder={t("handlePlaceholder")}
          className={inputClassName}
        />
        {status === "free" && (
          <p className="mt-1.5 text-xs text-champagne">{t("handleAvailable")}</p>
        )}
        {status === "taken" && (
          <p className="mt-1.5 text-xs text-red-400">{t("handleTaken")}</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-champagne px-6 py-2.5 text-xs font-medium tracking-wide text-noir transition-colors hover:bg-bone disabled:opacity-50"
        >
          {t("handleSave")}
        </button>
        {state === "saved" && (
          <span className="text-sm text-champagne">{t("handleSaved")}</span>
        )}
        {(state === "taken" || state === "error") && (
          <span className="text-sm text-red-400">
            {state === "taken" ? t("handleTaken") : t("handleError")}
          </span>
        )}
      </div>
    </form>
  );
}