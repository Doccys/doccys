/** DIAGNOSTIK (15/11): viser om ffmpeg-static-binæren er trace'et
 *  ind i DÉNTE deployment — path/exists/dir-listing, ingen hemmelig-
 *  heder. Slettes når trace-nøglen er fundet til trailer/undertekster. */
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import ffmpegPath from "ffmpeg-static";

export const dynamic = "force-dynamic";

export async function GET() {
  const resolved = ffmpegPath as unknown as string;
  const retning = path.dirname(resolved);
  const listet = existsSync(retning)
    ? readdirSync(retning)
        .filter((f) => f.includes("ffmpeg"))
        .map((f) => `${f} (${statSync(path.join(retning, f)).size} B)`)
    : ["<dir findes ikke>"];
  return Response.json({
    ffmpegPath: resolved,
    exists: existsSync(resolved),
    retning,
    listet,
    cwd: process.cwd(),
  });
}
