import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import SectionHeading from "@/components/ui/SectionHeading";
import MinutesSection from "@/components/profile/MinutesSection";
import SupportLedgerSection from "@/components/profile/SupportLedgerSection";
import WatchHistoryList from "@/components/profile/WatchHistoryList";
import DocumentaryGrid from "@/components/documentary/DocumentaryGrid";
import { createClient } from "@/lib/supabase/server";
import {
  getBalanceSeconds,
  getOrCreateReferralCode,
} from "@/lib/data/credits";
import {
  getDocumentaryBySlug,
  getOwnedCreator,
  getSavedFilms,
  getWatchHistory,
} from "@/lib/data/catalog";
import { getSupportLedger } from "@/lib/data/support";
import type { Documentary, WatchHistoryEntry } from "@/lib/types";
import { formatDate } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Min profil" };

interface ProfilePageProps {
  params: Promise<{ locale: string }>;
  /** ?koeb=ok efter redirect tilbage fra Stripe Checkout */
  searchParams: Promise<{ koeb?: string }>;
}

/**
 * Brugerprofil. Identiteten læses server-side fra Supabase-sessionen
 * (cookies), og seerhistorik + gemte film hentes fra databasen —
 * RLS sikrer, at kun brugerens egne rækker kan læses. Minut-saldoen
 * er summen af den append-only credit_ledger (via saldo_sekunder-RPC).
 */
export default async function ProfilePage({ params, searchParams }: ProfilePageProps) {
  const { locale } = await params;
  const { koeb } = await searchParams;
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

  // Minut-økonomi: saldo + henvisningskode (oprettes lazy ved
  // første besøg i profilen)
  const balanceSeconds = await getBalanceSeconds();
  const referralCode = await getOrCreateReferralCode(user.id);

  // Minutregnskab: seerens validede minutter → kroner direkte til
  // skaberne. Null (datafejl) udelader sektionen — pynt, ikke en
  // fejlside.
  const supportLedger = await getSupportLedger(user.id);

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <SectionHeading
        eyebrow={t("eyebrow")}
        title={displayName}
        subtitle={t("memberSince", { date: formatDate(memberSince, locale) })}
      />

      <MinutesSection
        locale={locale}
        balanceSeconds={balanceSeconds}
        referralCode={referralCode}
        purchaseSuccess={koeb === "ok"}
      />

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

      {supportLedger && <SupportLedgerSection ledger={supportLedger} />}

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