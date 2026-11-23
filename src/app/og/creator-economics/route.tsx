import { ImageResponse } from "next/og";
import OgBrand from "@/components/og/OgBrand";

/**
 * Kandidat-card til reklame-siderne (23/11):
 *   /og/creator-economics          → "The long-term math"
 *   /og/creator-economics?film=1   → "Watch in 55 seconds"
 *
 * Statiske 1200×630 PNG'er til X/LinkedIn/FB link-cards på
 * public/reklame-siderne (som ikke er Next-sider med metadata).
 * summary_large_image kræver ingen domænegodkendelse hos X
 * (det gør KUN video-player-cards — dem bruger vi ikke her).
 * Ingen data-tjek nødvendigt — teksten er statisk, revalidate 1 dag.
 */
export const revalidate = 86400;

const NOIR = "#0a0a0c";
const ASH = "#8f8a80";
const BONE = "#ece7dd";
const CHAMPAGNE = "#d8b56d";

const VARIANTS = {
  economics: {
    title: "The long-term math",
    sub: "$0.30 per 100 watched minutes · 30M min ≈ $90,000",
    accent: "Doccys for filmmakers",
  },
  film: {
    title: "Watch in 55 seconds",
    sub: "Paid per watched minute · 13 languages · non-exclusive",
    accent: "Doccys for filmmakers",
  },
} as const;

type VariantKey = keyof typeof VARIANTS;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const variant: VariantKey = url.searchParams.has("film") ? "film" : "economics";
  const v = VARIANTS[variant];

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 56,
        background: `radial-gradient(120% 140% at 15% 0%, #1a1a20 0%, ${NOIR} 60%)`,
      }}
    >
      <OgBrand />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          backgroundColor: "rgba(19, 19, 22, 0.9)",
          border: `2px solid ${CHAMPAGNE}`,
          borderRadius: 24,
          padding: 40,
          width: "100%",
        }}
      >
        <div style={{ color: ASH, fontSize: 24, letterSpacing: 4 }}>
          {v.accent.toUpperCase()}
        </div>
        <div
          style={{
            color: BONE,
            fontSize: 62,
            fontWeight: 700,
            lineHeight: 1.12,
            marginTop: 12,
          }}
        >
          {v.title}
        </div>
        <div style={{ color: CHAMPAGNE, fontSize: 28, marginTop: 14 }}>
          {v.sub}
        </div>
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
}
