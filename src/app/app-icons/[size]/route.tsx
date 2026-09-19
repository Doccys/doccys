import { ImageResponse } from "next/og";

/**
 * Doccys' app-ikoner til PWA-installation ("Føj til startskærm"):
 *   /app-icons/32   → favicon (metadata.icons.icon)
 *   /app-icons/180  → apple-touch-icon (metadata.icons.apple)
 *   /app-icons/192  → manifest-ikon (Android)
 *   /app-icons/512  → manifest-ikon (Android / splash)
 *
 * Motivet er brand-market fra DoccysMark (objektivring + seksbladet
 * blænde), her tegnet med fast champagne-farve — satori (next/og)
 * tager ikke gradient-<defs> i SVG, så guld-gradienten er flad.
 * Ruten matcher ikke next-intl-middleware (se src/middleware.ts),
 * så ikonerne kan caches frit og er sprogløse.
 */
export const revalidate = 86400;

const NOIR = "#08080a";
const CHAMPAGNE = "#d4b678";

const SIZES = new Set([32, 180, 192, 512]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ size: string }> },
) {
  const { size } = await params;
  const px = Number.parseInt(size, 10);
  if (!Number.isInteger(px) || !SIZES.has(px)) {
    return new Response("Ugyldig størrelse", { status: 404 });
  }

  // Små ikoner (favicon) skal fylde mere af lærredet end de store,
  // ellers drukner market når browseren skalerer til 16px.
  const markSize = px <= 32 ? Math.round(px * 0.9) : Math.round(px * 0.64);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: NOIR,
      }}
    >
      <svg
        viewBox="0 0 32 32"
        width={markSize}
        height={markSize}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Objektivringen */}
        <circle cx="16" cy="16" r="12.5" stroke={CHAMPAGNE} strokeWidth="2" />
        {/* Den seksbladede blænde — bladene peger skråt ind mod midten */}
        <path
          d="M16 8 L9.07 20 M9.07 12 L16 24 M9.07 20 L22.93 20 M16 24 L22.93 12 M22.93 20 L16 8 M22.93 12 L9.07 12"
          stroke={CHAMPAGNE}
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    </div>,
    { width: px, height: px },
  );
}