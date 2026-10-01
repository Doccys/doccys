"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Afølge-knap i "Skabere du følger". Sletter direkte i
 * creator_followers via browser-klienten — RLS sikrer, at kun egne
 * rækker kan røres — og genindlæser server-renderet data bagefter
 * (DisplayNameForm-mønsteret). Genbruger ikke FollowCreatorButton:
 * en "Følg"-knap i en liste man per definition følger ville være
 * semantisk forvirrende.
 */
export default function UnfollowCreatorButton({
  creatorId,
}: {
  creatorId: string;
}) {
  const t = useTranslations("profile");
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const unfollow = async () => {
    if (busy) return;
    setBusy(true);
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;
    const { error } = await supabase
      .from("creator_followers")
      .delete()
      .eq("creator_id", creatorId)
      .eq("user_id", session.user.id);
    if (error) {
      console.warn("UnfollowCreatorButton:", error.message);
      setBusy(false);
      return;
    }
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={unfollow}
      disabled={busy}
      className="shrink-0 rounded-full border border-smoke px-4 py-1.5 text-xs tracking-wide text-ash transition-colors hover:border-champagne/50 hover:text-bone disabled:opacity-50"
    >
      {t("unfollowButton")}
    </button>
  );
}