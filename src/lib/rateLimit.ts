/**
 * Minimal in-memory rate limiting til API-ruter, der kan mail-bombes
 * (signup + password-nulstil). Admin-API'erne omgår Supabases egne
 * per-IP-limiter, så app-niveauet er den ENESTE beskyttelse — uden
 * denne er reset-ruten en åben dør til at fylde en fremmed indbakke.
 *
 * NB: mappen lever i server-processens hukommelse og NULSTILLES ved
 * genstart/cold start (og pr. serverless-instans hos Vercel). Accepteret
 * pragmatisk valg — intet dedikeret limiter-dep i dette projekt.
 */

/** timestamps for seneste forsøg pr. nøgle */
const hits = new Map<string, number[]>();
/** seneste afsendelsestidspunkt pr. e-mail (mail-cooldown) */
const sentAt = new Map<string, number>();

/**
 * Registrerer et forsøg på `key` og svarer om grænsen er overskredet:
 * maks. `limit` forsøg pr. `windowMs` millisekunder. Gamle timestamps
 * beskæres løbende, så mappen ikke vokser.
 */
export function hitRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((ts) => now - ts < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  return false;
}

/**
 * Har der lige været sendt en mail til denne adresse? Forhindrer, at
 * én indbakke bombes med identiske mails, selv inden for IP-grænsen
 * (fx mange forsøg fra forskellige adresser bag samme NAT).
 */
export function recentlySent(email: string, cooldownMs = 60_000): boolean {
  const last = sentAt.get(email);
  return last !== undefined && Date.now() - last < cooldownMs;
}

/** Markerer at en mail netop er sendt til adressen. */
export function markSent(email: string): void {
  sentAt.set(email, Date.now());
}