/**
 * Sidens offentlige basis-URL. Sættes via NEXT_PUBLIC_SITE_URL i
 * .env.local (uden trailing slash, fx https://doccys.com) — indtil
 * da faldes der tilbage til localhost, så sitemap/OG-billeder
 * stadig fungerer i dev. .env.local er git-ignoreret, så værdien
 * følger MED i miljøet og ikke i koden.
 */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}