import { createClient } from "@/lib/supabase/server";
import type { KlubPost } from "@/lib/types";

/**
 * KLUBSTUEN — Legende-gaven (brugerens beslutning 12/11): én indsæt-kun
 * fælles væg, hvor KUN seere i Legende-ti-eren (10.000 gyldige minutter)
 * kan læse OG skrive. Alle udenfor ser en låst dør med offentlige
 * aggregat-tal (klub_taeler-RPC) — aldrig indhold.
 *
 * Tillid: SQL-migrationerne er autoriteten. RLS-politikerne på
 * klub_posts kalder er_klub_medlem (security definer ≙ seer_flair.tier
 * = 3, som ikke kan lyves af klienten), og klub_taeler er offentlig
 * (medlemstal/indlægstal — intet navne- eller indholdsglimt bag døren).
 * Ingen app-side verificerer noget, som RLS'en ikke allerede har sagt.
 *
 * GRACEFUL: PGRST205/fejl på tabeller/funktioner (pre-migration eller
 * Supabase ude) → false/null/[] — døren renderes som lukket, intet
 * knækker (user_handles/har_set_film-mønsteret).
 */

/** Tællerne bag den låste dør — null (datafejl) viser ingen tal. */
export interface KlubTaeler {
  /** antal konti i Legende-ti-eren (seer_flair.tier = 3) */
  medlemmer: number;
  /** antal indlæg på væggen */
  indlaeg: number;
  /** seneste indlæg — null på en helt tom væg */
  senesteTid: string | null;
}

export async function getKlubTaeler(): Promise<KlubTaeler | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("klub_taeler");
    if (error) throw new Error(error.message);
    if (!data) return null;
    return {
      medlemmer: Number((data as { medlemmer: number }).medlemmer ?? 0),
      indlaeg: Number((data as { indlaeg: number }).indlaeg ?? 0),
      senesteTid: (data as { seneste_tid: string | null }).seneste_tid ?? null,
    };
  } catch (err) {
    console.warn("getKlubTaeler:", err);
    return null;
  }
}

/** Er INDLOGGEDE bruger Legende? Parametreløs funktion, der læser
 *  auth.uid() — svaret kan ikke styres af klienten. */
export async function getKlubMedlemskab(userId: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("er_klub_medlem");
    if (error) throw new Error(error.message);
    // userId er kun til signatur-læsbarhed — funktionen kigger selv
    void userId;
    return data === true;
  } catch (err) {
    console.warn("getKlubMedlemskab:", err);
    return false;
  }
}

/** Væggens startdata til server-rendering (pinned først, nyeste først).
 *  RLS'en er autoriteten: ikke-Legender kan overhovedet ikke læse —
 *  koden kalder kun, når medlemskabet allerede er slået fast. */
export async function getKlubIndlaeg(): Promise<KlubPost[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("klub_posts")
      .select("id, user_id, body, pinned, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      body: row.body,
      pinned: row.pinned,
      createdAt: Date.parse(row.created_at),
    }));
  } catch (err) {
    console.warn("getKlubIndlaeg:", err);
    return [];
  }
}
