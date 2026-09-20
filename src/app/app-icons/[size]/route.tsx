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
        {/* Den seksbladede blænde — roterede akkorder i pinwheel-form
            som en reel iris (ingen krydsende trekanter — se DoccysMark) */}
        <path
          d="M18.89 11 L26.06 23.43 M13.11 11 L27.46 11 M10.22 16 L17.4 3.57 M13.11 21 L27.46 21 M18.89 21 L26.06 8.57 M21.78 16 L14.6 28.43"
          stroke={CHAMPAGNE}
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    </div>,
    { width: px, height: px },
  );
}