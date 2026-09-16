// Reproduktion: upload en RIGTIG mp4 til film-videos med et rigtigt session-token
// (samme sti som StudioUploadForm bruger: {user_id}/{uuid}.mp4).

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (match) env[match[1]] = match[2];
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Hent en reel lille mp4
const sampleUrls = [
  "https://download.samplelib.com/mp4/sample-5s.mp4",
  "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
];
let mp4 = null;
for (const sampleUrl of sampleUrls) {
  console.log("prøver:", sampleUrl);
  try {
    const sampleRes = await fetch(sampleUrl);
    if (!sampleRes.ok) {
      console.log("  →", sampleRes.status);
      continue;
    }
    mp4 = new Uint8Array(await sampleRes.arrayBuffer());
    if (mp4.length < 1000) {
      console.log("  → for lille:", mp4.length);
      mp4 = null;
      continue;
    }
    console.log("  → OK,", mp4.length, "bytes");
    break;
  } catch (e) {
    console.log("  → fejlede:", e.message);
  }
}
if (!mp4) {
  console.log("kunne ikke hente nogen reel mp4");
  process.exit(1);
}

const auth = createClient(url, key);
const { data: signIn, error } = await auth.auth.signInWithPassword({
  email: "doccys-migration-test@example.com",
  password: "DoccysTest!2026",
});
if (error) {
  console.log("login fejlede:", error.message);
  process.exit(1);
}
const uid = signIn.session.user.id;

// 1) upload med contentType video/mp4 (præcis som app'en)
const path = `${uid}/${crypto.randomUUID()}.mp4`;
console.log("\n── upload 1: contentType video/mp4 ──");
{
  const { data, error: upErr } = await auth.storage
    .from("film-videos")
    .upload(path, mp4, { contentType: "video/mp4" });
  console.log(upErr ? "FEJL: " + JSON.stringify(upErr) : "OK: " + JSON.stringify(data));

  if (!upErr) {
    const { error: delErr } = await auth.storage.from("film-videos").remove([path]);
    console.log("oprydning:", delErr ? delErr.message : "ok");
  }
}

// 2) upload uden contentType (lader supabase-js gætte — Blob uden type)
console.log("\n── upload 2: ingen contentType ──");
{
  const path2 = `${uid}/${crypto.randomUUID()}.mp4`;
  const { error: upErr } = await auth.storage.from("film-videos").upload(path2, mp4);
  console.log(upErr ? "FEJL: " + JSON.stringify(upErr) : "OK");
  if (!upErr) {
    await auth.storage.from("film-videos").remove([path2]);
  }
}