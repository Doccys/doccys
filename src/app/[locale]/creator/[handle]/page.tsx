import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import SectionHeading from "@/components/ui/SectionHeading";
import StatCard from "@/components/creator/StatCard";
import EarningsPanel from "@/components/creator/EarningsPanel";
import PayoutPanel, {
  type PayoutMethod,
  type PayoutRequest,
} from "@/components/creator/PayoutPanel";
import FilmographyGrid from "@/components/creator/FilmographyGrid";
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

  const [films, country, posts] = await Promise.all([
    getFilmsByCreator(creator.handle, locale),
    localizedCountry(creator.country, locale),
    doccysStore.listCreatorPosts(creator.id),
  ]);

  // Statistik er PRIVAT ligesom indtjeningen: gæster og andre
  // brugere ser slet intet statistik-grid — kun ejeren ser sine
  // egne tal (visninger, fuldførelser, indtjening).
  const stats = isOwner ? await getCreatorStats(creator.handle) : null;

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

  // Selvbetjent udbetaling (kun ejeren): bankoplysninger + egne
  // anmodninger hentes med seerens session — RLS er anden linje.
  // Fald tilbage til null/[] hvis migrationen endnu ikke er kørt.
  let payoutMethod: PayoutMethod | null = null;
  let payoutRequests: PayoutRequest[] = [];
  if (isOwner && user) {
    try {
      const [methodRes, requestsRes] = await Promise.all([
        supabaseAuth
          .from("creator_payout_methods")
          .select("iban")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabaseAuth
          .from("creator_payout_requests")
          .select("id, amount_dkk, status, created_at, processed_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      if (methodRes.data) {
        payoutMethod = { iban: methodRes.data.iban };
      }
      payoutRequests = (requestsRes.data ?? []).map((r) => ({
        id: r.id,
        amountDkk: Number(r.amount_dkk), // numeric → string fra Postgres
        status: (["pending", "paid", "rejected"] as const).includes(
          r.status as PayoutRequest["status"],
        )
          ? (r.status as PayoutRequest["status"])
          : "pending",
        createdAt: r.created_at,
        processedAt: r.processed_at,
      }));
    } catch {
      // tabellerne findes ikke endnu — panelet åbner med tomt fald
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <SectionHeading
        eyebrow={t("eyebrow")}
        title={creator.name}
        subtitle={`@${creator.handle} · ${t("founded", { year: creator.foundedYear })} · ${country}`}
      />
      <p className="mt-6 max-w-3xl leading-relaxed text-ash">{creator.bio}</p>

      {isOwner && stats && creatorEarnings && (
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
          <StatCard
            label={t("statEarnings")}
            value={formatCurrency(creatorEarnings.availableDkk, locale)}
            sub={t("earningsSub")}
          />
        </div>
      )}

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
          <div className="mt-5">
            <PayoutPanel
              creatorHandle={creator.handle}
              availableDkk={creatorEarnings.availableDkk}
              initialMethod={payoutMethod}
              initialRequests={payoutRequests}
            />
          </div>
        </section>
      )}

      <section className="mt-14">
        <h2 className="font-display text-2xl text-bone">{t("filmographyHeading")}</h2>
        <div className="mt-5">
          <FilmographyGrid
            films={films}
            isOwner={isOwner}
            earningsBySlug={isOwner ? earningsBySlug : undefined}
          />
        </div>
      </section>
    </div>
  );
}