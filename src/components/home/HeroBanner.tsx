import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Documentary } from "@/lib/types";
import { formatDuration } from "@/lib/utils/format";
import { getCreatorByHandle } from "@/lib/data/catalog";
import { localizedGenres } from "@/lib/i18n/content";

export default async function HeroBanner({
  documentary,
}: {
  documentary: Documentary;
}) {
  const t = await getTranslations("home");
  const locale = await getLocale();
  const creator = await getCreatorByHandle(documentary.creatorHandle, locale);
  const genres = await localizedGenres(documentary.genres, locale);

  return (
    <section
      className={`relative overflow-hidden border-b border-smoke bg-linear-to-br ${documentary.gradient}`}
    >
      {/* uploadet forsidebillede ligger under mørkeringen — gradienten
          fungerer som fallback (og fylder bag billedets kanter) */}
      {documentary.posterUrl && (
        /* eslint-disable-next-line @next/next/no-img-element -- storage-URL, ikke Next-billedpipeline */
        <img
          src={documentary.posterUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {/* mørkering, så teksten altid står klart — uanset baggrund */}
      <div className="absolute inset-0 bg-noir/55" />
      <div className="relative mx-auto flex max-w-6xl flex-col justify-end px-6 pb-12 pt-20">
        <p className="text-xs uppercase tracking-[0.4em] text-champagne">
          {t("featured.eyebrow")}
        </p>
        <h1 className="mt-3 max-w-3xl font-display text-3xl leading-tight text-bone sm:text-4xl">
          {documentary.title}
        </h1>
        <p className="mt-2 text-xs text-bone/70">
          {documentary.year} · {formatDuration(documentary.durationSec)} ·{" "}
          {genres.join(" · ")}
          {creator && <> · {t("featured.by", { name: creator.name })}</>}
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-bone/85">
          {documentary.synopsis}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-6">
          <Link
            href={`/watch/${documentary.slug}`}
            className="rounded-full bg-champagne px-6 py-2 text-xs font-medium tracking-wide text-noir transition-colors hover:bg-bone"
          >
            {t("featured.watchNow")}
          </Link>
          {creator && (
            <Link
              href={`/creator/${creator.handle}`}
              className="text-xs text-bone/80 underline-offset-4 transition-colors hover:text-champagne hover:underline"
            >
              {t("featured.aboutCreator")} →
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}