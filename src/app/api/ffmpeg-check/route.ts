/** DIAGNOSTIK (15/11): viser hvor ffmpeg-static-binæren reelt er trace'et
 *  ind i DÉT deployment — kandidat-stier + dir-listings, ingen hemmelig-
 *  heder. Slettes når kandidat-løsningen er fundet til trailer/under-
 *  tekster. */
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import ffmpegPath from "ffmpeg-static";

export const dynamic = "force-dynamic";

export async function GET() {
  const resolved = ffmpegPath as unknown as string;
  const eksponenter = [
    process.cwd(),
    path.join(process.cwd(), ".."),
    "/var/task",
    path.dirname(resolved),
  ];
  const kandidater = eksponenter.flatMap((base) => [
    path.join(base, "node_modules/ffmpeg-static/ffmpeg"),
    path.join(base, "node_modules/ffmpeg-static/ffmpeg.exe"),
    path.join(base, "ffmpeg-static/ffmpeg"),
  ]);
  const kandidatStatus = kandidater.map((sti) => ({
    sti,
    findes: existsSync(sti),
  }));
  const binær = kandidater.find((sti) => existsSync(sti)) ?? null;

  const listninger = eksponenter
    .filter((base) => existsSync(path.join(base, "node_modules/ffmpeg-static")))
    .map(
      (base) =>
        base +
        " → " +
        readdirSync(path.join(base, "node_modules/ffmpeg-static"))
          .filter((f) => f.includes("ffmpeg"))
          .map(
            (f) =>
              `${f} (${statSync(path.join(base, "node_modules/ffmpeg-static", f)).size} B)`,
          )
          .join(", "),
    );

  return Response.json({
    resolvet: resolved,
    binær,
    kandidatStatus,
    listninger,
    cwd: process.cwd(),
  });
}
