import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // Fremtidig: billed-domæner til plakater/thumbnails konfigureres her,
  // når CDN og asset-hosting kobles på (images.remotePatterns).
};

export default withNextIntl(nextConfig);