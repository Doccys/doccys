// ============================================================
// Doccys: verifikation af creator-program-migrationen
// (supabase/migrations/20260915_creator_program.sql)
// ============================================================
// Kørsel:  node scripts/test-creator-migration.mjs
//
// Tester det, der kan testes udefra med anon-nøglen:
//   1) Status-kolonnen findes, og de seedede film er 'published'
//   2) RLS skjuler creator_applications for anonyme
//   3) creators.owner_user_id-kolonnen findes
//   4) comment_likes findes (forrige migration)
//   5) Med en logget-ind testbruger:
//      - ansøgning oprettes som 'pending'
//      - selv-godkendelse rammer 0 rækker (status-maskinen)
//      - film-INSERT uden godkendt skaberprofil afvises
//      - film-INSERT med status 'published' afvises
//      - upload til en FREMD mappe afvises, egen mappe virker
//      - plakat-bucket (film-posters): egen mappe virker, fremmed
//        mappe + andre mime-typer afvises, sletning rammer rækken
//        (supabase/migrations/20260916_film_posters.sql)
//
// Testkontoen forbliver i projektet med en pending-ansøgning —
// flip den til 'approved' i dashboardet for at se triggeren
// oprette creators-rækken (god end-to-end-test). Slettes kontoen
// i dashboardet (Authentication → Users), cascaderes ansøgningen.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// ── miljøvariabler fra .env.local (ingen afhængighed af Node-version) ──
const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (match) env[match[1]] = match[2];
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Mangler NEXT_PUBLIC_SUPABASE_URL/ANON_KEY i .env.local");
  process.exit(1);
}

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "  OK " : "FEJL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
}

const anon = createClient(url, key);

console.log("\n── 1) documentaries: status-kolonne og offentligt katalog ──");
{
  const { data: docs, error } = await anon
    .from("documentaries")
    .select("slug,title,status")
    .order("slug");
  check("tabel + status-kolonne svarer", !error, error?.message ?? "");
  if (!error && docs) {
    check(
      `alle ${docs.length} seedede film er 'published'`,
      docs.length > 0 && docs.every((d) => d.status === "published"),
      docs.map((d) => `${d.slug}=${d.status}`).join(", "),
    );
  }
}

console.log("\n── 2) creator_applications: RLS skjuler for anonyme ──");
{
  const { data: apps, error } = await anon
    .from("creator_applications")
    .select("id,status");
  check("tabel svarer", !error, error?.message ?? "");
  if (!error) {
    check(
      "anonym ser ingen ansøgninger",
      apps.length === 0,
      `fandt ${apps.length} rækker`,
    );
  }
}

console.log("\n── 3) creators.owner_user_id ──");
{
  const { data: creators, error } = await anon
    .from("creators")
    .select("handle,owner_user_id");
  check("tabel + kolonne svarer", !error, error?.message ?? "");
  if (!error && creators) {
    console.log(
      "      seedede skabere:",
      creators.map((c) => `${c.handle} (owner=${c.owner_user_id ?? "null"})`).join(", "),
    );
  }
}

console.log("\n── 4) comment_likes (forrige migration) ──");
{
  const { error } = await anon.from("comment_likes").select("comment_id").limit(1);
  check("tabel svarer", !error, error?.message ?? "");
}

console.log("\n── 5) logget-ind testbruger ──");
const email = "doccys-migration-test@example.com";
const password = "DoccysTest!2026";
const auth = createClient(url, key);

let session = null;
{
  const { data: signUp, error: signUpErr } = await auth.auth.signUp({
    email,
    password,
  });
  if (signUp?.session) {
    session = signUp.session;
    console.log("      testkonto oprettet og logget ind");
  } else if (signUpErr?.message?.includes("already")) {
    const { data: signIn, error: signInErr } =
      await auth.auth.signInWithPassword({ email, password });
    if (signIn?.session) {
      session = signIn.session;
      console.log("      eksisterende testkonto — logget ind");
    } else {
      console.log(
        `      login fejlede: ${signInErr?.message ?? signInErr?.code ?? "ukendt"}`,
      );
    }
  } else {
    console.log(
      "      INGEN SESSION — sandsynligvis kræver projektet e-mail-" +
        "bekræftelse (Authentication → Sign In / Up → Email)." +
        "Deaktiver den midlertidigt og kør scriptet igen.",
    );
    if (signUpErr) console.log(`      fejl: ${signUpErr.message}`);
  }
}

if (!session) {
  console.log("\nDel-resultat ovenfor; de godkendte tests sprunget over.");
} else {
  const uid = session.user.id;

  console.log("\n── 5a) ansøgning oprettes som pending ──");
  let application = null;
  {
    const handle = "test-skaber-" + Math.random().toString(36).slice(2, 6);
    const { data: ins, error: insErr } = await auth
      .from("creator_applications")
      .insert({
        user_id: uid,
        name: "Migrationstest",
        handle,
        bio: "Automatisk test af creator-program-migrationen.",
        founded_year: new Date().getFullYear(),
        country: "Danmark",
        motivation: "Automatisk verifikationskørsel.",
      })
      .select()
      .single();
    if (insErr?.code === "23505") {
      console.log(
        "      kontoen har allerede en ansøgning fra en tidligere kørsel — genbruger den",
      );
    } else {
      check("indsættelse lykkedes", !insErr, insErr?.message ?? "");
      if (ins) {
        application = ins;
        check(
          "status er 'pending' (DB-default)",
          ins.status === "pending",
          `fikk ${ins.status}`,
        );
        check(
          "decided_at er null",
          ins.decided_at === null,
          `fikk ${ins.decided_at}`,
        );
      }
    }
  }

  console.log("\n── 5b) selv-godkendelse skal ramme 0 rækker ──");
  {
    const { data: upd, error: updErr } = await auth
      .from("creator_applications")
      .update({ status: "approved" })
      .eq("user_id", uid)
      .select();
    check(
      "opdatering ramte 0 rækker (status-maskinen holder)",
      !updErr && (upd === null || upd.length === 0),
      updErr?.message ?? `${upd?.length ?? 0} rækker`,
    );
  }

  console.log("\n── 5c) film-INSERT uden godkendt skaberprofil afvises ──");
  {
    const { error: draftErr } = await auth.from("documentaries").insert({
      id: crypto.randomUUID(),
      slug: "test-kladde-" + Math.random().toString(36).slice(2, 6),
      title: "Testkladde",
      synopsis: "Skal afvises — testkontoen ejer ingen skaberprofil.",
      year: new Date().getFullYear(),
      duration_sec: 60,
      genres: ["Natur"],
      creator_handle: "test-skaber",
      gradient: "from-[#0f2027] via-[#203a43] to-[#2c5364]",
      video_url: `${url}/storage/v1/object/public/film-videos/${uid}/x.mp4`,
      status: "draft",
      sort_order: 1000,
    });
    check(
      "draft-INSERT afvist (ingen ejerskab)",
      !!draftErr,
      draftErr?.message ?? "blev INDSAT — kritisk!",
    );

    const { error: pubErr } = await auth.from("documentaries").insert({
      id: crypto.randomUUID(),
      slug: "test-publikation-" + Math.random().toString(36).slice(2, 6),
      title: "Selvpublicering",
      synopsis: "Skal afvises — status skal være draft.",
      year: new Date().getFullYear(),
      duration_sec: 60,
      genres: ["Natur"],
      creator_handle: "test-skaber",
      gradient: "from-[#0f2027] via-[#203a43] to-[#2c5364]",
      video_url: `${url}/storage/v1/object/public/film-videos/${uid}/x.mp4`,
      status: "published",
      sort_order: 1000,
    });
    check(
      "published-INSERT afvist (tvungen kladde)",
      !!pubErr,
      pubErr?.message ?? "blev INDSAT — kritisk!",
    );
  }

  console.log("\n── 5d) storage-policies ──");
  const testBytes = new Uint8Array([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
  ]); // minimal mp4-box-header
  {
    const foreignPath =
      "00000000-0000-0000-0000-000000000000/fremmed.mp4";
    const { error: foreignErr } = await auth.storage
      .from("film-videos")
      .upload(foreignPath, testBytes, { contentType: "video/mp4" });
    check(
      "upload til FREMD mappe afvist",
      !!foreignErr,
      foreignErr?.message ?? "blev UPLOADET — kritisk!",
    );

    // NB: ingen upsert — upsert-stien i storage-API'en fejler altid under
    // RLS (kræver UPDATE-ruten); app'ens rigtige upload er plain upload.
    const ownPath = `${uid}/migrationstest-${Math.random()
      .toString(36)
      .slice(2, 8)}.mp4`;
    const { error: ownErr } = await auth.storage
      .from("film-videos")
      .upload(ownPath, testBytes, { contentType: "video/mp4" });
    check(
      "upload til EGEN mappe lykkedes (bucket + policy virker)",
      !ownErr,
      ownErr?.message ?? "",
    );
    if (!ownErr) {
      const { data: removed, error: delErr } = await auth.storage
        .from("film-videos")
        .remove([ownPath]);
      check(
        "sletning i egen mappe ramte rækken",
        !delErr && Array.isArray(removed) && removed.length > 0,
        delErr?.message ??
          (removed?.length ? `${removed.length} slettet` : "0 rækker — SELECT-policy på storage.objects mangler?"),
      );
      // Verificér at objektet reelt er væk (public bucket kan tjekkes direkte)
      const head = await fetch(
        `${url}/storage/v1/object/public/film-videos/${ownPath}`,
        { method: "HEAD" },
      );
      check(
        "objektet er reelt væk fra bucketen",
        head.status === 400 || head.status === 404,
        `HEAD gav ${head.status}`,
      );
      // Ryd ALLE test-objekter i testkontoens mappe op (fra alle
      // kørsler) — kræver select-policyen (list + remove).
      const { data: listing, error: listErr } = await auth.storage
        .from("film-videos")
        .list(uid, { limit: 100 });
      if (listErr) {
        console.log("      oprydning: list fejlede:", listErr.message);
      } else {
        const leftovers = (listing ?? []).map((o) => `${uid}/${o.name}`);
        if (leftovers.length > 0) {
          const { error: sweepErr } = await auth.storage
            .from("film-videos")
            .remove(leftovers);
          console.log(
            `      oprydning: ${sweepErr ? sweepErr.message : `fjernede ${leftovers.length} objekt(er): ${leftovers.join(", ")}`}`,
          );
        } else {
          console.log("      oprydning: mappen er allerede tom");
        }
      }
    }
  }

  console.log("\n── 5e) film-posters: plakat-bucket ──");
  {
    // Minimal gyldig PNG (1×1 pixel) — nok til at teste mime-typen.
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
      0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    const posterPath = `${uid}/test-${Math.random().toString(36).slice(2, 8)}.png`;

    const { error: upErr } = await auth.storage
      .from("film-posters")
      .upload(posterPath, png, { contentType: "image/png" });
    check(
      "plakat-upload til EGEN mappe lykkedes",
      !upErr,
      upErr?.message ?? "",
    );

    const { error: badErr } = await auth.storage
      .from("film-posters")
      .upload(`${uid}/test.txt`, new Uint8Array([1, 2, 3]), {
        contentType: "text/plain",
      });
    check(
      "plakat-bucket afviser andre mime-typer",
      !!badErr,
      badErr?.message ?? "blev UPLOADET — kritisk!",
    );

    const { error: foreignErr } = await auth.storage
      .from("film-posters")
      .upload("00000000-0000-0000-0000-000000000000/x.png", png, {
        contentType: "image/png",
      });
    check(
      "plakat-upload til FREMD mappe afvist",
      !!foreignErr,
      foreignErr?.message ?? "blev UPLOADET — kritisk!",
    );

    if (!upErr) {
      const { data: removed, error: delErr } = await auth.storage
        .from("film-posters")
        .remove([posterPath]);
      check(
        "plakat-sletning rammer rækken",
        !delErr && Array.isArray(removed) && removed.length > 0,
        delErr?.message ?? `${removed?.length ?? 0} rækker`,
      );
    }
  }

  console.log(
    `\nAnsøgningen forbliver 'pending' i dashboardet${application ? ` (handle: ${application.handle})` : ""}.`,
  );
  console.log(
    "Flip den til 'approved' for at se triggeren oprette creators-rækken,",
  );
  console.log(
    "og log ind i app'en som:",
  );
  console.log(`  e-post:  ${email}`);
  console.log(`  kode:    ${password}`);
}

console.log(
  `\n${failures === 0 ? "ALLE TESTER GRØNNE ✓" : `${failures} TESTER FEJLEDE`}`,
);
process.exit(failures === 0 ? 0 : 1);