import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // Dev-serverens cross-origin-beskyttelse (Next 15.2+) afviser ellers
  // requests via midlertidige tunnels (test-URL'er til fx udlandet-
  // tjek af valuta-visningen) — trycloudflare er whitelisted her;
  // påvirker KUN dev, aldrig produktion.
  allowedDevOrigins: ["*.trycloudflare.com"],
  // Fremtidig: billed-domæner til plakater/thumbnails konfigureres her,
  // når CDN og asset-hosting kobles på (images.remotePatterns).
};

export default withNextIntl(nextConfig);