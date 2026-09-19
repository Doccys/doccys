/**
 * Oversættelsestrinnet — gpt-4o-mini oversætter KUN tekst-strenge.
 *
 * Timings kommer aldrig igennem modellen: den modtager et NUMMERET
 * JSON-array og returnerer {"translations": [{"i": …, "text": …}]}
 * med ét objekt pr. input. Nummereringen er fejl-reserven: en lille
 * model taber af og til ét segment (to korte linjer smeltet sammen
 * til én oversættelse, eller én der glipper — set i praksis: 59
 * svar ved 60 inputs). Hvert chunk får derfor ét genforsøg, hvis
 * svaret ikke er et komplet, gyldigt 1:1-svar. VTT'en bygges
 * bagefter med kildens tidsstempler, så et sprog kan aldrig skride.
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
    // Ét genforsøg: antals-fejl er typisk ét segment der er smuttet
    // — andet forsøg rammer næsten altid.
    try {
      translations.push(...(await translateChunk(chunk, targetLanguage)));
    } catch {
      translations.push(...(await translateChunk(chunk, targetLanguage)));
    }
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
            '{"translations": [{"i": 0, "text": "..."}]}',
            "med PRÆCIS ét objekt pr. input: samme numre som inputtet, aldrig færre, aldrig flere, aldrig sammenflettede.",
            "Gentag en tom streng som en tom streng.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            texts: texts.map((text, i) => ({ i, text })),
          }),
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
  if (!Array.isArray(translations)) {
    throw new Error("OpenAI-oversættelsen returnerede ikke en liste.");
  }

  // Én gyldig oversættelse pr. input-nummer — dubletter, numre udenfor
  // rækkevidde og ikke-strenge afvises, så svaret kan stole på 1:1.
  const byIndex = new Map<number, string>();
  for (const entry of translations) {
    if (typeof entry !== "object" || entry === null) {
      throw new Error("OpenAI-oversættelsen returnerede et ugyldigt element.");
    }
    const { i, text } = entry as { i?: unknown; text?: unknown };
    if (
      !Number.isInteger(i) ||
      (i as number) < 0 ||
      (i as number) >= texts.length ||
      typeof text !== "string" ||
      byIndex.has(i as number)
    ) {
      throw new Error("OpenAI-oversættelsen returnerede et ugyldigt element.");
    }
    byIndex.set(i as number, text);
  }

  if (byIndex.size !== texts.length) {
    throw new Error(
      `OpenAI-oversættelsen returnerede ${byIndex.size} strenge — ventede ${texts.length}.`,
    );
  }

  return texts.map((_, i) => byIndex.get(i) as string);
}