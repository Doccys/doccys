import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import SectionHeading from "@/components/ui/SectionHeading";
import StatCard from "@/components/creator/StatCard";
import EarningsPanel from "@/components/creator/EarningsPanel";
import FilmographyTable from "@/components/creator/FilmographyTable";
import BulletinBoard from "@/components/creator/BulletinBoard";
import {
  getCreatorByHandle,
  getCreatorStats,
  getFilmsByCreator,
} from "@/lib/data/catalog";
import { getCreatorEarnings } from "@/lib/data/credits";
import { doccysStore } from "@/lib/store/supabaseStore";
import { createClient } from "@/lib/supabase/server";
import type { CreatorFilmEarnings } from "@/lib/types";
import { formatCurrency, formatNumber } from "@/lib/utils/format";
import { localizedCountry } from "@/lib/i18n/content";

interface CreatorPageProps {
  params: Promise<{ locale: string; handle: string }>;
}

export async function generateMetadata({
  params,
}: CreatorPageProps): Promise<Metadata> {
  const { handle } = await params;
  const creator = await getCreatorByHandle(handle);
  return { title: creator?.name ?? "Skaber ikke fundet" };
}

export default async function CreatorPage({ params }: CreatorPageProps) {
  const { locale, handle } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("creatorProfile");
  const creator = await getCreatorByHandle(handle, locale);
  if (!creator) notFound();

  // Er den besøgende creatorens ejer-konto? Serveren er autoritet —
  // kun ejeren ser opslag-formularen, rediger/slet/fastgør-knapper
  // OG sin egen indtjening (data hentes slet ikke for andre).
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  const isOwner = Boolean(user && creator.ownerUserId === user.id);

  const [films, stats, country, posts] = await Promise.all([
    getFilmsByCreator(creator.handle, locale),
    getCreatorStats(creator.handle),
    localizedCountry(creator.country, locale),
    doccysStore.listCreatorPosts(creator.id),
  ]);

  // Indtjening er PRIVAT: RPC'en afviser alle undtagen ejeren
  // (migration 20260919_indtjening_privat), så vi kalder den kun
  // som ejer. Fald tilbage til et tomt aggregat hvis RPC'en fejler
  // (fx før migrationen er kørt) — panelet viser så 0'er.
  const creatorEarnings = isOwner
    ? ((await getCreatorEarnings(creator.handle)) ?? {
        earnedDkk: 0,
        paidDkk: 0,
        availableDkk: 0,
        validWatchedMinutes: 0,
        films: [],
      })
    : null;
  const earningsBySlug: Record<string, CreatorFilmEarnings> = Object.fromEntries(
    (creatorEarnings?.films ?? []).map((f) => [f.slug, f]),
  );

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <SectionHeading
        eyebrow={t("eyebrow")}
        title={creator.name}
        subtitle={`@${creator.handle} · ${t("founded", { year: creator.foundedYear })} · ${country}`}
      />
      <p className="mt-6 max-w-3xl leading-relaxed text-ash">{creator.bio}</p>

      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t("statViews")}
          value={formatNumber(stats.totalViews, locale)}
        />
        <StatCard
          label={t("statCompletions")}
          value={formatNumber(stats.totalCompletions, locale)}
          sub={t("completionsSub", { rate: (stats.avgCompletionRate * 100).toFixed(0) })}
        />
        <StatCard
          label={t("statValid")}
          value={formatNumber(stats.validCompletions, locale)}
          sub={t("validSub")}
        />
        {isOwner && creatorEarnings && (
          <StatCard
            label={t("statEarnings")}
            value={formatCurrency(creatorEarnings.availableDkk, locale)}
            sub={t("earningsSub")}
          />
        )}
      </div>

      <section className="mt-14">
        <BulletinBoard
          creatorId={creator.id}
          initialPosts={posts}
          isOwner={isOwner}
        />
      </section>

      {isOwner && creatorEarnings && (
        <section className="mt-14">
          <h2 className="font-display text-2xl text-bone">{t("earningsHeading")}</h2>
          <div className="mt-5">
            <EarningsPanel earnings={creatorEarnings} />
          </div>
        </section>
      )}

      <section className="mt-14">
        <h2 className="font-display text-2xl text-bone">{t("filmographyHeading")}</h2>
        <div className="mt-5">
          <FilmographyTable
            films={films}
            earningsBySlug={isOwner ? earningsBySlug : undefined}
          />
        </div>
      </section>
    </div>
  );
}