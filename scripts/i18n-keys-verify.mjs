/**
 * i18n-keys-verify — tjekker at alle messages/*.json har IDENTISKE
 * nøglesæt (navne, ikke værdier). Mangler én nøgle ét sted, crashter
 * next-intl på runtime-siden — dette fanger det før deploy.
 *
 * Kørsel: node scripts/i18n-keys-verify.mjs  (afslutter 1 ved fejl)
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "messages");

/** Alle nøgle-stier ("a.b.c") i en JSON-struktur, rekursivt. */
function keyPaths(obj, prefix = "") {
  const paths = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      paths.push(...keyPaths(value, path));
    } else {
      paths.push(path);
    }
  }
  return paths;
}

const files = readdirSync(dir)
  .filter((name) => name.endsWith(".json"))
  .sort();
const keysByFile = new Map();
for (const name of files) {
  keysByFile.set(name, new Set(keyPaths(JSON.parse(readFileSync(join(dir, name), "utf8")))));
}

const daName = "da.json";
const reference = keysByFile.get(daName);
let failed = false;

for (const [name, keys] of keysByFile) {
  if (name === daName) continue;
  const missing = [...reference].filter((key) => !keys.has(key));
  const extra = [...keys].filter((key) => !reference.has(key));
  for (const key of missing) {
    console.error(`MANGLER: ${name} mangler "${key}" (findes i ${daName})`);
    failed = true;
  }
  for (const key of extra) {
    console.error(`EKSTRA:   ${name} har "${key}" (findes ikke i ${daName})`);
    failed = true;
  }
}

if (failed) {
  console.error("Nøgle-paritet FEJLEDE — ret filerne ovenfor.");
  process.exit(1);
}
console.log(`OK: ${files.length} messages-filer, ${reference.size} nøgler — fuld paritet.`);