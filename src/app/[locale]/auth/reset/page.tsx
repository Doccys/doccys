import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("resetTitle") };
}

/**
 * Password-reset — one card handles both phases (request link +
 * choose new password; see ResetPasswordForm). Reachable under every
 * locale: /da/auth/reset, /en/auth/reset, …
 */
export default function ResetPasswordPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-12 sm:py-20">
      <ResetPasswordForm />
    </div>
  );
}