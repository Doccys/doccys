import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import SectionHeading from "@/components/ui/SectionHeading";
import KlubWall from "@/components/klub/KlubWall";
import { createClient } from "@/lib/supabase/server";
import {
  getKlubMedlemskab,
  getKlubIndlaeg,
  getKlubTaeler,
} from "@/lib/data/klub";

export const metadata: Metadata = { title: "Klubstuen" };

interface KlubPageProps {
  params: Promise<{ locale: string }>;
}

/**
 * Klubstuen — Legende-gaven. Døren afgøres af er_klub_medlem (RLS'erens
 * sandhed — security definer over seer_flair.tier = 3). Alle under
 * Legende ser den låste dør med de OFFENTLIGE tæller-tal (klub_taeler —
 * på fælles-aggregatniveau, som film_faedighedsstats; intet navne- eller
 * indholdsglimt bag døren). Migrations-huller (pre-migration) viser bare
 * en lukket dør uden tal — koden fejler pænt.
 */
export default async function KlubPage({ params }: KlubPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("klub");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [erMedlem, taeler] = await Promise.all([
    user ? getKlubMedlemskab(user.id) : Promise.resolve(false),
    getKlubTaeler(),
  ]);

  const startIndlaeg = erMedlem ? await getKlubIndlaeg() : [];

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <SectionHeading
        eyebrow={erMedlem ? t("membershipNote") : t("lockLabel")}
        title={t("heading")}
        subtitle={t("subtitle")}
      />

      {erMedlem ? (
        <KlubWall userId={user!.id} initialPosts={startIndlaeg} />
      ) : (
        <div className="mt-10 rounded-xl border border-champagne/30 bg-onyx px-6 py-8 text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-smoke px-4 py-1.5 text-xs uppercase tracking-[0.3em] text-ash">
            🔒 {t("lockLabel")}
          </p>
          <h2 className="mt-4 font-display text-2xl text-champagne">
            {t("doorTitle")}
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ash">
            {t("doorIntro")}
          </p>

          {/* Tællerne (offentlige RPC-tal): skjult når null (pre-migration
              eller datalag-fejl) — døren lever også uden tallene. */}
          {taeler && (
            <p className="mt-5 text-sm text-bone/80">
              {t("doorMembers", { count: taeler.medlemmer })}
              {taeler.indlaeg > 0 &&
                ` · ${t("doorPosts", { count: taeler.indlaeg })}`}
            </p>
          )}

          <p className="mt-3 inline-block rounded-full border border-champagne/50 px-4 py-1.5 text-xs font-medium text-champagne">
            {t("doorRequirement")}
          </p>

          <div className="mt-6">
            {/* Gæst → login; indlogget under Legende → profilen (status
                kortet viser vejen til Legende). */}
            <Link
              href={user ? "/profile" : "/login"}
              className="rounded-full border border-champagne/60 px-6 py-2.5 text-xs font-medium tracking-wide text-champagne transition-colors hover:bg-champagne hover:text-noir"
            >
              {user ? t("ctaProfile") : t("ctaLogin")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
