/**
 * Doccys' brand-mark: en objektivring med en udfyldt play-trianglen i
 * guld-gradient — filmens objektiv og streamingens play-tegn i ét
 * motiv. Marks rolle er at være det genkendelige ikon (app-ikon,
 * favicon, footer), mens selve wordmarket klarer typografien.
 * Ren, skarp SVG uden effekter. Den gamle seksbladede blænde er
 * droppet: dens krydsende linjer læstes som en sekskantet stjerne
 * i små størrelser, og en udfyldt trianglen skalerer bedre til 16px.
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
      {/* Play-trianglen — tyngdepunktet i ringens midte (derfor
          skudt let mod højre); den tynde streg i samme guld giver
          bløde afrundede hjørner i stedet for skarpe spidser */}
      <path
        d="M13 10 L22.6 16 L13 22 Z"
        fill="url(#doccys-mark-gold)"
        stroke="url(#doccys-mark-gold)"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}