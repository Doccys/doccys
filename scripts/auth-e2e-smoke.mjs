/**
 * E2E-smoke-test — verificerer den logget-ind bruger på tværs af appen
 * (profil-side, kommentarer, view-sessions, database-rækker) mod den
 * kørende server.
 *
 * Kørsel: start appen (`npm start`), derefter:
 *   node scripts/auth-e2e-smoke.mjs
 *
 * Bruger testkontoen doccys-smoketest@maildrop.cc (slettes nemt i
 * dashboardet → Authentication → Users). Kræver enten at kontoen
 * eksisterer (logger så ind med kodeordet nedenfor) eller at
 * e-mail-bekræftelse er slået fra i projektet — ellers afbrydes testen.
 */
import { createServerClient } from "@supabase/ssr";
import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => [
      line.slice(0, line.indexOf("=")),
      line.slice(line.indexOf("=") + 1).trim(),
    ]),
);

const APP = "http://localhost:3000";
const jar = new Map();

const supabase = createServerClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => {
        for (const c of list) jar.set(c.name, c.value);
      },
    },
  },
);

const email = "doccys-smoketest@maildrop.cc";
const password = "DoccysSmokeTest123!";

// — 1) log ind (opret kontoen første gang) —
let { data, error } = await supabase.auth.signUp({ email, password });
if (error && ["user_already_exists", "email_exists"].includes(error.code)) {
  ({ data, error } = await supabase.auth.signInWithPassword({ email, password }));
}
if (error) {
  console.log(`AUTH FEJL: ${error.code} — ${error.message}`);
  process.exit(1);
}
if (!data.session) {
  console.log(
    "OPRETTET, MEN: e-mail-bekræftelse er påkrævet i projektet — " +
      "den logget-ind-del af testen kan ikke køre automatisk.",
  );
  process.exit(2);
}

const uid = data.session.user.id;
const cookieHeader = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
console.log(`Logget ind: ${email} (id ${uid})\n`);

const results = [];

// — 2) profil-siden viser den rigtige e-mail —
const profile = await fetch(`${APP}/da/profile`, {
  headers: { cookie: cookieHeader },
});
const profileHtml = await profile.text();
results.push([
  "GET /da/profile",
  profile.status,
  profileHtml.includes(email)
    ? "viser brugerens e-mail ✓"
    : `MANGLER e-mail i HTML (${email}) ✗`,
]);

// — 3) kommentar uden authorName → forfatter sættes server-side —
const comment = await fetch(`${APP}/api/comments`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: cookieHeader },
  body: JSON.stringify({
    documentarySlug: "isens-sidste-vinter",
    body: "E2E-smoke: kommentar fra logget-ind bruger.",
  }),
});
const commentData = await comment.json();
results.push([
  "POST /api/comments (uden navn)",
  comment.status,
  commentData?.comment?.authorName === email && commentData?.comment?.userId === uid
    ? "forfatter = e-mail + userId ✓"
    : `fik: '${commentData?.comment?.authorName}' / userId '${commentData?.comment?.userId}' ✗`,
]);

// — 4) forfalsket authorName ignoreres —
const fake = await fetch(`${APP}/api/comments`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: cookieHeader },
  body: JSON.stringify({
    documentarySlug: "isens-sidste-vinter",
    authorName: "En Anden",
    body: "E2E-smoke: klient-navn skal ignoreres.",
  }),
});
const fakeData = await fake.json();
results.push([
  "POST /api/comments (forfalsket navn)",
  fake.status,
  fakeData?.comment?.authorName === email && fakeData?.comment?.userId === uid
    ? "klientens navn ignoreres ✓"
    : "klientens navn IKKE ignoreret ✗",
]);

// — 5) view-session kobles på bruger-id'et —
const sess = await fetch(`${APP}/api/views/sessions`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: cookieHeader },
  body: JSON.stringify({
    documentarySlug: "isens-sidste-vinter",
    device: { userAgent: "e2e-smoke-script" },
  }),
});
const sessData = await sess.json();
const fetched = sess.ok
  ? await (
      await fetch(`${APP}/api/views/sessions/${sessData.sessionId}`, {
        headers: { cookie: cookieHeader },
      })
    ).json()
  : {};
results.push([
  "POST /api/views/sessions",
  sess.status,
  fetched?.session?.userId === uid
    ? "session.userId = logget-ind bruger ✓"
    : `session.userId = '${fetched?.session?.userId}' ✗`,
]);

// — 6) gæster kan stadig kommentere med frit navn —
const guest = await fetch(`${APP}/api/comments`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    documentarySlug: "isens-sidste-vinter",
    authorName: "Gæst E2E",
    body: "E2E-smoke: gæstekommentar med frit navn.",
  }),
});
results.push([
  "POST /api/comments (gæst)",
  guest.status,
  guest.status === 201 ? "frit navn stadig muligt ✓" : "gæst afvist ✗",
]);

// — 7) database: gem film + gyldig completion som den logget-ind bruger —
// (oprydning først, så testen kan køres igen og igen)
await supabase.from("saved_films").delete().eq("documentary_slug", "saltmaleren");
await supabase.from("watch_history").delete().eq("documentary_slug", "saltmaleren");

const saved = await supabase
  .from("saved_films")
  .insert({ user_id: uid, documentary_slug: "saltmaleren" });
results.push([
  "DB insert saved_films (RLS)",
  saved.error ? "error" : "201",
  saved.error ? `afvist: ${saved.error.message} ✗` : "film gemt ✓",
]);

const watched = await supabase
  .from("watch_history")
  .upsert(
    {
      user_id: uid,
      documentary_slug: "saltmaleren",
      progress_ratio: 1,
      completed: true,
    },
    { onConflict: "user_id,documentary_slug" },
  );
results.push([
  "DB upsert watch_history (RLS)",
  watched.error ? "error" : "201",
  watched.error ? `afvist: ${watched.error.message} ✗` : "completion registreret ✓",
]);

// — 8) profil-siden viser de nye DB-rækker —
const profile2 = await fetch(`${APP}/da/profile`, {
  headers: { cookie: cookieHeader },
});
const profile2Html = await profile2.text();
results.push([
  "GET /da/profile (efter DB-skriverier)",
  profile2.status,
  profile2Html.includes("Saltmaleren")
    ? "seerhistorik + gemt film vises fra databasen ✓"
    : `Saltmaleren ikke at finde på profilen ✗`,
]);

console.log(results.map(([name, status, verdict]) => `${name} [${status}]: ${verdict}`).join("\n"));