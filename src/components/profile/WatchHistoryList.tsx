import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Documentary, WatchHistoryEntry } from "@/lib/types";
import { formatDate, formatDuration } from "@/lib/utils/format";

export default async function WatchHistoryList({
  entries,
}: {
  entries: { documentary: Documentary; entry: WatchHistoryEntry }[];
}) {
  const t = await getTranslations("watchHistory");
  const locale = await getLocale();

  return (
    <ul className="space-y-3">
      {entries.map(({ documentary, entry }) => (
        <li key={documentary.slug}>
          <Link
            href={`/watch/${documentary.slug}`}
            className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-smoke bg-onyx px-5 py-4 transition-colors hover:border-champagne/40"
          >
            <div className="min-w-0">
              <p className="font-display text-lg text-bone">{documentary.title}</p>
              <p className="mt-0.5 text-xs text-ash">
                {formatDate(entry.watchedAtMs, locale)} ·{" "}
                {entry.completed
                  ? t("completed")
                  : t("progress", {
                      watched: formatDuration(
                        Math.round(documentary.durationSec * entry.progressRatio),
                      ),
                      total: formatDuration(documentary.durationSec),
                    })}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="h-1 w-36 overflow-hidden rounded-full bg-smoke">
                <div
                  className="h-full rounded-full bg-champagne"
                  style={{ width: `${Math.round(entry.progressRatio * 100)}%` }}
                />
              </div>
              <span className="text-sm tabular-nums text-champagne">
                {Math.round(entry.progressRatio * 100)}%
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}