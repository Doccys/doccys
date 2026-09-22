import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import LegalPage from "@/components/legal/LegalPage";

interface ContactPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: ContactPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal.contact" });
  return { title: t("title") };
}

/** Kontakt-side: e-mail, hvad man kan skrive om, svartid. */
export default async function ContactPage({ params }: ContactPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <LegalPage namespace="contact" sections={["s1", "s2", "s3"]} />;
}