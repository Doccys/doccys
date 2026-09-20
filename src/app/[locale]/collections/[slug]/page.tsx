import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import SectionHeading from "@/components/ui/SectionHeading";
import DocumentaryGrid from "@/components/documentary/DocumentaryGrid";
import { getCollectionBySlug } from "@/lib/data/catalog";
import { siteUrl } from "@/lib/site";

interface CollectionPageProps {
  params: Promise<{ locale: string; slug: string }>;
}

export async function generateMetadata({
  params,
}: CollectionPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const result = await getCollectionBySlug(slug, locale);
  if (!result) return { title: "Ikke fundet" };
  const { collection } = result;

  // Open Graph: første films plakat, ellers det auto-genererede kort
  // i filmens egen gradient — en samling deler altid med billede
  // (samlingen har ikke egen grafik).
  const ogImage = collection.previewPosterUrl
    ? collection.previewPosterUrl
    : collection.previewFilmSlug
      ? `${siteUrl()}/og/film/${collection.previewFilmSlug}`
      : undefined;

  return {
    title: collection.title,
    description: collection.description,
    openGraph: {
      type: "website",
      title: collection.title,
      description: collection.description,
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
  };
}

/** Én kurateret samling: redaktionens tema + filmene i deres rækkefølge. */
export default async function CollectionPage({ params }: CollectionPageProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("collections");
  const result = await getCollectionBySlug(slug, locale);
  if (!result) notFound();
  const { collection, films } = result;

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <SectionHeading
        eyebrow={t("railTitle")}
        title={collection.title}
        subtitle={collection.description}
      />

      <div className="mt-10">
        {films.length > 0 ? (
          <DocumentaryGrid documentaries={films} />
        ) : (
          <p className="text-sm text-ash">{t("empty")}</p>
        )}
      </div>

      <div className="mt-10">
        <Link
          href="/collections"
          className="text-xs tracking-wide text-champagne transition-colors hover:text-bone"
        >
          ← {t("viewAll")}
        </Link>
      </div>
    </div>
  );
}