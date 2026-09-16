// Verifikation af flersproget indhold (bio_i18n / synopsis_i18n) —
// både direkte i databasen (REST) og live på siderne.
const KEY = "sb_publishable_yZp8nMFYKi6sO17eGdQePQ_CI63ZlWQ";
const URL = "https://xzwowumgvhkltkwrnpdo.supabase.co";
const BASE = "http://localhost:3000";

let failures = 0;
const ok = (label) => console.log(`OK   ${label}`);
const fail = (label, detail) => {
  failures++;
  console.log(`FAIL ${label}${detail ? ` — ${detail}` : ""}`);
};

// 1) Database: kolonnen findes og har engelsk synopsis
const rest = await fetch(
  `${URL}/rest/v1/documentaries?slug=eq.isens-sidste-vinter&select=slug,synopsis,synopsis_i18n`,
  { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } },
);
if (!rest.ok) {
  fail("REST synopsis_i18n", `HTTP ${rest.status}: ${await rest.text()}`);
} else {
  const [row] = await rest.json();
  const en = row?.synopsis_i18n?.en;
  en?.includes("glaciologist Elín")
    ? ok("REST: synopsis_i18n.en findes i databasen")
    : fail("REST: synopsis_i18n.en", `fik: ${JSON.stringify(row?.synopsis_i18n)?.slice(0, 120)}`);
}

// 2) Live sider: synopser og bio'er følger URL-sproget
const pageChecks = [
  ["/da/watch/isens-sidste-vinter", ["I tre år fulgte Nordlys Film glaciologen Elín"], ["glaciologist Elín", "Glaziologin", "glasiologen Elín på hennes"]],
  ["/en/watch/isens-sidste-vinter", ["For three years, Nordlys Film followed glaciologist Elín"], ["I tre år fulgte Nordlys Film"]],
  ["/es/watch/isens-sidste-vinter", ["Durante tres años, Nordlys Film siguió a la glacióloga Elín"], ["I tre år fulgte Nordlys Film"]],
  ["/fr/watch/saltmaleren", ["La peintre Agnes peint la même marée salée"], ["har malet den samme saltring"]],
  ["/de/watch/byen-under-betonen", ["Unter Kopenhagens Betonflächen liegt eine Stadt"], ["Københavns betonflader"]],
  ["/no/watch/skovens-lys", ["Et år i en gammel dansk løvskog"], ["Et år i en gammel dansk løvskov"]],
  ["/sv/watch/maskinen-der-dromte", ["en 40 år gammal stencilmaskin och ritar"], ["en 40 år gammel stencilmaskine"]],
  ["/en/creators", ["A two-person film company from Iceland"], ["to-personers filmselskab"]],
  ["/de/creators", ["Eine zweiköpfige Filmproduktion aus Island"], ["Et tomands filmselskab"]],
  ["/fr/creator/havblik-medier", ["raconte des histoires du littoral"], ["fortæller historier fra kysten"]],
  ["/sv/creator/nordlys-film", ["Ett tvåmannas filmbolag från Island som dokumenterar klimat"], ["dokumenterer klima, landskab"]],
  ["/en/", ["For three years, Nordlys Film followed glaciologist Elín"], ["I tre år fulgte Nordlys Film"]],
];

for (const [url, expect, danish] of pageChecks) {
  const res = await fetch(`${BASE}${url}`);
  if (!res.ok) {
    fail(url, `HTTP ${res.status}`);
    continue;
  }
  const html = await res.text();
  const missing = expect.filter((s) => !html.includes(s));
  const leaked = danish.filter((s) => html.includes(s));
  missing.length === 0 && leaked.length === 0
    ? ok(url)
    : fail(url, [missing.length && `mangler: ${missing.join(" | ")}`, leaked.length && `dansk læk: ${leaked.join(" | ")}`].filter(Boolean).join("; "));
}

console.log(failures === 0 ? "\nALLE TJEK GRØNNE" : `\n${failures} TJK FEJLEDE`);
process.exit(failures === 0 ? 0 : 1);