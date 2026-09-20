import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import SectionHeading from "@/components/ui/SectionHeading";
import CreatorCard from "@/components/creator/CreatorCard";
import { getCreators, getFilmsByCreator } from "@/lib/data/catalog";
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

  // Statistik er privat (samme beslutning som på selve profilen):
  // visninger vises ikke offentligt — kun film-antallet står på kortet.
  const cards = await Promise.all(
    creators.map(async (creator) => {
      const [films, country] = await Promise.all([
        getFilmsByCreator(creator.handle),
        localizedCountry(creator.country, locale),
      ]);
      return { creator, country, filmCount: films.length };
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
        {cards.map(({ creator, country, filmCount }) => (
          <CreatorCard
            key={creator.id}
            creator={creator}
            country={country}
            filmsLabel={t("films", { count: filmCount })}
          />
        ))}
      </div>
    </div>
  );
}