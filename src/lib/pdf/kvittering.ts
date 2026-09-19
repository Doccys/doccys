/**
 * Håndbygget minimal PDF-kvittering for creator-udbetaling —
 * bevidst uden npm-afhængighed (som undertekst-pipelinen).
 *
 * Teknik: standardfontene Helvetica/Helvetica-Bold + WinAnsiEncoding
 * gør æøå mulige (de ligger i Latin-1/WinAnsi), og alle strenge
 * skrives som latin1-bytes. Beløb og datoer formateres i da-DK —
 * kvitteringen er et dansk dokument (valuta-kontrakten er DKK),
 * uanset seerens UI-sprog.
 */

export type KvitteringData = {
  creatorName: string;
  creatorHandle: string;
  amountDkk: number;
  /** creatorens egen gemte konto — står på kvitteringen som dokumentation */
  iban: string | null;
  requestId: string;
  createdAt: Date;
  /** hvornår redaktionen kvitterede anmodningen som 'paid' */
  processedAt: Date;
};

/** PDF-tekst-strenge: parenteser og backslash skal escaperes */
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

const fmtDkk = (n: number) =>
  new Intl.NumberFormat("da-DK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n) + " DKK";

const fmtDato = (d: Date) =>
  new Intl.DateTimeFormat("da-DK", { dateStyle: "long" }).format(d);

/** én tekstlinje på siden: font, størrelse, position (points), tekst */
type Linje = { f: "F1" | "F2"; s: number; x: number; y: number; t: string };

export function bygKvitteringPdf(data: KvitteringData): Buffer {
  // A4 i PDF-points (595 × 842); y-aksen går nedefra og op
  const linjer: Linje[] = [
    { f: "F2", s: 20, x: 72, y: 770, t: "DOCCYS" },
    { f: "F1", s: 9, x: 72, y: 752, t: "Kurateret streaming af uafhængige dokumentarer" },
    { f: "F2", s: 14, x: 72, y: 702, t: "KVITTERING FOR UDBETALING" },
    { f: "F1", s: 10.5, x: 72, y: 654, t: "Modtager:" },
    { f: "F2", s: 10.5, x: 160, y: 654, t: data.creatorName },
    { f: "F1", s: 10.5, x: 72, y: 634, t: "Skaberprofil:" },
    { f: "F2", s: 10.5, x: 160, y: 634, t: "@" + data.creatorHandle },
    { f: "F1", s: 10.5, x: 72, y: 606, t: "Beløb:" },
    { f: "F2", s: 13, x: 160, y: 606, t: fmtDkk(data.amountDkk) },
    { f: "F1", s: 10.5, x: 72, y: 582, t: "Udbetalt den:" },
    { f: "F2", s: 10.5, x: 160, y: 582, t: fmtDato(data.processedAt) },
    { f: "F1", s: 10.5, x: 72, y: 562, t: "Anmodning oprettet:" },
    { f: "F1", s: 10.5, x: 160, y: 562, t: fmtDato(data.createdAt) },
    { f: "F1", s: 10.5, x: 72, y: 542, t: "Kvitteringsnummer:" },
    { f: "F1", s: 10.5, x: 160, y: 542, t: data.requestId },
    { f: "F1", s: 10.5, x: 72, y: 522, t: "Konto (IBAN):" },
    { f: "F1", s: 10.5, x: 160, y: 522, t: data.iban ?? "(ikke gemt)" },
    {
      f: "F1",
      s: 10,
      x: 72,
      y: 474,
      t: "Denne kvittering bekræfter, at ovenstående beløb er overført fra Doccys til",
    },
    {
      f: "F1",
      s: 10,
      x: 72,
      y: 458,
      t: "modtagerens konto. Beløbet er optjent via seertid på Doccys og udbetalt",
    },
    { f: "F1", s: 10, x: 72, y: 442, t: "efter redaktionens godkendelse." },
    {
      f: "F1",
      s: 9,
      x: 72,
      y: 100,
      t: "Kvitteringen er genereret automatisk af Doccys og kræver ikke underskrift.",
    },
  ];

  // skillelinjen under titlen er en fyldt rect (1 pt høj),
  // tekstlinjerne er BT/Td/Tj/ET-blokke pr. linje
  const content =
    "72 686 451 1 re f\n" +
    linjer
      .map(
        (l) => `BT /${l.f} ${l.s} Tf ${l.x} ${l.y} Td (${esc(l.t)}) Tj ET`,
      )
      .join("\n");
  const contentBytes = Buffer.from(content, "latin1");

  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
      + "/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> "
      + `/Contents 4 0 R >>\nendobj\n`,
    `4 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n${content}\nendstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica "
      + "/Encoding /WinAnsiEncoding >>\nendobj\n",
    "6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold "
      + "/Encoding /WinAnsiEncoding >>\nendobj\n",
  ];

  // ——— samling med byte-aktig xref-tabel ———
  const parts: string[] = ["%PDF-1.4\n"];
  const offsets: number[] = [];
  let pos = parts[0].length; // alle tegn er ≤ U+00FF → latin1 = 1 byte/tegn
  for (const obj of objects) {
    offsets.push(pos);
    parts.push(obj);
    pos += obj.length;
  }
  const xrefPos = pos;
  const xref =
    "xref\n0 7\n0000000000 65535 f \n"
    + offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")
    + `trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;

  return Buffer.from(parts.join("") + xref, "latin1");
}