import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import VideoPlayer from "@/components/player/VideoPlayer";
import CommentSection from "@/components/player/CommentSection";
import SaveFilmButton from "@/components/documentary/SaveFilmButton";
import SectionHeading from "@/components/ui/SectionHeading";
import {
  getCreatorByHandle,
  getDocumentaryBySlug,
} from "@/lib/data/catalog";
import { formatDuration } from "@/lib/utils/format";
import { localizedGenres } from "@/lib/i18n/content";

interface WatchPageProps {
  params: Promise<{ locale: string; slug: string }>;
}

export async function generateMetadata({
  params,
}: WatchPageProps): Promise<Metadata> {
  const { slug } = await params;
  const documentary = await getDocumentaryBySlug(slug);
  return { title: documentary?.title ?? "Ikke fundet" };
}

export default async function WatchPage({ params }: WatchPageProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("watch");
  const documentary = await getDocumentaryBySlug(slug, locale);
  if (!documentary) notFound();

  const creator = await getCreatorByHandle(documentary.creatorHandle, locale);
  const genres = await localizedGenres(documentary.genres, locale);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <VideoPlayer
        documentarySlug={documentary.slug}
        videoUrl={documentary.videoUrl}
      />

      <header className="mt-10">
        <h1 className="font-display text-4xl text-bone">{documentary.title}</h1>
        <p className="mt-2 text-sm text-ash">
          {documentary.year} · {formatDuration(documentary.durationSec)} ·{" "}
          {genres.join(" · ")}
        </p>
        <p className="mt-5 max-w-3xl leading-relaxed text-bone/85">
          {documentary.synopsis}
        </p>
      </header>

      <div className="mt-6">
        <SaveFilmButton slug={documentary.slug} />
      </div>

      {creator && (
        <Link
          href={`/creator/${creator.handle}`}
          className="mt-8 flex items-center justify-between rounded-xl border border-smoke bg-onyx px-6 py-5 transition-colors hover:border-champagne/40"
        >
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-ash">{t("creator")}</p>
            <p className="mt-1 font-display text-xl text-bone">{creator.name}</p>
          </div>
          <span className="text-champagne">→</span>
        </Link>
      )}

      <div className="mt-16">
        <SectionHeading
          eyebrow={t("discussionEyebrow")}
          title={t("discussionTitle")}
          subtitle={t("discussionSubtitle")}
        />
      </div>
      <CommentSection slug={documentary.slug} />
    </div>
  );
}