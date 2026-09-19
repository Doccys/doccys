import type { Metadata, Viewport } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import "../globals.css";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ServiceWorkerRegister from "@/components/layout/ServiceWorkerRegister";

const display = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
});

const body = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    title: {
      default: t("title"),
      template: "%s — Doccys",
    },
    description: t("description"),
    // PWA-installation: manifestet gør siden "Føj til startskærm"-bar
    // (fuldskærm uden browser-chrome), appleWebApp gør det samme på
    // iOS, og ikonerne er /app-icons-ruten (brand-market på noir).
    applicationName: "Doccys",
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      title: "Doccys",
      statusBarStyle: "black-translucent",
    },
    icons: {
      icon: [{ url: "/app-icons/32", type: "image/png" }],
      apple: [{ url: "/app-icons/180" }],
    },
  };
}

// themeColor farver telefonens statuslinje (og browserens UI på
// mobil) i sidens egen noir — den hører til viewport i Next 15.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#08080a",
};

interface LocaleLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} className={`${display.variable} ${body.variable}`}>
      <body className="flex min-h-screen flex-col bg-noir font-body text-bone antialiased">
        {/* iOS: Next udsender kun 'mobile-web-app-capable' (Chromes
            variant), men Safari kræver den apple-præfikset meta for at
            starte i fuldskærm fra startskærmen. React 19 løfter
            metatagget op i <head> automatisk. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        {/* PWA: registrerer den minimale service worker (production
            kun) — den gør Chromes "Installér app"-prompt mulig. */}
        <ServiceWorkerRegister />
        <NextIntlClientProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}