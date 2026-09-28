"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

interface DeleteAccountSectionProps {
  /** brugerens full_name (trimmet, "" hvis kontoen intet navn har) */
  expectedName: string;
  /** kontoen ejer en creator-profil → formularen erstattes af tekst */
  isCreatorOwner: boolean;
}

/**
 * "Slet konto"-formularen — sidste sektion på profilen.
 *
 * Skriv-og-bekræft: knappen aktiveres først, når det indtastede
 * navn matcher expectedName (trim + case-insensitivt). Ruten
 * (DELETE /api/account) håndhæver den samme regel server-side, så
 * et aktivt kompromitteret UI ikke kan slette en konto alene.
 *
 * Skabere ser ingen formular — film, udbetalinger og storage
 * kræver redaktionel håndtering (403 creatorBlocked server-side).
 * Navnløse konti henvises til DisplayNameForm lige over: ruten
 * afviser navneløse kald med 422 nameMismatch.
 *
 * Ved succes rydder signOut sessionen (UserMenu-mønsteret), og
 * router.replace lander logget ud på forsiden.
 */
export default function DeleteAccountSection({
  expectedName,
  isCreatorOwner,
}: DeleteAccountSectionProps) {
  const t = useTranslations("profile");
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const confirmed =
    typed.trim().toLowerCase() === expectedName.trim().toLowerCase();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!confirmed || busy) return;
    setBusy(true);
    setErrorKey(null);

    const res = await fetch("/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: typed.trim() }),
    });
    if (res.ok) {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace("/");
      router.refresh();
      return;
    }

    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    setErrorKey(body?.error ?? "generic");
    setBusy(false);
  };

  // Skaber-grenen: ingen formular, kun henvisning til redaktionen.
  if (isCreatorOwner) {
    return (
      <p className="mt-5 text-sm leading-relaxed text-ash">
        {t("deleteCreatorBlocked")}{" "}
        <a
          href="mailto:support@doccys.com"
          className="text-champagne underline underline-offset-4 hover:text-bone"
        >
          {t("deleteContact")}
        </a>
      </p>
    );
  }

  // Navnløs konto: DisplayNameForm står lige over — navnet er
  // bekræftelses-nøglen, så det skal vælges først.
  if (expectedName === "") {
    return <p className="mt-5 text-sm leading-relaxed text-ash">{t("deleteNameMissing")}</p>;
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-4">
      <label
        htmlFor="delete-confirm"
        className="block text-xs uppercase tracking-widest text-ash"
      >
        {t("deleteConfirmLabel", { name: expectedName })}
      </label>
      <input
        id="delete-confirm"
        type="text"
        maxLength={120}
        autoComplete="off"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder={t("deletePlaceholder")}
        className="mt-2 w-full rounded-lg border border-smoke bg-noir px-4 py-2.5 text-sm text-bone placeholder:text-ash/50 transition-colors focus:border-red-400/60 focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={busy || !confirmed}
          className="rounded-full border border-red-400/60 px-6 py-2.5 text-xs font-medium tracking-wide text-red-400 transition-colors hover:bg-red-400 hover:text-noir disabled:opacity-40"
        >
          {busy ? t("deleteWorking") : t("deleteButton")}
        </button>
        {errorKey && (
          <span className="text-sm text-red-400">
            {t(`deleteErrors.${errorKey}`)}
          </span>
        )}
      </div>
    </form>
  );
}