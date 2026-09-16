"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Gem/fjern-knap under afspilleren. Læser og skriver direkte i
 * saved_films-tabellen via browser-klienten — RLS sikrer, at brugeren
 * kun kan se og røre egne rækker, så ingen API-rute er nødvendig.
 */
export default function SaveFilmButton({ slug }: { slug: string }) {
  const t = useTranslations("saveButton");
  const [saved, setSaved] = useState<boolean | null>(null); // null = ikke logget ind
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase
        .from("saved_films")
        .select("documentary_slug")
        .eq("documentary_slug", slug);
      setSaved((data?.length ?? 0) > 0);
    })();
  }, [slug]);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;
    if (saved) {
      await supabase.from("saved_films").delete().eq("documentary_slug", slug);
      setSaved(false);
    } else {
      await supabase
        .from("saved_films")
        .insert({ user_id: session.user.id, documentary_slug: slug });
      setSaved(true);
    }
    setBusy(false);
  };

  if (saved === null) {
    return (
      <Link
        href="/login"
        className="rounded-full border border-smoke px-5 py-2 text-xs tracking-wide text-ash transition-colors hover:border-champagne/50 hover:text-bone"
      >
        {t("loginToSave")}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={
        saved
          ? "rounded-full bg-champagne px-5 py-2 text-xs font-medium tracking-wide text-noir transition-colors hover:bg-bone disabled:opacity-50"
          : "rounded-full border border-smoke px-5 py-2 text-xs tracking-wide text-ash transition-colors hover:border-champagne/50 hover:text-bone disabled:opacity-50"
      }
    >
      {saved ? t("saved") : t("save")}
    </button>
  );
}