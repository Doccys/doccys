import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import SectionHeading from "@/components/ui/SectionHeading";
import { getCreators, getCreatorStats, getFilmsByCreator } from "@/lib/data/catalog";
import { formatNumber } from "@/lib/utils/format";
import { localizedCountry } from "@/lib/i18n/content";

export const metadata: Metadata = { title: "Skabere" };

interface CreatorsPageProps {
  params: Promise<{ locale: string }>;
}

export default async function CreatorsPage({ params }: CreatorsPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("creators");
  const creators = await getCreators(locale);

  const cards = await Promise.all(
    creators.map(async (creator) => {
      const [films, stats, country] = await Promise.all([
        getFilmsByCreator(creator.handle),
        getCreatorStats(creator.handle),
        localizedCountry(creator.country, locale),
      ]);
      return { creator, country, filmCount: films.length, totalViews: stats.totalViews };
    }),
  );

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <SectionHeading
        eyebrow={t("eyebrow")}
        title={t("title")}
        subtitle={t("subtitle")}
      />

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {cards.map(({ creator, country, filmCount, totalViews }) => (
          <Link
            key={creator.id}
            href={`/creator/${creator.handle}`}
            className="rounded-xl border border-smoke bg-onyx p-6 transition-colors hover:border-champagne/40"
          >
            <h3 className="font-display text-xl text-bone">{creator.name}</h3>
            <p className="mt-1 text-xs text-ash">
              @{creator.handle} · {country}
            </p>
            <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-ash">
              {creator.bio}
            </p>
            <p className="mt-4 text-sm text-champagne">
              {t("films", { count: filmCount })} ·{" "}
              {t("views", { count: formatNumber(totalViews, locale) })}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}