/**
 * OpenAI-adgang — server-side kun.
 *
 * OPENAI_API_KEY hentes fra .env.local (platform.openai.com →
 * API keys). Nøglen må ALDRIG udsættes til klienten (intet
 * NEXT_PUBLIC_) — undertekst-pipelinen kører udelukkende i
 * API-ruter. Der er ingen SDK: pipelinen bruger rå fetch mod
 * api.openai.com, så vi ikke tilføjer en ny npm-afhængighed.
 */

/** Grund-URL til OpenAI-API'et — fastlagt så testen kan overskrive den. */
export const OPENAI_API_BASE =
  process.env.OPENAI_API_BASE ?? "https://api.openai.com/v1";

let cached: string | null = null;

/** OpenAI-nøglen. Fejler tydeligt hvis den mangler. */
export function getOpenAiApiKey(): string {
  if (cached) return cached;

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY mangler i .env.local — oprettes på platform.openai.com under API keys.",
    );
  }

  cached = key;
  return key;
}