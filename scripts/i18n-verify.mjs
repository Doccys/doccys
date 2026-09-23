// Verifikation af i18n-wiring mod en kørende server. Tjekker UI-strenge,
// genrer, lande og fanetitel på flere sprog — samt at der ikke lækker
// dansk tekst på de udenlandske sider. Kør med:
//   node scripts/i18n-verify.mjs
// (BASE-URL kan overstyres: BASE=http://localhost:3002 node …)
//
// `expectFrom: [locale, ["a.b", …]]` løser forventede strenge direkte i
// messages/<locale>.json (global-udrulningen: de 13 sprog tjekkes mod de
// FAKTISKE oversættelser, ikke mod gættede strenge). "&" escapes til
// "&amp;" som i det leverede HTML.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const MESSAGES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "messages");

function resolveFromMessages(locale, keys) {
  const file = JSON.parse(
    readFileSync(join(MESSAGES_DIR, `${locale}.json`), "utf8"),
  );
  return keys.map((key) => {
    const value = key.split(".").reduce((node, part) => node?.[part], file);
    if (typeof value !== "string") {
      throw new Error(`Nøglen "${key}" findes ikke i messages/${locale}.json`);
    }
    return value.split("&").join("&amp;");
  });
}

const BASE = process.env.BASE ?? "http://localhost:3000";

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
  // --- global udrulning: de 5 nye sprog, forventede strenge læses i
  // messages-filerne (derfor ingen hardcodede oversættelser her) ---
  {
    url: "/ja/",
    expectFrom: ["ja", ["meta.title"]],
    danish: ["Uafhængige dokumentarer"],
  },
  {
    url: "/zh/creators",
    // creators.title validerer sprog-vælger-routing; genres.Klima validerer
    // at content.ts nu bruger routing.locales (Fase 1, trin 8)
    expectFrom: ["zh", ["creators.title", "genres.Klima"]],
    danish: ["Skabere på Doccys", "Uafhængige dokumentarer"],
  },
  {
    url: "/it/profile",
    expectFrom: ["it", ["profile.loginTitle"]],
    danish: ["Log ind for at se din profil"],
  },
  {
    url: "/pt/watch/isens-sidste-vinter",
    expectFrom: ["pt", ["watch.discussionTitle", "saveButton.loginToSave"]],
    danish: ["Kommentarer &amp; diskussion", "Log ind for at gemme filmen"],
  },
];

let failures = 0;
for (const check of checks) {
  const expect = [
    ...(check.expect ?? []),
    ...(check.expectFrom ? resolveFromMessages(...check.expectFrom) : []),
  ];
  const res = await fetch(`${BASE}${check.url}`);
  const html = await res.text();
  const missing = expect.filter((s) => !html.includes(s));
  const leaked = check.danish.filter((s) => html.includes(s));
  const status = missing.length === 0 && leaked.length === 0 ? "OK " : "FAIL";
  if (status === "FAIL") failures++;
  console.log(`${status} ${check.url}`);
  if (missing.length) console.log(`  mangler: ${missing.join(" | ")}`);
  if (leaked.length) console.log(`  dansk læk: ${leaked.join(" | ")}`);
}
console.log(failures === 0 ? "ALLE TJEK GRØNNE" : `${failures} TJK FEJLEDE`);
process.exit(failures === 0 ? 0 : 1);