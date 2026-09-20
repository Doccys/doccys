import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import SectionHeading from "@/components/ui/SectionHeading";
import DocumentaryGrid from "@/components/documentary/DocumentaryGrid";
import CreatorCard from "@/components/creator/CreatorCard";
import {
  getFilmsByCreator,
  searchCatalog,
  type SearchResults,
} from "@/lib/data/catalog";
import { FILM_GENRES } from "@/lib/data/genres";
import { localizedCountry } from "@/lib/i18n/content";

/**
 * Søgeresultatside — headerens søgefelt (og genre-chips her) lander
 * her via /search?q=…. Server-renderet: alt søgearbejde sker i
 * searchCatalog (film, skabere, genrer). Query-param-siden er
 * bevidst noindex — søgeresultater skal ikke udgøre sitets overflade
 * mod søgemaskiner.
 */
export const metadata: Metadata = {
  title: "Søg",
  robots: { index: false },
};

interface SearchPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
};

/** Genre-chips: lander på en søgning efter genren (dens film udlæses
 *  som en genre-sektion af searchCatalog). Genbruges på landingen og
 *  i tom-resultat-tilstanden. */
async function GenreChips() {
  const genreT = await getTranslations("genres");
  const t = await getTranslations("search");
  return (
    <>
      <p className="text-sm text-ash">{t("exploreGenres")}</p>
      <div className="mt-4 flex flex-wrap gap-2.5">
        {FILM_GENRES.map((genre) => (
          <Link
            key={genre}
            href={`/search?q=${encodeURIComponent(genre)}`}
            className="rounded-full border border-smoke px-4 py-2 text-xs text-ash transition-colors hover:border-champagne/60 hover:text-champagne"
          >
            {genreT(genre)}
          </Link>
        ))}
      </div>
    </>
  );
}

export default async function SearchPage({
  params,
  searchParams,
}: SearchPageProps) {
  const { locale } = await params;
  const { q: rawQ } = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations("search");
  const q = (rawQ ?? "").trim().slice(0, 100);

  // Landing uden forespørgsel: genre-chips som dør ind i kataloget
  if (!q) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-12">
        <SectionHeading
          eyebrow={t("eyebrow")}
          title={t("landingTitle")}
          subtitle={t("landingHint")}
        />
        <div className="mt-10">
          <GenreChips />
        </div>
      </div>
    );
  }

  const results: SearchResults = await searchCatalog(q, locale);
  const genreT = await getTranslations("genres");
  const creatorsT = await getTranslations("creators");

  // Filmtal til skaber-kortene (statistikken er privat — kun antallet)
  const creatorCards = await Promise.all(
    results.creators.map(async (creator) => {
      const [films, country] = await Promise.all([
        getFilmsByCreator(creator.handle),
        localizedCountry(creator.country, locale),
      ]);
      return { creator, country, filmCount: films.length };
    }),
  );

  const totalHits =
    results.films.length +
    results.creators.length +
    results.genres.reduce((sum, g) => sum + g.films.length, 0);

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <SectionHeading eyebrow={t("eyebrow")} title={t("resultsTitle", { q })} />

      {totalHits === 0 ? (
        <div className="mt-10">
          <p className="font-display text-xl text-bone">
            {t("noResults", { q })}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ash">
            {t("noResultsHint")}
          </p>
          <div className="mt-8">
            <GenreChips />
          </div>
        </div>
      ) : (
        <>
          {results.films.length > 0 && (
            <section className="mt-10">
              <h3 className="font-display text-xl text-bone">
                {t("filmsSection")}
              </h3>
              <div className="mt-6">
                <DocumentaryGrid documentaries={results.films} />
              </div>
            </section>
          )}

          {results.genres.map(({ genre, films }) => (
            <section key={genre} className="mt-10">
              <h3 className="font-display text-xl text-bone">
                {genreT(genre)}
              </h3>
              <div className="mt-6">
                <DocumentaryGrid documentaries={films} />
              </div>
            </section>
          ))}

          {creatorCards.length > 0 && (
            <section className="mt-10">
              <h3 className="font-display text-xl text-bone">
                {t("creatorsSection")}
              </h3>
              <div className="mt-6 grid gap-6 md:grid-cols-3">
                {creatorCards.map(({ creator, country, filmCount }) => (
                  <CreatorCard
                    key={creator.id}
                    creator={creator}
                    country={country}
                    filmsLabel={creatorsT("films", { count: filmCount })}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}