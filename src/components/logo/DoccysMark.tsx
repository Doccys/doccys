/**
 * Doccys' brand-mark: en objektivring med en seksbladet blænde,
 * tegnet i en diskret guld-gradient. Marks rolle er at være det
 * genkendelige ikon (app-ikon, favicon, footer), mens selve
 * wordmarket klarer typografien. Ren, skarp SVG uden effekter.
 */
export default function DoccysMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="doccys-mark-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e9d29b" />
          <stop offset="1" stopColor="#a8895a" />
        </linearGradient>
      </defs>
      {/* Objektivringen */}
      <circle
        cx="16"
        cy="16"
        r="12.5"
        stroke="url(#doccys-mark-gold)"
        strokeWidth="2"
      />
      {/* Den seksbladede blænde — roterede akkorder i pinwheel-form,
          som en reel iris. Stregerne går IKKE hjørne til hjørne på
          tværs (den gamle version dannede to krydsende trekanter,
          der i små størrelser læses som en sekskantet stjerne). */}
      <path
        d="M18.89 11 L26.06 23.43 M13.11 11 L27.46 11 M10.22 16 L17.4 3.57 M13.11 21 L27.46 21 M18.89 21 L26.06 8.57 M21.78 16 L14.6 28.43"
        stroke="url(#doccys-mark-gold)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}