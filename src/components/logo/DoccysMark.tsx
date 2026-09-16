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
      {/* Den seksbladede blænde — bladene peger skråt ind mod midten */}
      <path
        d="M16 8 L9.07 20 M9.07 12 L16 24 M9.07 20 L22.93 20 M16 24 L22.93 12 M22.93 20 L16 8 M22.93 12 L9.07 12"
        stroke="url(#doccys-mark-gold)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}