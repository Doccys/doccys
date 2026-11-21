/**
 * Turnstile-verifikation (app-niveau CAPTCHA) på de auth-ruter der
 * sender mail: signup + password-reset.
 *
 * Baggrund (21/11): signup- og reset-ruterne sender mailen via admin-
 * API'en og omgår dermed Supabases egen auth-limiter/CAPTCHA — app-
 * niveauet er den reelle spærring. Supabase-dashboardets CAPTCHA-
 * toggle forbliver FRA (den ville afvise alle signInWithPassword-
 * logins, hvis frontend ikke sender token); i stedet verificerer
 * VORES ruter et Cloudflare-Turnstile-token (gratis, usynlig).
 *
 * Configuration-gate: featuren er kun til, når BEGGE nøgler er sat
 * (NEXT_PUBLIC_TURNSTILE_SITE_KEY + TURNSTILE_SECRET_KEY). Uden
 * nøgler opfører ruterne og formularen sig præcis som før — så
 * deployet kan ligge på plads, og nøglerne tændes bagefter via
 * Vercel-env uden kode-åndringer.
 */

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
const turnstileSecret = process.env.TURNSTILE_SECRET_KEY || "";

/** true = widget gengives på formularen og ruterne kræver token. */
export const turnstileEnabled = Boolean(turnstileSiteKey && turnstileSecret);

/**
 * Verificér et Turnstile-token mod Cloudflare (engangs-token).
 * Når featuren er fra (ingen secret), altid true — failopen ved
 * fravær af konfiguration; når den er til, er manglende/ugyldigt
 * token = false.
 */
export async function turnstileGodkendt(
  token: unknown,
  ip?: string,
): Promise<boolean> {
  if (!turnstileSecret) return true;
  if (typeof token !== "string" || token.length === 0) return false;
  try {
    const form = new URLSearchParams({ secret: turnstileSecret, response: token });
    if (ip) form.set("remoteip", ip);
    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form,
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    // Cloudflare utilgængelig/lad op: afvis (engangs-angrebssikringen
    // må ikke failoopen "til" under angreb — featuren er bevidst til).
    return false;
  }
}
