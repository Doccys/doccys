"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Følg/afølge-knap på skaberprofilen. Læser og skriver direkte i
 * creator_followers-tabellen via browser-klienten — RLS sikrer, at
 * brugeren kun kan røre egne rækker, og at skaber-ejeren ikke kan
 * følge sin egen profil, så ingen API-rute er nødvendig.
 *
 * initialFollowing er server-renderet sandhed (profilsiden har
 * brugeren i scope); null = gæst → login-link. Tallet opdateres
 * optimistisk og rulles stille tilbage ved fejl (SaveFilmButton-
 * paritet: ingen fejlbesked-UI).
 */
interface FollowCreatorButtonProps {
  creatorId: string;
  creatorName: string;
  initialFollowing: boolean | null;
  initialFollowerCount: number;
}

export default function FollowCreatorButton({
  creatorId,
  creatorName,
  initialFollowing,
  initialFollowerCount,
}: FollowCreatorButtonProps) {
  const t = useTranslations("creatorProfile");
  const [following, setFollowing] = useState<boolean | null>(initialFollowing);
  const [followerCount, setFollowerCount] = useState(initialFollowerCount);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (busy || following === null) return;
    setBusy(true);
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const wasFollowing = following;
    // optimistisk: tallet og knappen reagerer straks, revert ved fejl
    setFollowing(!wasFollowing);
    setFollowerCount((count) => count + (wasFollowing ? -1 : 1));

    const { error } = wasFollowing
      ? await supabase
          .from("creator_followers")
          .delete()
          .eq("creator_id", creatorId)
          .eq("user_id", session.user.id)
      : await supabase
          .from("creator_followers")
          .upsert(
            { creator_id: creatorId, user_id: session.user.id },
            { onConflict: "creator_id,user_id", ignoreDuplicates: true },
          );

    if (error) {
      console.warn("FollowCreatorButton:", error.message);
      setFollowing(wasFollowing);
      setFollowerCount((count) => count + (wasFollowing ? 1 : -1));
    }
    setBusy(false);
  };

  // gæst: login-link, ikke en død knap (SaveFilmButton-paritet)
  if (following === null) {
    return (
      <div className="mt-6 flex items-center gap-3">
        <Link
          href="/login"
          className="rounded-full border border-smoke px-5 py-2 text-xs tracking-wide text-ash transition-colors hover:border-champagne/50 hover:text-bone"
        >
          {t("followLogin", { name: creatorName })}
        </Link>
        <span className="text-xs tabular-nums text-ash">
          {t("followers", { count: followerCount })}
        </span>
      </div>
    );
  }

  return (
    <div className="mt-6 flex items-center gap-3">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={
          following
            ? "rounded-full bg-champagne px-5 py-2 text-xs font-medium tracking-wide text-noir transition-colors hover:bg-bone disabled:opacity-50"
            : "rounded-full border border-smoke px-5 py-2 text-xs tracking-wide text-ash transition-colors hover:border-champagne/50 hover:text-bone disabled:opacity-50"
        }
      >
        {following ? t("following") : t("follow")}
      </button>
      <span className="text-xs tabular-nums text-ash">
        {t("followers", { count: followerCount })}
      </span>
    </div>
  );
}