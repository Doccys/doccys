import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import ConfirmEmailClient from "@/components/auth/ConfirmEmailClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("confirmTitle") };
}

/**
 * Bekræftelses-landing for signup-mailen (/da/auth/confirm?code=…).
 * Kortet veksler koden på klienten og sender brugeren videre til
 * profilen — se ConfirmEmailClient. Reachable under every locale:
 * /da/auth/confirm, /en/auth/confirm, …
 */
export default function ConfirmEmailPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-12 sm:py-20">
      <ConfirmEmailClient />
    </div>
  );
}