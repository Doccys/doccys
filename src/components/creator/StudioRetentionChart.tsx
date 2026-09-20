import { getTranslations } from "next-intl/server";
import type { FilmRetention } from "@/lib/types";

/**
 * Retention-graf pr. decil — håndbygget ren SVG (server-komponent,
 * ingen "use client", intet chart-bibliotek): 10 lodrette søjler,
 * én pr. decil (10 % … 100 %), hvor søjlehøjden er andelen af de
 * afsluttede afspilninger der nåede så langt. Farver følger
 * paletten i globals.css: champagne #d4b678, smoke #1e1e26.
 * <title> pr. søjle giver hover- og skærmlæser-tekst.
 */
const CHAMPAGNE = "#d4b678";
const SMOKE = "#1e1e26";
const ASH = "#8a8a93";

// viewBox-geometri: luft til værdi-mærker ovenover og
// decil-mærkater nedenunder
const W = 520;
const H = 240;
const PAD_X = 14;
const PAD_TOP = 26;
const PAD_BOTTOM = 30;
const CHART_H = H - PAD_TOP - PAD_BOTTOM;

export default async function StudioRetentionChart({
  retention,
}: {
  retention: FilmRetention;
}) {
  const t = await getTranslations("creatorStudio");
  const bars = retention.deciles;
  const slot = (W - PAD_X * 2) / Math.max(1, bars.length);
  const barW = slot * 0.6;

  const yFor = (pct: number) => PAD_TOP + CHART_H * (1 - pct / 100);

  return (
    <div className="mt-3 max-w-xl">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        className="w-full rounded-lg border border-smoke"
      >
        <title>{t("retentionHeading")}</title>

        {/* diskrete hjælpelinjer ved 100 / 50 / 0 % */}
        {[100, 50, 0].map((pct) => (
          <line
            key={pct}
            x1={PAD_X}
            x2={W - PAD_X}
            y1={yFor(pct)}
            y2={yFor(pct)}
            stroke={SMOKE}
            strokeWidth={pct === 0 ? 1.5 : 1}
          />
        ))}

        {bars.map((pct, i) => {
          const x = PAD_X + slot * i + (slot - barW) / 2;
          const h = (CHART_H * pct) / 100;
          const y = yFor(pct);
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(h, 0.5)}
                rx={2}
                fill={CHAMPAGNE}
              >
                <title>{`${(i + 1) * 10} %: ${pct} %`}</title>
              </rect>
              {/* værdi-mærkat over søjlen */}
              <text
                x={x + barW / 2}
                y={y - 5}
                textAnchor="middle"
                fontSize="9"
                fill={ASH}
              >
                {pct}
              </text>
              {/* decil-mærkat under søjlen (10 %, 20 %, …) */}
              <text
                x={x + barW / 2}
                y={H - 10}
                textAnchor="middle"
                fontSize="9"
                fill={ASH}
              >
                {(i + 1) * 10} %
              </text>
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-xs text-ash/70">
        {t("retentionSessions", { count: retention.sessions })}
      </p>
    </div>
  );
}