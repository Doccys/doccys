/**
 * ffmpeg-binary-opløsning (15/11): ffmpeg-static's index.js beregner
 * binary-stien fra sit EGET __dirname — men i Vercel's lambda er
 * modulets JS fladpakket ind i rutens mappe (.next/server/app/…),
 * hvorimod outputFileTracingIncludes kopierer binæren til projekt-
 * relative node_modules-stien (/var/task/node_modules/ffmpeg-static/…
 * — server-verificeret: binæren findes der, 79,8 MB). Derfor: SØG
 * efter binæren på kendte kandidater i stedet for at stole på
 * modulet; fald tilbage til modulet's sti hvis ingen findes.
 */
import { existsSync } from "node:fs";
import path from "node:path";

import ffmpegPath from "ffmpeg-static";

export function findFfmpegBinary(): string {
  const bases = [
    process.cwd(),
    "/var/task",
    path.dirname(ffmpegPath as string),
  ];
  const navne = process.platform === "win32"
    ? ["ffmpeg.exe", "ffmpeg"]
    : ["ffmpeg", "ffmpeg.exe"];
  for (const base of bases) {
    for (const navn of navne) {
      for (const mellempunkt of ["node_modules/ffmpeg-static", "ffmpeg-static"]) {
        const sti = path.join(base, mellempunkt, navn);
        if (existsSync(sti)) return sti;
      }
    }
  }
  // sidste fald-bag: modulet's egen beregnede sti (virker lokalt)
  return ffmpegPath as string;
}
