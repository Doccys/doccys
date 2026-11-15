import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // Dev-serverens cross-origin-beskyttelse (Next 15.2+) afviser ellers
  // requests via midlertidige tunnels (test-URL'er til fx udlandet-
  // tjek af valuta-visningen) — trycloudflare er whitelisted her;
  // påvirker KUN dev, aldrig produktion.
  allowedDevOrigins: ["*.trycloudflare.com"],
  // ffmpeg-static's binær skal med i funktionens fil-trace (trailer-
  // klippet + undertekst-pipelinen spawn den; binæren lander på
  // /var/task/node_modules/ffmpeg-static/ffmpeg i lambdaen — server-
  // verificeret 15/11); spawn-len går via findFfmpegBinary
  // (src/lib/ffmpeg/binary.ts), da ffmpeg-static's __dirname misviser
  // i Vercel's lambda-fladpak.
  outputFileTracingIncludes: {
    "/api/films/[slug]/trailer": ["./node_modules/ffmpeg-static/**"],
    "/api/films/[slug]/subtitles": ["./node_modules/ffmpeg-static/**"],
  },
  // Fremtidig: billed-domæner til plakater/thumbnails konfigureres her,
  // når CDN og asset-hosting kobles på (images.remotePatterns).
};

export default withNextIntl(nextConfig);