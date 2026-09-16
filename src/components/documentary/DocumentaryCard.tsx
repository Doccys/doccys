import { getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Documentary } from "@/lib/types";
import { formatDuration } from "@/lib/utils/format";
import { localizedGenres } from "@/lib/i18n/content";

export default async function DocumentaryCard({ documentary }: { documentary: Documentary }) {
  const locale = await getLocale();
  const genres = await localizedGenres(documentary.genres, locale);

  return (
    <Link href={`/watch/${documentary.slug}`} className="group block">
      <div
        className={`relative aspect-[16/9] overflow-hidden rounded-lg border border-smoke bg-linear-to-br ${documentary.gradient} transition-transform duration-300 group-hover:-translate-y-1`}
      >
        {/* uploadet forsidebillede ligger oveni gradienten (object-cover);
            mangler det, viser gradienten + typografisk vandmærke som før */}
        {documentary.posterUrl && (
          /* eslint-disable-next-line @next/next/no-img-element -- storage-URL, ikke Next-billedpipeline */
          <img
            src={documentary.posterUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        {!documentary.posterUrl && (
          <span className="absolute left-3 top-2 select-none font-display text-4xl text-bone/10">
            {documentary.title[0]}
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-noir via-noir/80 to-transparent p-3 pt-8">
          <h3 className="font-display text-base leading-snug text-bone">
            {documentary.title}
          </h3>
          <p className="mt-1 text-xs text-ash">
            {genres.join(" · ")}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm text-ash">
        <span>{documentary.year}</span>
        <span>{formatDuration(documentary.durationSec)}</span>
      </div>
    </Link>
  );
}