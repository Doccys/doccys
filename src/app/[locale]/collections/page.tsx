import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import SectionHeading from "@/components/ui/SectionHeading";
import CollectionCard from "@/components/collection/CollectionCard";
import { getCollections } from "@/lib/data/catalog";

/** Oversigt over alle kuraterede samlinger. */
export const metadata: Metadata = { title: "Samlinger" };

interface CollectionsPageProps {
  params: Promise<{ locale: string }>;
}

export default async function CollectionsPage({ params }: CollectionsPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("collections");
  const collections = await getCollections(locale);

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <SectionHeading
        eyebrow={t("railTitle")}
        title={t("indexTitle")}
        subtitle={t("indexSubtitle")}
      />

      <div className="mt-10 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
        {collections.map((collection) => (
          <CollectionCard key={collection.id} collection={collection} />
        ))}
      </div>

      {collections.length === 0 && (
        <p className="mt-10 text-sm text-ash">{t("empty")}</p>
      )}
    </div>
  );
}