import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { siteUrl } from "@/lib/site";
import VideoPlayer from "@/components/player/VideoPlayer";
import PaywallCard from "@/components/watch/PaywallCard";
import LocalPriceHint from "@/components/fx/LocalPriceHint";
import ShareButtons from "@/components/watch/ShareButtons";
import CommentSection from "@/components/player/CommentSection";
import SaveFilmButton from "@/components/documentary/SaveFilmButton";
import SectionHeading from "@/components/ui/SectionHeading";
import {
  getCreatorByHandle,
  getDocumentaryBySlug,
} from "@/lib/data/catalog";
import { getBalanceSeconds, getOrCreateReferralCode } from "@/lib/data/credits";
import { getFilmSubtitles } from "@/lib/data/subtitles";
import { getFilmTrailerUrl } from "@/lib/data/trailers";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDuration, toIsoDuration } from "@/lib/utils/format";
import { localizedGenres } from "@/lib/i18n/content";

interface WatchPageProps {
  params: Promise<{ locale: string; slug: string }>;
}

export async function generateMetadata({
  params,
}: WatchPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const documentary = await getDocumentaryBySlug(slug, locale);
  if (!documentary) return { title: "Ikke fundet" };

  // Open Graph / Twitter-kort: det ER deling. Uden disse tags viser
  // Facebook/WhatsApp kun et nøgent link. Uploadet plakat bruges
  // når den findes — ellers det auto-genererede kort i filmens egen
  // gradient (/og/film/{slug}), så ALLE film deler med billede.
  const ogImage = documentary.posterUrl
    ? documentary.posterUrl
    : `${siteUrl()}/og/film/${documentary.slug}`;

  // Klar trailer (film_trailers 'ready') gør Facebook i stand til at
  // vise filmen som VIDEO-kort i feedtet — 90 sekunder direkte i
  // previewet. Uden trailer er kortet "bare" et billede, og det er
  // stadig fint. Twitter beholdes summary_large_image: player-kort
  // kræver godkendelse af domænet hos X.
  const trailerUrl = await getFilmTrailerUrl(slug);

  const watchUrl = `${siteUrl()}/${locale}/watch/${documentary.slug}`;

  return {
    title: documentary.title,
    description: documentary.synopsis,
    // oEmbed: gør filmen indlejrbar i CMS'er (alternates → <link
    // rel="alternate" type="application/json+oembed">).
    alternates: {
      types: {
        "application/json+oembed": `${siteUrl()}/api/oembed?url=${encodeURIComponent(watchUrl)}`,
      },
    },
    openGraph: {
      type: "video.other",
      title: documentary.title,
      description: documentary.synopsis,
      images: [{ url: ogImage, width: 1200, height: 630, alt: documentary.title }],
      videos: trailerUrl ? [{ url: trailerUrl }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: documentary.title,
      description: documentary.synopsis,
      images: [ogImage],
    },
  };
}

export default async function WatchPage({ params }: WatchPageProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("watch");
  const documentary = await getDocumentaryBySlug(slug, locale);
  if (!documentary) notFound();

  const creator = await getCreatorByHandle(documentary.creatorHandle, locale);
  const genres = await localizedGenres(documentary.genres, locale);

  // Paywall-gate: afspilning kræver en konto OG saldo der dækker
  // filmens HELE længde ("fuld dækning"). Saldoen kan blive negativ
  // ved flere samtidige tabs — nye film blokeres til genopfyldning.
  // Alt andet indhold (info, creator, kommentarer) vises stadig.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let player: ReactNode;
  if (!user) {
    // Smagsprøven først: findes en klar trailer, afspilles den i
    // paywall-kortet — delte links skal give modtageren noget at se.
    const trailerUrl = await getFilmTrailerUrl(documentary.slug);
    player = (
      <PaywallCard
        mode="login"
        trailerUrl={trailerUrl}
        // Kr-pris-linjen skal også stå ved login-spærren — gæster
        // skal se "ca. 4,50 kr for hele filmen", ikke kun minutter
        requiredMinutes={Math.ceil(documentary.durationSec / 60)}
      />
    );
  } else {
    const balanceSeconds = await getBalanceSeconds();
    if (balanceSeconds < documentary.durationSec) {
      const trailerUrl = await getFilmTrailerUrl(documentary.slug);
      player = (
        <PaywallCard
          mode="buy"
          requiredMinutes={Math.ceil(documentary.durationSec / 60)}
          balanceMinutes={Math.max(Math.floor(balanceSeconds / 60), 0)}
          trailerUrl={trailerUrl}
        />
      );
    } else {
      // Undertekster: kun 'ready'-rækker når afspilleren. Default er
      // seererens eget sprog; findes det ikke, filmens TALESPROG
      // (transskriptionens sprog — en dansk film falder således
      // tilbage til dansk, en engelsk til engelsk), ellers første
      // track (alphabetisk da-først). Tom liste = ingen CC-menu,
      // præcis som før pipelinen kørte.
      const subtitleTracks = await getFilmSubtitles(slug);
      const defaultTrack =
        subtitleTracks.find((track) => track.locale === locale) ??
        subtitleTracks.find(
          (track) => track.locale === documentary.spokenLanguage,
        ) ??
        subtitleTracks[0];
      const tracksWithDefault = subtitleTracks.map((track) => ({
        ...track,
        isDefault: track.locale === defaultTrack?.locale,
      }));
      player = (
        <VideoPlayer
          documentarySlug={documentary.slug}
          videoUrl={documentary.videoUrl}
          subtitleTracks={tracksWithDefault}
          // Støtte-beviset: skaberens navn og filmens sats pr. 100
          // sete minutter — beløbet efter en afspilning regnes i
          // klienten ud fra afregningens watched_seconds
          creatorName={creator?.name}
          payoutRateDkk={documentary.payoutRateDkk}
        />
      );
    }
  }

  // Er den besøgende filmens creator-ejer? Serveren er autoritet —
  // kun ejeren ser fastgør/slet-knapperne i diskussionen.
  const isCreatorOwner = Boolean(
    user && creator && creator.ownerUserId === user.id,
  );

  // Seerens affiliate-kode — delte links bærer ?ref={kode}, og
  // middleware sætter doccys_ref-cookien hos modtageren. Oprettes
  // lazy som på profilen; gæster deler uden kode.
  const refCode = user ? await getOrCreateReferralCode(user.id) : null;

  // Strukturerede data (schema.org VideoObject) er Googles vej ind i
  // video-rige søgeresultater — thumbnails og længde direkte i hit-
  // listen. uploadDate kræves af Google; embedUrl peger på den
  // indlejringsbare afspiller (/api/embed — gratis smagsprøve, jf.
  // paywall). "<" escapes som <, så titel/synopse aldrig kan
  // bryde ud af script-blokken.
  const shareImage =
    documentary.posterUrl ?? `${siteUrl()}/og/film/${documentary.slug}`;
  const videoJsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: documentary.title,
    description: documentary.synopsis,
    thumbnailUrl: [shareImage],
    uploadDate: documentary.createdAt,
    duration: toIsoDuration(documentary.durationSec),
    embedUrl: `${siteUrl()}/api/embed/${documentary.slug}`,
    publisher: {
      "@type": "Organization",
      name: creator?.name ?? "Doccys",
    },
    interactionStatistic: {
      "@type": "InteractionCounter",
      interactionType: { "@type": "WatchAction" },
      userInteractionCount: documentary.stats.totalViews,
    },
  }).replaceAll("<", "\\u003c");

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: videoJsonLd }}
      />
      {player}

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

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <SaveFilmButton slug={documentary.slug} />
        <ShareButtons title={documentary.title} refCode={refCode} />
      </div>

      {creator && (
        <Link
          href={`/creator/${creator.handle}`}
          className="mt-8 flex items-center justify-between rounded-xl border border-smoke bg-onyx px-6 py-5 transition-colors hover:border-champagne/40"
        >
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-ash">{t("creator")}</p>
            <p className="mt-1 font-display text-xl text-bone">{creator.name}</p>
            {/* Det økonomiske løfte, offentligt: filmens sats pr. 100
                sete minutter — radikal transparens, ingen anden
                streamingtjeneste viser pengene ved selve værket.
                Ikke-danske seere ser satsen i egen valuta ved siden af
                (vejledende kurs — DKK forbliver afregningsvalutaen). */}
            <p className="mt-1.5 text-xs text-champagne">
              {t("payoutLine", {
                rate: formatCurrency(documentary.payoutRateDkk, locale),
                creator: creator.name,
              })}{" "}
              <LocalPriceHint
                dkk={documentary.payoutRateDkk}
                className="text-champagne/70"
              />
            </p>
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
      <CommentSection slug={documentary.slug} isCreatorOwner={isCreatorOwner} />
    </div>
  );
}