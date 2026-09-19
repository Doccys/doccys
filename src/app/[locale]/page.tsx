import { getTranslations, setRequestLocale } from "next-intl/server";
import HeroBanner from "@/components/home/HeroBanner";
import DocumentaryGrid from "@/components/documentary/DocumentaryGrid";
import SectionHeading from "@/components/ui/SectionHeading";
import { getDocumentaries } from "@/lib/data/catalog";

const FEATURE_KEYS = ["noAds", "payPerMinute", "community"] as const;

interface HomePageProps {
  params: Promise<{ locale: string }>;
}

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("home");
  const documentaries = await getDocumentaries(locale);
  const [featured, ...rest] = documentaries;

  return (
    <div>
      {featured && <HeroBanner documentary={featured} />}

      <section className="mx-auto max-w-6xl px-6 py-16">
        <SectionHeading
          eyebrow={t("catalog.eyebrow")}
          title={t("catalog.title")}
          subtitle={t("catalog.subtitle")}
        />
        <div className="mt-10">
          <DocumentaryGrid documentaries={rest} />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-8">
        <SectionHeading eyebrow={t("how.eyebrow")} title={t("how.title")} />
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {FEATURE_KEYS.map((key) => (
            <div
              key={key}
              className="rounded-xl border border-smoke bg-onyx p-6"
            >
              <h3 className="font-display text-xl text-champagne">
                {t(`features.${key}.title`)}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-ash">
                {t(`features.${key}.body`)}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}