export default function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-smoke bg-onyx p-5">
      <p className="text-xs uppercase tracking-[0.25em] text-ash">{label}</p>
      <p className="mt-2 font-display text-3xl text-bone">{value}</p>
      {sub && <p className="mt-1 text-sm text-champagne">{sub}</p>}
    </div>
  );
}