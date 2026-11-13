import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import LegalPage from "@/components/legal/LegalPage";

interface TermsPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: TermsPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal.terms" });
  return { title: t("title") };
}

/**
 * Handelsbetingelser — fuld tekst, der følger med i alle sprog.
 * CVR-nr 46804147 er udfyldt i s1 (Doccys, 29/9 2026); teksterne
 * skal stadig have et endeligt juridisk eftersyn før lancering.
 */
export default async function TermsPage({ params }: TermsPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  // s11 = licensklausulen for skabere (accepteres pr. film ved upload
  // i studiet — jf. 20260923_film_licens.sql)
  // s12 = aldersgrænse 18+ (bekræftes ved kontoprettelse — jf.
  // AuthForm + /api/auth/signup, bevis i raw_user_meta_data)
  // s13 = valuta: "$" betyder USD og prisen er inkl. lokal moms
  // (USD-skiftet + prismatchen 13/11 2026 — s4 rettet samtidig)
  return (
    <LegalPage
      namespace="terms"
      sections={["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10", "s11", "s12", "s13"]}
    />
  );
}