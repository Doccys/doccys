/**
 * Adgangskode-politikken — ÉN kilde til begge fejl-led.
 *
 * Baggrund (21/11): en sammensat regel er reelt aktiv server-side
 * (brugerens gemte Supabase-indstilling: "Lowercase, uppercase letters,
 * digits and symbols … will be rejected as weak" — generateLink afviser).
 * Uden klient/server-tjek her var svaret kun "mindst 8 tegn" — vild-
 * ledende, fordi en 8-tegns-adgangskode uden stort bogstav også fejler.
 *
 * Kategorier matcher Supabase' regelsæt 1:1 (lille bogstav, STORT
 * bogstav, tal, symbol). Unicode-properti-udtryk, så æ/ø/å tæller som
 * små bogstaver (da-lokalenens brugere skal ikke opfinde engelske kode-
 * ord). HIBP-lækket-tjekket (lib/auth/leaked.ts) røres ikke.
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72; // bcrypt-grænsen

export type AdgangskodeFejl = "laengde" | "sammensaetning";

/** null = adgangskoden opfylder politikken. */
export function adgangskodeFejl(password: string): AdgangskodeFejl | null {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return "laengde";
  }
  const harLille = /\p{Ll}/u.test(password);
  const harStort = /\p{Lu}/u.test(password);
  const harTal = /\p{Nd}/u.test(password);
  // Symbol = ikke-bogstav og ikke-tal (æøå er bogstaver, ikke symboler).
  const harSymbol = /[^\p{L}\p{Nd}]/u.test(password);
  return harLille && harStort && harTal && harSymbol
    ? null
    : "sammensaetning";
}
