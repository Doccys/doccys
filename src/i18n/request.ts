import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

/**
 * Server-side request-konfiguration: loader oversættelserne for det
 * sprog, som middleware'en har fastlagt ud fra URL'en. Ukendte sprog
 * falder tilbage til standardsproget (dansk).
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale =
    requested &&
    routing.locales.includes(requested as (typeof routing.locales)[number])
      ? requested
      : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});