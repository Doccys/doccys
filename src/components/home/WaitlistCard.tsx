"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { createClient } from "@/lib/supabase/client";

/**
 * Fangst-listen (17/11): demo-side fangsten, når kataloget er tyndt —
 * "Kuratering pågår — få besked når nye dokumentarer landar". Indsætter
 * anonymt til notify_waitlist (RLS: insetbar af hvem-som-helst, IKKE
 * læsbar — listen er redaktionens). Duplikat (23505) = også "tilmeldt".
 */
export default function WaitlistCard() {
  const t = useTranslations("waitlist");
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [tilmeldt, setTilmeldt] = useState(false);
  const [sender, setSender] = useState(false);
  const [fejl, setFejl] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmet = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(trimmet)) {
      setFejl(t("error"));
      return;
    }
    setSender(true);
    setFejl(null);
    try {
      const supabase = createClient();
      // RLS-politikken er autoriteten — duplikat (23505) = opfattet
      // som tilmeldt (listen er unik pr. mail uanset case).
      const { error: insertError } = await supabase
        .from("notify_waitlist")
        .insert({ email: trimmet, locale });
      if (insertError && insertError.code !== "23505") {
        setFejl(t("error"));
        return;
      }
      setTilmeldt(true);
      setEmail("");
    } catch {
      setFejl(t("error"));
    } finally {
      setSender(false);
    }
  }

  if (tilmeldt) {
    return (
      <div className="rounded-xl border border-champagne/40 bg-onyx px-6 py-5">
        <p className="font-display text-xl text-champagne">
          {t("submitted")}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-smoke bg-onyx px-6 py-6">
      <p className="font-display text-xl text-bone">{t("title")}</p>
      <p className="mt-2 text-sm leading-relaxed text-ash">{t("body")}</p>
      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("placeholder")}
          maxLength={254}
          required
          className="w-full rounded-lg border border-smoke bg-noir px-4 py-2.5 text-sm text-bone placeholder:text-ash/60 focus:border-champagne focus:outline-none sm:flex-1"
        />
        <button
          type="submit"
          disabled={sender || !email.trim()}
          className="rounded-full bg-champagne px-6 py-2.5 text-xs font-semibold tracking-wide text-noir transition-colors hover:bg-bone disabled:cursor-not-allowed disabled:opacity-40"
        >
          {sender ? "…" : t("submit")}
        </button>
      </form>
      {fejl && <p className="mt-3 text-sm text-red-400">{fejl}</p>}
    </div>
  );
}
