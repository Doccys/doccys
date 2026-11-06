import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/**
 * MIDLERTIDIG rekrutteringsbanner øverst på forsiden — siten har (endnu)
 * ingen film, og lanceringen rekrutterer skabere i første række (Mexico-
 * fasen: nye AI-talenter, solo/filmstuderende/hobbyister). Slet den
 * her linke-linje i page.tsx + denne fil, når kataloget har film —
 * ingen anden kode afhænger af banneret.
 */
export default async function CreatorRecruitmentBanner() {
  const t = await getTranslations("home.recruitment");

  return (
    <div className="border-b border-smoke/60 bg-onyx">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-champagne">
            {t("eyebrow")}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ash sm:max-w-2xl">
            {t("body")}
          </p>
        </div>
        <Link
          href="/creator/apply"
          className="shrink-0 rounded-md border border-champagne bg-champagne px-5 py-2.5 text-sm font-medium text-noir transition-opacity hover:opacity-90"
        >
          {t("cta")}
        </Link>
      </div>
    </div>
  );
}
