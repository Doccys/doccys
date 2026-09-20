import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Collection } from "@/lib/types";

/**
 * Ét samlingkort i DocumentaryCard-familien: preview er FØRSTE
 * publicerede films plakat/gradient (samlingen har ikke egen
 * grafik), mørket let så titelen altid læses.
 */
export default async function CollectionCard({
  collection,
}: {
  collection: Collection;
}) {
  const t = await getTranslations("collections");

  return (
    <Link href={`/collections/${collection.slug}`} className="group block">
      <div
        className={`relative aspect-[16/9] overflow-hidden rounded-lg border border-smoke bg-linear-to-br ${collection.previewGradient} transition-transform duration-300 group-hover:-translate-y-1`}
      >
        {collection.previewPosterUrl && (
          /* eslint-disable-next-line @next/next/no-img-element -- storage-URL, ikke Next-billedpipeline */
          <img
            src={collection.previewPosterUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        {/* let mørkning oveni plakaten, så titelen altid står læsbart */}
        <div className="absolute inset-0 bg-noir/30" />
        <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-noir via-noir/80 to-transparent p-3 pt-8">
          <h3 className="font-display text-base leading-snug text-bone">
            {collection.title}
          </h3>
          <p className="mt-1 text-xs text-champagne">
            {t("filmCount", { count: collection.filmCount })}
          </p>
        </div>
      </div>
      <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-ash">
        {collection.description}
      </p>
    </Link>
  );
}