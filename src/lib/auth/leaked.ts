/**
 * Lækket-adgangskode-tjek (HaveIBeenPwned, k-anonymitet).
 *
 * Baggrund (21/11): Supabase' indbyggede "Leaked password protection"
 * er Pro-gated i dashboardet — platformen står på HEDEN-tier, så tjekket
 * lever i appen i stedet: k-anonymitet betyder, at kun de første 5 SHA-1-
 * tegn sendes af sted (aldrig selve adgangskoden), og API'et svarer med
 * alle hashes der deler præfikset. Fri, ingen nøgle.
 *
 * FAILOPEN: hvis API'et er utilgængeligt/langsomt returneres null og
 * brugeren slippes igennem — en teknisk fejl i et eksternt tjek må
 * aldrig blokere en ægte signup.
 */

const HIBP_BASE = "https://api.pwnedpasswords.com/range/";

/** Hex-kodning for Uint8Array (Web Crypto leverer bytes, ikke streng). */
function tilHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/**
 * true = adgangskoden kendes i lækkedatabasen · false = ikke lækket ·
 * null = tjekket kunne ikke gennemføres (failopen).
 */
export async function erLaegetAdgangskode(
  password: string,
): Promise<boolean | null> {
  try {
    if (password.length < 8) return false;
    const sha1 = tilHex(new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(password))));
    const praefiks = sha1.slice(0, 5);
    const rest = sha1.slice(5);

    const res = await fetch(`${HIBP_BASE}${praefiks}`, {
      // Stram tidsbudget — et langsomt tjek må aldrig hænge signup
      signal: AbortSignal.timeout(1500),
      headers: { "add-Padding": "true" },
      cache: "no-store",
    });
    if (!res.ok) return null;

    const body = await res.text();
    for (const line of body.split("\n")) {
      const [suffix, count] = line.trim().split(":");
      if (suffix === rest && Number(count) > 0) return true;
    }
    return false;
  } catch {
    return null;
  }
}
