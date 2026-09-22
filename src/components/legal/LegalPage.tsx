import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

interface LegalPageProps {
  /** Namespace under "legal" i messages-filerne. */
  namespace: "contact" | "terms" | "privacy";
  /** Sektions-nøgler i rækkefølge (s1, s2, …). */
  sections: readonly string[];
}

/**
 * Fælles layout for de tre juridiske sider (Kontakt,
 * Handelsbetingelser, Privatlivspolitik). Al tekst ligger i
 * messages-filerne under legal.{namespace} — koden her ved kun,
 * hvordan den skal rendres.
 *
 * Body-tekster er én JSON-streng pr. sektion: linjeskift (\n) bliver
 * til afsnit, og linjer der starter med "• " samles i en punktliste.
 */
export default async function LegalPage({ namespace, sections }: LegalPageProps) {
  const t = await getTranslations(`legal.${namespace}`);

  const renderBody = (body: string): ReactNode[] => {
    const nodes: ReactNode[] = [];
    let bullets: string[] = [];
    const flushBullets = () => {
      if (bullets.length === 0) return;
      nodes.push(
        <ul key={`ul-${nodes.length}`} className="mt-4 list-disc space-y-1.5 pl-5">
          {bullets.map((item, i) => (
            <li key={i} className="leading-relaxed text-bone/80">
              {item}
            </li>
          ))}
        </ul>,
      );
      bullets = [];
    };
    body.split("\n").forEach((line, i) => {
      if (line.startsWith("• ")) {
        bullets.push(line.slice(2));
        return;
      }
      flushBullets();
      if (line.trim()) {
        nodes.push(
          <p key={i} className="mt-4 leading-relaxed text-bone/80">
            {line}
          </p>,
        );
      }
    });
    flushBullets();
    return nodes;
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 sm:py-20">
      <h1 className="font-display text-3xl text-bone sm:text-4xl">{t("title")}</h1>
      <p className="mt-4 leading-relaxed text-ash">{t("intro")}</p>
      {sections.map((key) => (
        <section key={key} className="mt-12">
          <h2 className="font-display text-2xl text-champagne">
            {t(`sections.${key}.title`)}
          </h2>
          {renderBody(t(`sections.${key}.body`))}
        </section>
      ))}
    </div>
  );
}