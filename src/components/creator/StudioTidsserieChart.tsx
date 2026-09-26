import { getLocale, getTranslations } from "next-intl/server";
import type { CreatorTalDay } from "@/lib/types";
import { formatCurrency } from "@/lib/utils/format";

/**
 * Daglig indtjening de seneste 30 dage — håndbygget ren SVG
 * (server-komponent, intet chart-bibliotek), samme mønster som
 * StudioRetentionChart: champagne-søjler på smoke-hjælpelinjer,
 * <title> pr. søjle med dato + beløb. 0-dage tegnes som bittesmå
 * søjler — den flade kurve ER information (ingen gyldige sete
 * minutter den dag). Skalaen går efter den dyreste dag, så
 * beløbernes forskelle ses; y-aksen mærkes kun ved max/halv/0,
 * ellers drukner 30 søjler i tekst.
 */
const CHAMPAGNE = "#d4b678";
const SMOKE = "#1e1e26";
const ASH = "#8a8a93";

// viewBox-geometri: luft til max-mærkat ovenover og dato-mærkater
// nedenunder (kun første/sidste dag — 30 datoer fylder alt)
const W = 520;
const H = 220;
const PAD_X = 14;
const PAD_TOP = 26;
const PAD_BOTTOM = 30;
const CHART_H = H - PAD_TOP - PAD_BOTTOM;

export default async function StudioTidsserieChart({
  daily,
}: {
  /** 30 rækker, ældste dag først (fra creator_tal-RPC'en) */
  daily: CreatorTalDay[];
}) {
  const t = await getTranslations("creatorStudio");
  const locale = await getLocale();
  const bars = daily.length > 0 ? daily : [];
  const max = Math.max(1, ...bars.map((d) => d.dkk));
  const slot = (W - PAD_X * 2) / Math.max(1, bars.length);
  const barW = slot * 0.6;

  const yFor = (dkk: number) => PAD_TOP + CHART_H * (1 - dkk / max);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      className="w-full rounded-lg border border-smoke"
    >
      <title>{t("talChartHeading")}</title>

      {/* hjælpelinjer ved max / halv / 0 med beløbsmærkat */}
      {[max, max / 2, 0].map((val, i) => (
        <g key={i}>
          <line
            x1={PAD_X}
            x2={W - PAD_X}
            y1={yFor(val)}
            y2={yFor(val)}
            stroke={SMOKE}
            strokeWidth={val === 0 ? 1.5 : 1}
          />
          <text
            x={PAD_X}
            y={yFor(val) - 3}
            fontSize="9"
            fill={ASH}
          >
            {i === 2 ? "0" : formatCurrency(val, locale)}
          </text>
        </g>
      ))}

      {bars.map((day, i) => {
        const x = PAD_X + slot * i + (slot - barW) / 2;
        const h = CHART_H * (day.dkk / max);
        const y = yFor(day.dkk);
        return (
          <rect
            key={day.date}
            x={x}
            y={y}
            width={barW}
            height={Math.max(h, 0.5)}
            rx={2}
            fill={CHAMPAGNE}
          >
            <title>{t("talChartBar", { date: day.date, amount: formatCurrency(day.dkk, locale) })}</title>
          </rect>
        );
      })}

      {/* dato-mærkater: kun første og sidste dag af serien */}
      {bars.length > 0 && (
        <>
          <text x={PAD_X} y={H - 10} fontSize="9" fill={ASH}>
            {bars[0].date}
          </text>
          <text
            x={W - PAD_X}
            y={H - 10}
            textAnchor="end"
            fontSize="9"
            fill={ASH}
          >
            {bars[bars.length - 1].date}
          </text>
        </>
      )}
    </svg>
  );
}