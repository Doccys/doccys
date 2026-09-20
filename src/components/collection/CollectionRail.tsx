import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import SectionHeading from "@/components/ui/SectionHeading";
import CollectionCard from "@/components/collection/CollectionCard";
import type { Collection } from "@/lib/types";

/**
 * Samlingsrillen: overskrift + ét kort pr. samling i samme grid
 * som filmkataloget. Tom liste = intet output (sektionen er
 * valgfri pynt på forsiden, ikke en tom ramme).
 */
export default async function CollectionRail({
  collections,
}: {
  collections: Collection[];
}) {
  if (collections.length === 0) return null;

  const t = await getTranslations("collections");

  return (
    <section className="mx-auto max-w-6xl px-6 py-8">
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
      <div className="mt-6">
        <Link
          href="/collections"
          className="text-xs tracking-wide text-champagne transition-colors hover:text-bone"
        >
          {t("viewAll")} →
        </Link>
      </div>
    </section>
  );
}