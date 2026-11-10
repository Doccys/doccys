/**
 * Delt brand-hoved for OG-PNG'erne (/og/film, /og/visitkort) — satori-
 * kompatibel JSX (plain divs + inline SVG, som app-icons viser er
 * OK; gradients er udykket — marken er flad champagne).
 *
 * Venstre: objektivring + play-triangel (DoccysMark-motivet, samme
 * tegning som app-icons) + DOCCYS-ordmærket. Højre: doccys.com
 * (fast marketing-tekst — ikke siteUrl(), som er localhost i dev).
 */

const CHAMPAGNE = "#d4b678";
const ASH = "#9a9aa8";
const BRAND_DOMAIN = "doccys.com";

export default function OgBrand({ markSize = 60 }: { markSize?: number }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        <svg
          viewBox="0 0 32 32"
          width={markSize}
          height={markSize}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* objektivringen */}
          <circle cx="16" cy="16" r="12.5" stroke={CHAMPAGNE} strokeWidth="2" />
          {/* play-trianglen (se DoccysMark) */}
          <path
            d="M13 10 L22.6 16 L13 22 Z"
            fill={CHAMPAGNE}
            stroke={CHAMPAGNE}
            strokeWidth="1"
            strokeLinejoin="round"
          />
        </svg>
        <div
          style={{
            color: CHAMPAGNE,
            fontSize: 34,
            fontWeight: 700,
            letterSpacing: 14,
          }}
        >
          DOCCYS
        </div>
      </div>
      <div style={{ color: ASH, fontSize: 24, letterSpacing: 6 }}>
        {BRAND_DOMAIN}
      </div>
    </div>
  );
}
