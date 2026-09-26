import type { Metadata } from "next";
import { Link, redirect } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import SectionHeading from "@/components/ui/SectionHeading";
import StudioUploadForm from "@/components/creator/StudioUploadForm";
import StudioFilmList from "@/components/creator/StudioFilmList";
import StudioStatsSection from "@/components/creator/StudioStatsSection";
import { createClient } from "@/lib/supabase/server";
import {
  getCreatorFilmsIncludingDrafts,
  getOwnedCreator,
} from "@/lib/data/catalog";
import { getCreatorTal } from "@/lib/data/creatorTal";
import { localizedCountry } from "@/lib/i18n/content";

export const metadata: Metadata = { title: "Skaber-studio" };

interface StudioPageProps {
  params: Promise<{ locale: string }>;
}

/**
 * Skaber-studio: upload af nye film (altid som kladde — de vises
 * først offentligt, når redaktionen godkender dem) og overblik
 * over egne film med status-badge.
 *
 * Adgangskravet håndhæves af RLS i databasen; siden er blot
 * venligheden der viser formularen. Har kontoen ikke en ejet
 * skaber-profil, sendes brugeren til ansøgningssiden.
 */
export default async function CreatorStudioPage({ params }: StudioPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("creatorStudio");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-12">
        <SectionHeading
          eyebrow={t("eyebrow")}
          title={t("loginTitle")}
          subtitle={t("loginSubtitle")}
        />
        <div className="mt-8">
          <Link
            href="/login"
            className="rounded-full bg-champagne px-6 py-2.5 text-xs font-medium tracking-wide text-noir transition-colors hover:bg-bone"
          >
            {t("loginCta")}
          </Link>
        </div>
      </div>
    );
  }

  const creator = await getOwnedCreator(user.id, locale);
  if (!creator) {
    // Ingen ejet profil ⇒ ansøgningssiden (viser selv dens status).
    // redirect er typet til void, så et ekstra return sikrer indsnævring.
    return redirect({ href: "/creator/apply", locale });
  }

  const [films, country, tal] = await Promise.all([
    getCreatorFilmsIncludingDrafts(creator.handle, locale),
    localizedCountry(creator.country, locale),
    // Reelle tal til "Dine tal" — null (RPC-fejl/migration ikke
    // kørt) udelader sektionen helt, så studiet altid virker
    getCreatorTal(creator.handle),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <SectionHeading
        eyebrow={t("eyebrow")}
        title={creator.name}
        subtitle={`@${creator.handle} · ${country}`}
      />

      <section className="mt-12">
        <h2 className="font-display text-2xl text-bone">{t("uploadHeading")}</h2>
        <p className="mt-2 max-w-2xl text-sm text-ash">{t("uploadSubtitle")}</p>
        <div className="mt-5">
          <StudioUploadForm creatorHandle={creator.handle} />
        </div>
      </section>

      {tal && <StudioStatsSection tal={tal} />}

      <section className="mt-16">
        <h2 className="font-display text-2xl text-bone">{t("filmsHeading")}</h2>
        <div className="mt-5">
          <StudioFilmList films={films} />
        </div>
      </section>
    </div>
  );
}