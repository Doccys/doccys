import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import LegalPage from "@/components/legal/LegalPage";

interface PrivacyPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: PrivacyPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal.privacy" });
  return { title: t("title") };
}

/** Privatlivspolitik — hvilke data, formål, tredjeparter, rettigheder. */
export default async function PrivacyPage({ params }: PrivacyPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <LegalPage
      namespace="privacy"
      sections={["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9"]}
    />
  );
}