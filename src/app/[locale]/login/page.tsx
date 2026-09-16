import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import AuthForm from "@/components/auth/AuthForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("loginTitle") };
}

/**
 * Login/registration page — a single card handles both modes
 * (see AuthForm). Reachable under every locale: /da/login, /en/login, …
 */
export default function LoginPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-12 sm:py-20">
      <AuthForm />
    </div>
  );
}