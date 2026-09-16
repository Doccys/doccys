export default function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div>
      {eyebrow && (
        <p className="text-xs uppercase tracking-[0.4em] text-champagne">
          {eyebrow}
        </p>
      )}
      <h2 className="mt-2 font-display text-3xl text-bone">{title}</h2>
      {subtitle && <p className="mt-2 text-ash">{subtitle}</p>}
    </div>
  );
}