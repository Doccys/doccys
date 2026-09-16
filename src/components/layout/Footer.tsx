import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import DoccysMark from "@/components/logo/DoccysMark";

export default async function Footer() {
  const t = await getTranslations();
  const navT = await getTranslations("header.nav");

  return (
    <footer className="mt-24 border-t border-smoke/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 text-champagne">
          <DoccysMark className="h-6 w-6" />
          <span className="font-display text-sm tracking-[0.35em] text-bone">
            DOCCYS
          </span>
        </div>
        <p className="text-sm text-ash">{t("footer.tagline")}</p>
        <div className="flex gap-6 text-sm text-ash">
          <Link href="/creators" className="hover:text-bone">
            {navT("creators")}
          </Link>
          <Link href="/profile" className="hover:text-bone">
            {navT("profile")}
          </Link>
        </div>
      </div>
    </footer>
  );
}