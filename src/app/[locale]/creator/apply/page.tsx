import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import SectionHeading from "@/components/ui/SectionHeading";
import CreatorApplicationForm from "@/components/creator/CreatorApplicationForm";
import { createClient } from "@/lib/supabase/server";
import { getMyApplication } from "@/lib/data/catalog";

export const metadata: Metadata = { title: "Bliv skaber" };

interface ApplyPageProps {
  params: Promise<{ locale: string }>;
}

/**
 * Ansøgning om at blive skaber. Identiteten læses server-side fra
 * sessionen; ansøgningen (status: pending/approved/rejected) vises
 * og redigeres i CreatorApplicationForm — selve skrivningen går
 * direkte gennem browser-klienten, hvor RLS tvinger identitet og
 * status-maskinen (jævnfør SaveFilmButton-mønsteret).
 */
export default async function CreatorApplyPage({ params }: ApplyPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("creatorApply");
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

  const application = await getMyApplication(user.id);

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <SectionHeading
        eyebrow={t("eyebrow")}
        title={t("title")}
        subtitle={t("subtitle")}
      />
      <div className="mt-10">
        <CreatorApplicationForm application={application} />
      </div>
    </div>
  );
}