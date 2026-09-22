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
 * NB: CVR/erhvervsfelter er bevidst markeret "oplyses ved lancering";
 * teksterne skal have et endeligt juridisk eftersyn før lancering.
 */
export default async function TermsPage({ params }: TermsPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <LegalPage
      namespace="terms"
      sections={["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10"]}
    />
  );
}