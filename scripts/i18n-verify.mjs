// Verifikation af i18n-wiring mod en kørende server på localhost:3000.
// Tjekker UI-strenge, genrer, lande og fanetitel på flere sprog — samt at
// der ikke lækker dansk tekst på de udenlandske sider. Kør med:
//   node scripts/i18n-verify.mjs
const BASE = "http://localhost:3000";

const checks = [
  {
    url: "/en/creators",
    expect: ["Creators on Doccys", "Iceland", "Denmark", "films", "views"],
    danish: ["Skabere på Doccys", "visninger"],
  },
  {
    url: "/de/",
    expect: [
      "Porträt",
      "Klima · Porträt",
      "Unabhängige Dokumentarfilme",
      "Unabhängige Dokumentarfilme ohne Werbung",
    ],
    danish: ["Uafhængige dokumentarer"],
  },
  {
    url: "/en/watch/isens-sidste-vinter",
    expect: [
      "Comments &amp; discussion",
      "Log in to save the film",
      "Climate · Portrait",
      "Creator",
    ],
    danish: ["Kommentarer &amp; diskussion", "Log ind for at gemme filmen"],
  },
  {
    url: "/sv/creator/nordlys-film",
    expect: ["Skaparprofil", "Grundat 2016", "Island", "Intäkter"],
    danish: ["Skaberprofil", "Grundlagt 2016"],
  },
  {
    url: "/fi/creators",
    expect: ["Doccysin tekijät", "Islanti", "Tanska", "elokuvaa"],
    danish: ["Skabere på Doccys"],
  },
  {
    url: "/fr/profile",
    expect: ["Connectez-vous pour voir votre profil"],
    danish: ["Log ind for at se din profil"],
  },
];

let failures = 0;
for (const check of checks) {
  const res = await fetch(`${BASE}${check.url}`);
  const html = await res.text();
  const missing = check.expect.filter((s) => !html.includes(s));
  const leaked = check.danish.filter((s) => html.includes(s));
  const status = missing.length === 0 && leaked.length === 0 ? "OK " : "FAIL";
  if (status === "FAIL") failures++;
  console.log(`${status} ${check.url}`);
  if (missing.length) console.log(`  mangler: ${missing.join(" | ")}`);
  if (leaked.length) console.log(`  dansk læk: ${leaked.join(" | ")}`);
}
console.log(failures === 0 ? "ALLE TJEK GRØNNE" : `${failures} TJK FEJLEDE`);
process.exit(failures === 0 ? 0 : 1);