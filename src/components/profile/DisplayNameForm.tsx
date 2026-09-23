"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

interface DisplayNameFormProps {
  /** nuværende navn ("" hvis kontoen ikke har ét endnu) */
  initialName: string;
}

/**
 * Brugernavns-formularen på profilen.
 *
 * Navnet bor i auth-metadata (full_name) og opdateres med
 * supabase.auth.updateUser — ingen egen tabel, og sessionen
 * opdateres med det samme, så header-chippen og kommentar-formen
 * følger med uden genlogin. router.refresh() genindlæser
 * server-komponenterne (profilens overskrift) bagefter.
 */
export default function DisplayNameForm({ initialName }: DisplayNameFormProps) {
  const t = useTranslations("profile");
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setState("idle");

    const trimmed = name.trim();
    if (trimmed === "") {
      setState("error");
      setBusy(false);
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({
      data: { full_name: trimmed },
    });
    setBusy(false);
    if (error) {
      setState("error");
      return;
    }
    setState("saved");
    router.refresh();
  };

  const inputClassName =
    "mt-2 w-full rounded-lg border border-smoke bg-noir px-4 py-2.5 text-sm text-bone placeholder:text-ash/50 transition-colors focus:border-champagne/60 focus:outline-none";

  return (
    <form onSubmit={submit} className="mt-5 space-y-4">
      <div>
        <label
          htmlFor="display-name"
          className="text-xs uppercase tracking-widest text-ash"
        >
          {t("nameLabel")}
        </label>
        <input
          id="display-name"
          type="text"
          required
          maxLength={120}
          autoComplete="nickname"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClassName}
        />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-champagne px-6 py-2.5 text-xs font-medium tracking-wide text-noir transition-colors hover:bg-bone disabled:opacity-50"
        >
          {t("nameSave")}
        </button>
        {state === "saved" && (
          <span className="text-sm text-champagne">{t("nameSaved")}</span>
        )}
        {state === "error" && (
          <span className="text-sm text-red-400">{t("nameError")}</span>
        )}
      </div>
    </form>
  );
}