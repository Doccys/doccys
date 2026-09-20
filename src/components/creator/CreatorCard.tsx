import { Link } from "@/i18n/navigation";
import type { Creator } from "@/lib/types";

/**
 * Skaber-kort til lister — udtrukket fra /creators, så søgningens
 * skaber-sektion viser præcis samme kort. Statistik er privat
 * (samme beslutning som på profilen): kortet viser kun film-antallet,
 * som kalderen har oversat til en færdig label (ICU-plural).
 */
export default function CreatorCard({
  creator,
  country,
  filmsLabel,
}: {
  creator: Creator;
  /** Allerede lokaliseret landenavn (localizedCountry) */
  country: string;
  /** Allerede oversat "{count} film"-plural fra kalderen */
  filmsLabel: string;
}) {
  return (
    <Link
      href={`/creator/${creator.handle}`}
      className="rounded-xl border border-smoke bg-onyx p-6 transition-colors hover:border-champagne/40"
    >
      <h3 className="font-display text-xl text-bone">{creator.name}</h3>
      <p className="mt-1 text-xs text-ash">
        @{creator.handle} · {country}
      </p>
      <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-ash">
        {creator.bio}
      </p>
      <p className="mt-4 text-sm text-champagne">{filmsLabel}</p>
    </Link>
  );
}