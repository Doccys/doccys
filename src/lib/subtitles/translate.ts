/**
 * Oversættelsestrinnet — gpt-4o-mini oversætter KUN tekst-strenge.
 *
 * Timings kommer aldrig igennem modellen: den modtager et JSON-
 * array af strenge og returnerer {"translations": [...]} med
 * PRÆCIS samme antal i samme rækkefølge. VTT'en bygges bagefter med
 * de danske tidsstempler, så et sprog kan aldrig skride.
 */
import { getOpenAiApiKey, OPENAI_API_BASE } from "@/lib/openai/client";

/** Kort nok til at være tryg ved gpt-4o-mini's kontekst-vindue. */
const CHUNK_SIZE = 200;

interface ChatResponse {
  choices?: Array<{
    message?: { content?: string };
  }>;
}

/**
 * Oversætter segment-tekster til `targetLanguage` (fx "English").
 * Lange film deles i chúnks à 200 segmenter, så ét stort kald
 * aldrig sprænger kontekst-vinduet — og et enkelt chunk kan fejle
 * uden at tage de færdige sprog med sig.
 */
export async function translateSegmentTexts(
  texts: string[],
  targetLanguage: string,
): Promise<string[]> {
  const translations: string[] = [];

  for (let offset = 0; offset < texts.length; offset += CHUNK_SIZE) {
    const chunk = texts.slice(offset, offset + CHUNK_SIZE);
    translations.push(...(await translateChunk(chunk, targetLanguage)));
  }

  return translations;
}

async function translateChunk(
  texts: string[],
  targetLanguage: string,
): Promise<string[]> {
  const res = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getOpenAiApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "Du er en professionel undertekstoversætter.",
            `Oversæt hver tekststreng til naturlig, talt ${targetLanguage}.`,
            "Bevar betydningen og den omtrentlige længde — undertekster skal kunne læses i sekunder.",
            "Svar KUN med JSON på formen",
            '{"translations": ["...", "..."]}',
            "med PRÆCIS lige så mange oversættelser som input, i samme rækkefølge.",
            "Gentag en tom streng som en tom streng.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({ texts }),
        },
      ],
    }),
    signal: AbortSignal.timeout(5 * 60 * 1000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `OpenAI-oversættelsen fejlede (${res.status})${detail ? `: ${detail.slice(0, 300)}` : "."}`,
    );
  }

  const data = (await res.json()) as ChatResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI-oversættelsen returnerede et tomt svar.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("OpenAI-oversættelsen returnerede ugyldig JSON.");
  }

  const translations = (parsed as { translations?: unknown }).translations;
  if (
    !Array.isArray(translations) ||
    translations.length !== texts.length ||
    translations.some((t) => typeof t !== "string")
  ) {
    throw new Error(
      `OpenAI-oversættelsen returnerede ${Array.isArray(translations) ? translations.length : 0} strenge — ventede ${texts.length}.`,
    );
  }

  return translations as string[];
}