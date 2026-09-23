/**
 * i18n-translate — oversætter messages/*.json (og payload-filer) fra
 * dansk til nye sprog via OpenAI (samme rå-fetch-konvention som
 * undertekst-pipelinen, ingen SDK, ingen nye deps).
 *
 * Kilde er ALTID messages/da.json (444 nøgler, dansk reference).
 * Idempotent: en eksisterende målfil fyldes kun op der, hvor nøgler
 * mangler eller er tomme — medmindre --force. Fejlede chunks efterlader
 * filen gyldig; en genkørsel fylder kun hullerne.
 *
 * Kørsel:
 *   node scripts/i18n-translate.mjs ja zh it pt hi --model gpt-4o
 *   node scripts/i18n-translate.mjs ja --namespace legal --force
 *   node scripts/i18n-translate.mjs --payload tmp/indhold.json --locales ja,zh
 *     (payload-tilstand: flat {id: "dansk tekst"} → <fil>.<locale>.json)
 *
 * Flag: --model M (default gpt-4o-mini) · --force (oversæt alt, ikke
 * kun huller) · --namespace NS (kun ét namespace) · --dry-run (tæl kun).
 *
 * Nøglen læses fra .env.local (OPENAI_API_KEY) — ALDRIG committet.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Målsprog med eksplicit variant, så gpt rammer brasiliansk/forenklet. */
const TARGET_LANGUAGES = {
  ja: "japansk (naturlig, høflig です/ます-stil)",
  zh: "forenklet kinesisk (简体中文, ikke traditionelle tegn)",
  it: "italiensk",
  pt: "brasiliansk portugisisk (português brasileiro, ikke europæisk portugisisk)",
  hi: "hindi (हिन्दी, respektfuldt register)",
};

// ---------- CLI ----------

const args = process.argv.slice(2);
const flags = new Set();
let model = "gpt-4o-mini";
let force = false;
let namespace = null;
let payloadPath = null;
let dryRun = false;
const locales = [];

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--model") model = args[++i];
  else if (arg === "--force") force = true;
  else if (arg === "--namespace") namespace = args[++i];
  else if (arg === "--payload") payloadPath = args[++i];
  else if (arg === "--dry-run") dryRun = true;
  else if (arg.startsWith("--")) flags.add(arg);
  else locales.push(arg);
}

const flatLocales = locales.flatMap((l) => l.split(",")).filter(Boolean);
if (flatLocales.length === 0) {
  console.error(
    "Angiv mindst ét målsprog: node scripts/i18n-translate.mjs ja zh it pt hi",
  );
  process.exit(1);
}
for (const locale of flatLocales) {
  if (!TARGET_LANGUAGES[locale]) {
    console.error(`Ukendt målsprog "${locale}" — kendte: ${Object.keys(TARGET_LANGUAGES).join(", ")}`);
    process.exit(1);
  }
}

// ---------- .env.local (nøglen må aldrig i repoet) ----------

function loadEnvKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  const envPath = join(ROOT, ".env.local");
  if (!existsSync(envPath)) {
    throw new Error(".env.local findes ikke — og OPENAI_API_KEY er ikke sat.");
  }
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*OPENAI_API_KEY\s*=\s*(.*)\s*$/);
    if (match) {
      return match[1].replace(/^["']|["']$/g, "");
    }
  }
  throw new Error("OPENAI_API_KEY findes ikke i .env.local.");
}

const API_BASE = process.env.OPENAI_API_BASE ?? "https://api.openai.com/v1";
let apiKey;
try {
  apiKey = loadEnvKey();
} catch (err) {
  console.error(String(err.message ?? err));
  process.exit(1);
}

// ---------- JSON-hjælpere ----------

/** Alle nøgle-stier ("a.b.c") → værdi, rekursivt (som i i18n-keys-verify). */
function flatten(obj, prefix = "", out = new Map()) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      flatten(value, path, out);
    } else {
      out.set(path, value);
    }
  }
  return out;
}

/** Punkterede stier → nested objekt (modstykket til flatten). */
function unflatten(flat) {
  const root = {};
  for (const [path, value] of Object.entries(flat)) {
    const parts = path.split(".");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof node[parts[i]] !== "object" || node[parts[i]] === null) {
        node[parts[i]] = {};
      }
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = value;
  }
  return root;
}

/**
 * Pladsholder-NAVN i en next-intl-streng, som sæt: "{name}" og
 * "{count, plural, …}" giver {"name", "count"}. Kun navnene
 * sammenlignes — ICU-flertals-udtryk som {count, plural, one {# film}
 * other {# film}} oversættes INDE i grenene ({# 映画}), så de indre
 * tokens må gerne afvige; navnet (count) og antallet må ikke.
 */
function placeholders(text) {
  const set = new Set();
  for (const match of text.match(/\{([a-zA-Z_][a-zA-Z0-9_]*)(?=[,}])/g) ?? []) {
    set.add(match.slice(1));
  }
  return set;
}

// ---------- OpenAI ----------

const SYSTEM_PROMPT = (target) =>
  [
    "Du er en professionel lokaliserings-oversætter til streamingplatformen Doccys.",
    `Oversæt hver tekststreng fra dansk til ${target}.`,
    "Svar KUN med JSON på formen {\"translations\": {\"<nøgle>\": \"<oversættelse>\"}} med PRÆCIS de nøgler du fik — aldrig færre, aldrig flere, aldrig omdøbt.",
    "Nøglerne er identifikatorer og skal gentages uændret (i namespaces som genres og countries ER nøglerne danske genrenavne — de forbliver danske, kun VÆRDIEN oversættes).",
    "Bevar {pladsholdere} ordret og uændret i oversættelsen.",
    "ICU-flertals-udtryk som {count, plural, one {# film} other {# film}} bevares som HELE udtrykket: oversæt kun ordene inde i grenene, behold {count} og # præcist som de er (på sprog uden flertalsbøjning kan begge grene få samme ord).",
    "Bevar linjeskift (\\n) 1:1 — lige mange linjer, punktopstillingen med \"• \" bevares som \"• \"-linjer.",
    "Efterlad brandnavne og tekniske termer uændret: Doccys, Stripe, Supabase, Vercel, DKK, e-mail-adresser, URL'er.",
    "Bevar eventuel HTML/notation i strengene (fx <strong>…) uændret i oversættelsen.",
    "Gentag en tom streng som en tom streng — og oversæt aldrig en værdi til tom, medmindre kilden er tom.",
    "Ton: kort, præcis, indbydende UI-tekst; juridiske tekster (legal-namespace) skal være nøjagtige og formelle.",
  ].join(" ");

async function translateChunk(flat, target) {
  const res = await fetch(`${API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT(target) },
        { role: "user", content: JSON.stringify({ strings: flat }) },
      ],
    }),
    signal: AbortSignal.timeout(5 * 60 * 1000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI fejlede (${res.status})${detail ? `: ${detail.slice(0, 300)}` : "."}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returnerede et tomt svar.");

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("OpenAI returnerede ugyldig JSON.");
  }
  const translations = parsed?.translations;
  if (!translations || typeof translations !== "object") {
    throw new Error('OpenAI-svaret mangler {"translations": {...}}.');
  }

  // Strukturvalidering: nøglesæt, pladsholdere og tom-ud-af-tomt.
  const sourceKeys = new Set(Object.keys(flat));
  const outKeys = new Set(Object.keys(translations));
  if (sourceKeys.size !== outKeys.size || ![...sourceKeys].every((k) => outKeys.has(k))) {
    throw new Error(
      `Nøglesæt stemmer ikke: ${outKeys.size} svar ved ${sourceKeys.size} inputs.`,
    );
  }
  for (const [key, source] of Object.entries(flat)) {
    const value = translations[key];
    if (typeof value !== "string") {
      throw new Error(`"${key}" er ikke en streng i svaret.`);
    }
    const want = placeholders(source);
    const got = placeholders(value);
    if (want.size !== got.size || ![...want].every((p) => got.has(p))) {
      throw new Error(`"${key}" har mistet/omskrevet en pladsholder.`);
    }
    if (source.trim() !== "" && value.trim() === "") {
      throw new Error(`"${key}" oversatte en ikke-tom streng til tom.`);
    }
    // Linjestruktur: lige mange linjer, og "• "-punkter forbliver
    // "• "-punkter (juridiske tekster er bygget sådan).
    const sourceLines = source.split("\n");
    const valueLines = value.split("\n");
    if (sourceLines.length !== valueLines.length) {
      throw new Error(`"${key}" har ${valueLines.length} linjer ved ${sourceLines.length}.`);
    }
    for (let i = 0; i < sourceLines.length; i++) {
      if (sourceLines[i].startsWith("• ") !== valueLines[i].startsWith("• ")) {
        throw new Error(`"${key}" ændrede punktliste-strukturen.`);
      }
    }
  }
  return translations;
}

/** Oversæt med op til 2 genforsøg (mønstret fra undertekst-pipelinen). */
async function translateWithRetry(flat, target, label) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await translateChunk(flat, target);
    } catch (err) {
      console.error(`  ${label}: forsøg ${attempt} fejlede — ${err.message}`);
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

// ---------- Chunking pr. namespace ----------

const CHUNK_CHAR_LIMIT = 8000;

/** Deler et flat map i chunks: samme namespace holdes sammen, store
 *  namespaces deles først når ~8.000 kildetegn er overskredet. */
function makeChunks(flat, onlyNamespace) {
  const byNamespace = new Map();
  for (const [path, value] of Object.entries(flat)) {
    const ns = path.split(".")[0];
    if (onlyNamespace && ns !== onlyNamespace) continue;
    if (!byNamespace.has(ns)) byNamespace.set(ns, []);
    byNamespace.get(ns).push([path, value]);
  }
  const chunks = [];
  for (const [ns, entries] of byNamespace) {
    let current = {};
    let chars = 0;
    for (const [path, value] of entries) {
      if (Object.keys(current).length > 0 && chars + value.length > CHUNK_CHAR_LIMIT) {
        chunks.push([ns, current]);
        current = {};
        chars = 0;
      }
      current[path] = value;
      chars += value.length;
    }
    if (Object.keys(current).length > 0) chunks.push([ns, current]);
  }
  return chunks;
}

// ---------- Messages-tilstand ----------

function writeJson(path, obj) {
  // 2-space, trailing newline, UTF-8 uden BOM (Windows: writeFileSync
  // skriver aldrig BOM, og JSON.stringify leverer ASCII-escaper fri UTF-8).
  writeFileSync(path, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

async function translateMessagesFile(locale) {
  const source = JSON.parse(readFileSync(join(ROOT, "messages", "da.json"), "utf8"));
  const target = TARGET_LANGUAGES[locale];
  const targetPath = join(ROOT, "messages", `${locale}.json`);

  // Merge-grundlag: eksisterende fil = kun huller, medmindre --force.
  const existing = existsSync(targetPath)
    ? JSON.parse(readFileSync(targetPath, "utf8"))
    : {};
  const flatSource = flatten(source);
  const flatExisting = flatten(existing);
  const toTranslate = {};
  let skipped = 0;
  for (const [path, value] of flatSource) {
    const done = !force && flatExisting.has(path) && flatExisting.get(path) !== "";
    if (done) {
      skipped++;
    } else {
      toTranslate[path] = value;
    }
  }

  const keys = Object.keys(toTranslate).length;
  console.log(`${locale}: ${keys} nøgler til oversættelse${skipped ? `, ${skipped} allerede oversat` : ""}.`);
  if (dryRun) return keys === 0 ? 0 : keys;
  if (keys === 0) return 0;

  // Byg den færdige fil over det eksisterende grundlag, OG skriv den
  // efter HVER chunk: et chunk-fiasko midtvejs mister så aldrig de
  // færdige chunks (genkørslen springer dem over via merge-logikken).
  const result = force ? {} : existing;
  const chunks = makeChunks(toTranslate, namespace);
  for (const [ns, chunk] of chunks) {
    const label = `${locale}/${ns} (${Object.keys(chunk).length} nøgler)`;
    process.stdout.write(`  ${label} … `);
    const translations = await translateWithRetry(chunk, target, label);
    for (const [path, value] of Object.entries(translations)) {
      const parts = path.split(".");
      let node = result;
      for (let i = 0; i < parts.length - 1; i++) {
        if (typeof node[parts[i]] !== "object" || node[parts[i]] === null) {
          node[parts[i]] = {};
        }
        node = node[parts[i]];
      }
      node[parts[parts.length - 1]] = value;
    }
    writeJson(targetPath, result);
    console.log("OK");
  }
  return 0;
}

// ---------- Payload-tilstand (seed-indhold, Fase 4) ----------

async function translatePayloadFile(locale) {
  const target = TARGET_LANGUAGES[locale];
  const payload = JSON.parse(readFileSync(payloadPath, "utf8"));
  const outPath = `${payloadPath.replace(/\.json$/, "")}.${locale}.json`;

  const existing = existsSync(outPath)
    ? JSON.parse(readFileSync(outPath, "utf8"))
    : {};
  const toTranslate = {};
  for (const [id, value] of Object.entries(payload)) {
    if (typeof value !== "string") continue;
    if (force || !(id in existing) || existing[id] === "") {
      toTranslate[id] = value;
    }
  }
  console.log(`${locale} (payload): ${Object.keys(toTranslate).length} tekster.`);
  if (dryRun || Object.keys(toTranslate).length === 0) return 0;

  const result = { ...existing };
  for (const [ns, chunk] of makeChunks(toTranslate, namespace)) {
    const label = `${locale}/${ns} (${Object.keys(chunk).length})`;
    process.stdout.write(`  ${label} … `);
    const translations = await translateWithRetry(chunk, target, label);
    Object.assign(result, translations);
    writeJson(outPath, result);
    console.log("OK");
  }
  return 0;
}

// ---------- main ----------

let failed = false;
for (const locale of flatLocales) {
  try {
    if (payloadPath) {
      await translatePayloadFile(locale);
    } else {
      await translateMessagesFile(locale);
    }
  } catch (err) {
    console.error(`${locale} AFBRUDT: ${err.message}`);
    console.error("(Filen er gyldig på disken — genkør scriptet for at fylde hullerne.)");
    failed = true;
  }
}
if (failed) process.exit(1);
console.log("Færdig — kør node scripts/i18n-keys-verify.mjs for at verificere paritet.");