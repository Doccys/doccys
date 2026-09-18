/**
 * VTT-byggeren — ren funktion uden netværk eller filsystem.
 *
 * Whisper's segmenter (start/end/text) bliver til en WebVTT-fil.
 * Timings kommer ALTID fra den danske transskription; oversættelser
 * (translate.ts) leverer kun tekst-strenge, så et sprog kan aldrig
 * komme ud af sync med de andre.
 */

/** Et transskriptionsssegment fra whisper (sekunder, rå tekst). */
export interface SubtitleSegment {
  start: number;
  end: number;
  text: string;
}

/** Sekunder → "HH:MM:SS.mmm" (WebVTT kræver altid timer og ms). */
export function vttTimestamp(seconds: number): string {
  const total = Math.max(0, seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = Math.floor(total % 60);
  const ms = Math.round((total - Math.floor(total)) * 1000);
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}.${pad(ms, 3)}`;
}

/** Cue-tekst er markup — & < > escapes altid. */
export function escapeVttText(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * Deler teksten i højst 2 linjer à højst ~42 tegn (læsevenligt på
 * smalle skærme). Klippepunktet ligger på en ordgrænse tættest på
 * midten; korte tekster der allerede passer, returneres uændret.
 */
export function wrapVttLines(text: string, maxCharsPerLine = 42): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= maxCharsPerLine) return [clean];

  const words = clean.split(" ");
  const middle = clean.length / 2;
  let bestIndex = 0;
  let bestDistance = Infinity;
  let chars = 0;
  for (let i = 0; i < words.length - 1; i++) {
    chars += words[i].length + 1;
    const distance = Math.abs(chars - middle);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i + 1;
    }
  }

  const line1 = words.slice(0, bestIndex).join(" ");
  const line2 = words.slice(bestIndex).join(" ");

  // En enkelt linje kan stadig være for lang (ét langt ord osv.) —
  // acceptér det: VTT har ingen hård grænse, kun læsevenligheden.
  if (!line2) return [line1];
  return [line1, line2];
}

/**
 * Bygger hele VTT-filen fra segmenter. Tomme og tidsmæssigt
 * ugyldige segmenter frasorteres, så pipelinen aldrig skriver en
 * cue med negativ eller nul-længde.
 */
export function buildVtt(segments: SubtitleSegment[]): string {
  const cues = segments
    .map((segment) => ({ ...segment, text: segment.text.trim() }))
    .filter(
      (segment) =>
        segment.text.length > 0 &&
        Number.isFinite(segment.start) &&
        Number.isFinite(segment.end) &&
        segment.end > segment.start,
    )
    .map((segment) => {
      const lines = wrapVttLines(escapeVttText(segment.text));
      return [
        `${vttTimestamp(segment.start)} --> ${vttTimestamp(segment.end)}`,
        lines.join("\n"),
      ].join("\n");
    });

  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}