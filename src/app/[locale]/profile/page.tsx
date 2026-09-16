import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import SectionHeading from "@/components/ui/SectionHeading";
import SubscriptionCard from "@/components/profile/SubscriptionCard";
import WatchHistoryList from "@/components/profile/WatchHistoryList";
import DocumentaryGrid from "@/components/documentary/DocumentaryGrid";
import { createClient } from "@/lib/supabase/server";
import { SUBSCRIPTION_PLANS } from "@/lib/data/plans";
import {
  getDocumentaryBySlug,
  getOwnedCreator,
  getSavedFilms,
  getWatchHistory,
} from "@/lib/data/catalog";
import type { Documentary, UserProfile, WatchHistoryEntry } from "@/lib/types";
import { formatDate } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Min profil" };

interface ProfilePageProps {
  params: Promise<{ locale: string }>;
}

/**
 * Brugerprofil. Identiteten læses server-side fra Supabase-sessionen
 * (cookies), og seerhistorik + gemte film hentes fra databasen —
 * RLS sikrer, at kun brugerens egne rækker kan læses.
 */
export default async function ProfilePage({ params }: ProfilePageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("profile");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-12">
        <SectionHeading
          eyebrow={t("eyebrow")}
          title={t("loginTitle")}
          subtitle={t("loginSubtitle")}
        />
        <div className="mt-8">
          <Link
            href="/login"
            className="rounded-full bg-champagne px-6 py-2.5 text-xs font-medium tracking-wide text-noir transition-colors hover:bg-bone"
          >
            {t("loginCta")}
          </Link>
        </div>
      </div>
    );
  }

  const memberSince = Date.parse(user.created_at);
  const displayName =
    (user.user_metadata?.full_name as string | undefined) ?? user.email ?? t("eyebrow");
  const email = user.email ?? "";

  // Abonnementer findes endnu ikke i databasen — alle rigtige konti
  // starter på den gratis plan.
  const profile: UserProfile = {
    id: user.id,
    name: displayName,
    email,
    tier: "free",
    memberSince,
  };

  const history = await getWatchHistory(user.id);
  const historyEntries = await Promise.all(
    history.map(async (entry: WatchHistoryEntry) => ({
      entry,
      documentary: await getDocumentaryBySlug(entry.documentarySlug, locale),
    })),
  );
  const resolvedHistory = historyEntries.filter(
    (x): x is { entry: WatchHistoryEntry; documentary: Documentary } =>
      x.documentary !== undefined,
  );

  const savedFilms = await getSavedFilms(user.id, locale);

  // Creator-status: har kontoen en ejet skaber-profil, linker
  // kortet til studiet — ellers til ansøgningssiden.
  const ownedCreator = await getOwnedCreator(user.id);

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <SectionHeading
        eyebrow={t("eyebrow")}
        title={displayName}
        subtitle={t("memberSince", { date: formatDate(memberSince, locale) })}
      />

      <section className="mt-12">
        <h2 className="font-display text-2xl text-bone">{t("subscriptionHeading")}</h2>
        <div className="mt-5">
          <SubscriptionCard user={profile} plan={SUBSCRIPTION_PLANS.free} />
        </div>
      </section>

      <section className="mt-16">
        <h2 className="font-display text-2xl text-bone">{t("creatorHeading")}</h2>
        <p className="mt-2 text-sm text-ash">
          {ownedCreator ? t("creatorOwnedSub") : t("creatorSub")}
        </p>
        <div className="mt-5">
          <Link
            href={ownedCreator ? "/creator/studio" : "/creator/apply"}
            className="rounded-full border border-champagne/60 px-6 py-2.5 text-xs font-medium tracking-wide text-champagne transition-colors hover:bg-champagne hover:text-noir"
          >
            {ownedCreator ? t("creatorStudioCta") : t("creatorApplyCta")}
          </Link>
        </div>
      </section>

      <section className="mt-16">
        <h2 className="font-display text-2xl text-bone">{t("historyHeading")}</h2>
        <p className="mt-2 text-sm text-ash">{t("historySubtitle")}</p>
        <div className="mt-5">
          {resolvedHistory.length > 0 ? (
            <WatchHistoryList entries={resolvedHistory} />
          ) : (
            <p className="rounded-xl border border-smoke bg-onyx px-6 py-8 text-sm leading-relaxed text-ash">
              {t("historyEmpty")}
            </p>
          )}
        </div>
      </section>

      <section className="mt-16">
        <h2 className="font-display text-2xl text-bone">{t("savedHeading")}</h2>
        <p className="mt-2 text-sm text-ash">{t("savedSubtitle")}</p>
        <div className="mt-5">
          {savedFilms.length > 0 ? (
            <DocumentaryGrid documentaries={savedFilms} />
          ) : (
            <p className="rounded-xl border border-smoke bg-onyx px-6 py-8 text-sm leading-relaxed text-ash">
              {t("savedEmpty")}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}