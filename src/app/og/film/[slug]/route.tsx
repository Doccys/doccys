import { ImageResponse } from "next/og";

/**
 * Auto-genereret Open Graph-billede pr. film:
 *   /og/film/{slug} → 1200×630 PNG
 *
 * Bruges af watch-sidens metadata, når filmen intet uploadet
 * plakatbillede har — ellers deler et link nemlig uden kort.
 * Baggrunden er filmens EGEN gradient (hex-koderne parses ud af
 * Tailwind-klassen), teksten står på et semi-transparent panel,
 * så den altid er læsbar uanset gradient.
 *
 * Data hentes direkte via PostgREST (anon, kun publicerede film)
 * — ikke via createClient, som rører cookies og ville gøre ruten
 * dynamisk i stedet for cachebar (revalidate = 1 time).
 */
export const revalidate = 3600;

const NOIR = "#08080a";
const ASH = "#9a9aa8";
const BONE = "#efece5";
const CHAMPAGNE = "#d4b678";

/** hex-koderne ud af "from-[#0f2027] via-[#203a43] to-[#2c5364]" */
function gradientHexes(gradient: string): string[] {
  const hexes = gradient.match(/#[0-9a-fA-F]{6}/g);
  return hexes && hexes.length >= 2 ? hexes : [NOIR, "#16161c"];
}

interface FilmRow {
  title: string;
  year: number;
  duration_sec: number;
  gradient: string;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/documentaries` +
      `?select=title,year,duration_sec,gradient` +
      `&slug=eq.${encodeURIComponent(slug)}&status=eq.published`,
    {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" },
      next: { revalidate: 3600 },
    },
  );
  if (!res.ok) {
    return new Response("Ikke fundet", { status: 404 });
  }
  const films = (await res.json()) as FilmRow[];
  const film = films[0];
  if (!film) {
    return new Response("Ikke fundet", { status: 404 });
  }

  const hexes = gradientHexes(film.gradient);
  const bg =
    hexes.length >= 3
      ? `linear-gradient(135deg, ${hexes[0]}, ${hexes[Math.floor(hexes.length / 2)]}, ${hexes[hexes.length - 1]})`
      : `linear-gradient(135deg, ${hexes[0]}, ${hexes[1]})`;

  const durationMin = Math.round(film.duration_sec / 60);
  // NB: én samlet streng — flere tekst-children i samme div uden
  // display:flex får satori til at fejle (se ovenfor)
  const metaLine = `${film.year} · ${durationMin} min · DOCCYS`;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 56,
        background: bg,
      }}
    >
      <div style={{ display: "flex" }}>
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

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          backgroundColor: "rgba(8, 8, 10, 0.78)",
          borderRadius: 24,
          padding: 40,
          width: "100%",
        }}
      >
        <div
          style={{
            color: BONE,
            fontSize: 58,
            fontWeight: 700,
            lineHeight: 1.15,
          }}
        >
          {film.title}
        </div>
        <div style={{ color: ASH, fontSize: 26, marginTop: 14 }}>
          {metaLine}
        </div>
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
}