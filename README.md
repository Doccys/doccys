# Doccys

Minimalistisk, reklamefri streamingtjeneste for uafhængige dokumentarer.
Bygget med **Next.js (App Router) + TypeScript + Tailwind CSS v4**.

## Kør projektet

```bash
npm install
npm run dev
```

Åbn derefter <http://localhost:3000>.

## Mål & principper

- **Ingen reklamer** — nogensinde. Kataloget finansieres alene af abonnementer.
- **Pay-per-completion** — skaberen udbetales først, når en visning er
  1) færdigset og 2) valideret som ægte af anti-fraud-systemet.
- **ML-klar logning** — alle rå data om brugeradfærd gemmes struktureret, så en
  trænet model senere kan erstatte de regelbaserede heuristikker.
- **Internationaliseret** — otte sprog via next-intl (se nedenfor).

## Internationalisering (next-intl)

Understøttede sprog: **dansk (da, standard), engelsk (en), spansk (es),
fransk (fr), tysk (de), norsk (no), svensk (sv), finsk (fi)**.

- URL'erne er altid sprog-prefikset: `/da/watch/...`, `/en/creators`, osv.
  Middleware (`src/middleware.ts`) redirecter upræfiksetede stier
  (`/watch/x` → `/da/watch/x`), og rod (`/`) → standardsproget.
- Oversættelser ligger i `messages/<locale>.json` — UI-strenge til alle
  sider (header, footer, hjemmeside, skabere, skaberprofil, indtjening,
  filmografi, watch, kommentarer, gem-knap, profil, abonnement,
  seerhistorik, planer) samt to vocabular-namespaces:
  - `genres` / `countries` — oversættelser af databasens kontrollerede
    danske værdier ('Klima', 'Island', …). Nøglen ER den danske DB-værdi;
    ukendte værdier vises råt via `src/lib/i18n/content.ts`
    (`localizedGenres` / `localizedCountry`) — aldrig en fejl.
  - `meta` — browserfanens titel/beskrivelse (`generateMetadata` i layoutet).
- Struktur:
  - `src/i18n/routing.ts` — sprogliste og standardsprog
  - `src/i18n/navigation.ts` — locale-bevidst `Link`/`useRouter`/`usePathname`
    (brug altid disse i stedet for `next/link` interne links)
  - `src/i18n/request.ts` — loader beskeder pr. sprog
  - `src/app/[locale]/` — alle sider ligger under sprog-segmentet
- Sprogvælger i headeren (`LanguageSwitcher`) skifter sprog og bevarer
  den aktuelle side via next-intl's router.
- API-ruter (`src/app/api/`) ligger bevidst UDEN for `[locale]` — de er
  sproguafhængige.

### Indhold på flere sprog (DB + beskeder)

Redaktionelt indhold (skaber-bio'er, filmsynopser) oversættes i databasen —
beskedfilerne er kun til UI- og vocabular-tekst:

- Dansk tekst er kanonisk og bor i de oprindelige kolonner
  (`creators.bio`, `documentaries.synopsis`).
- Oversættelser ligger i jsonb-kolononnerne `creators.bio_i18n` og
  `documentaries.synopsis_i18n` som `{"en": "...", "es": "...", …}` —
  *uden* en `da`-nøgle (dansk er jo selve grundkolonnen).
- `src/lib/data/catalog.ts` løser sproget via `localizedText()`
  (fallback til dansk, hvis sproget mangler) — alle tekst-returnerende
  funktioner tager en valgfri `locale`-parameter, som siderne sender med
  fra `params.locale`. API-ruter kalder uden locale og får dansk.
- Filmtitler og skabernavne vises altid på originalsproget (bevidst valg).
- Tal, beløb og datoer formateres i `<sprog>-DK` (`src/lib/utils/format.ts`
  tager valgfri `locale`) — beløb er altid i kroner.
- Migration: `supabase/migrations/20260914_doccys_content_i18n.sql`
  (idempotent — kolonnerne tilføjes med `add column if not exists`, og
  række-opdateringerne er guarded af `is null`).

## Mappestruktur

```
messages/                          Oversættelser pr. sprog (da, en, es, fr, de, no, sv, fi)
src/
├── i18n/
│   ├── routing.ts                  Sprogliste + standardsprog
│   ├── navigation.ts               Locale-bevidst Link/useRouter/usePathname
│   └── request.ts                  Loader beskeder pr. sprog
├── middleware.ts                   next-intl-middleware (sprog-prefiks i URL)
├── app/
│   ├── [locale]/                   Alle sider ligger under sprog-segmentet
│   │   ├── layout.tsx              Rodlayout: skrifttyper, header, footer
│   │   ├── page.tsx                Forside: hero + katalog (fra databasen)
│   │   ├── not-found.tsx           404-side
│   │   ├── watch/[slug]/page.tsx   Afspiller-side: video + gem-knap + diskussion
│   │   ├── profile/page.tsx        Brugerprofil: historik, gemte film, abonnement
│   │   ├── login/page.tsx          Login & registrering (supabase.auth)
│   │   ├── creators/page.tsx      Oversigt over skabere
│   │   └── creator/[handle]/page.tsx  Skaberprofil: statistik + indtjening
│   └── api/                        Sproguafhængige API-ruter
│       ├── views/sessions/                  POST  — start session
│       ├── views/sessions/[id]/             GET   — session + dom
│       ├── views/sessions/[id]/events/      POST  — rå hændelses-log (ML-ready)
│       ├── views/sessions/[id]/validate/    POST  — kør validering (+ DB-skriv)
│       └── comments/                        GET/POST — diskussion (i databasen)
├── components/
│   ├── layout/                     Header, Footer, LanguageSwitcher, UserMenu
│   ├── auth/AuthForm.tsx           Login/registrering — ét kort, to tilstande
│   ├── logo/DoccysMark.tsx         Guldlinsen-blænde (brand-mark)
│   ├── home/                       Hero-banner
│   ├── documentary/                Kort, grid + SaveFilmButton
│   ├── player/                     VideoPlayer (tracking) + CommentSection
│   ├── profile/                    Abonnement, historik
│   ├── creator/                    StatCard, EarningsPanel, FilmographyTable
│   └── ui/                         SectionHeading m.m.
└── lib/
    ├── types.ts                    Alle typer — kerne-domæne + anti-fraud
    ├── data/catalog.ts             Async DB-data-lag (afløser mockData)
    ├── data/plans.ts               Abonnementsplaner (Gratis, Doccys+, Patron)
    ├── store/memoryStore.ts        DoccysStore-kontrakten + in-memory-reference
    ├── store/supabaseStore.ts     DoccysStore mod Supabase (sessions, log, kommentarer)
    ├── analytics/features.ts       ML-feature-ekstraktion (rålog → vektor)
    ├── analytics/viewValidation.ts Heuristikker + trust-score + dom
    ├── supabase/
    │   ├── config.ts               Læser env-variabler + er-opsat?-tjek
    │   ├── client.ts                Browser-klient (createBrowserClient)
    │   ├── server.ts               Server-klient (cookies via @supabase/ssr)
    │   ├── middleware.ts            Session-refresh til middleware
    │   └── database.types.ts       Håndskrevne Database-typer (tabeller)
    └── utils/format.ts             Dansk formatering (DKK, dato, varighed)
supabase/migrations/                SQL-migrationer (skema + RLS + seed)
```

## Anti-fraud / View-validation

Datastrømmen pr. afspilning:

1. **Sessionstart** — `POST /api/views/sessions` opretter en `ViewSession` og
   gemmer `DeviceMetadata` (user-agent, skærm, tidszone, sprog, CPU-kerner,
   touchpunkter).
2. **Rålog** — afspilleren sender batches til
   `POST /api/views/sessions/[id]/events`: `play`, `pause`, `seek`,
   `heartbeat` (hvert 10. sek), `complete`, `session_end`, `error` — hver med
   klient-tidsstempel og position i filmen. Loggen er **append-only** og bevares
   uændret; hændelser bærer et `raw`-felt, hvor intet ekstra felt kasseres.
3. **Validering** — `POST /api/views/sessions/[id]/validate` kører
   `extractFeatures()` → `validateSession()`:
   - Feature-vektoren (`ViewFeatures`) er renelige tal og direkte
     ML-ready (watchedRatio, uniqueWatchedRatio, heartbeatJitterSec,
     seeksPerHour, timelineAnomaly, deviceSuspicionScore, …).
   - Heuristikkerne i dag: umulig tidslinje (set tid > vægur-tid), lav
     dækkelse ved completion (spol-fraud), bot-agtig hjerteslagskadence,
     spol-mønstre, hændelsesflod og enhedsanomalier.
   - Resultat: `SessionVerdict` med trust-score, menneskeligt læsbare
     `FraudSignal`s, features og `modelVersion`.
4. **Udbetaling** — kun dommet `valid` tæller som betalbar completion i
   pay-per-completion-modellen (skaberprofilen viser tallene).

**ML-fremtid:** når der er indsamlet nok ægte sessioner, kan en model trænes
direkte på `ViewSession.events` (rådata) og/eller `ViewFeatures` (færdige
features). `modelVersion` på dommen gør det muligt at revurdere gamle domme med
en ny model uden at miste historikken.

## Supabase (database & auth)

Installeret: `@supabase/supabase-js` + `@supabase/ssr` (cookie-baseret
session i App Router, så login-status deles mellem browser og server).

**Sådan kobler du projektet på:**

1. Opret et projekt på <https://supabase.com> (gratis tier er nok).
2. Åbn dashboardet → dit projekt → **Settings → API** og kopicér
   *Project URL* og *anon public*-nøglen.
3. Indsæt dem i **`.env.local`** (skabelon: `.env.example`):

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```

4. Genstart dev-serveren. Filen er git-ignoreret — nøglen kommer aldrig
   i repositoriet.

**Klienterne** (`src/lib/supabase/`):

| Fil | Bruges i | Funktion |
| --- | --- | --- |
| `client.ts` | Client components | `createClient()` → login, realtime m.m. |
| `server.ts` | Server components, route handlers | `await createClient()` → læser sessionen fra request-cookies |
| `middleware.ts` | `src/middleware.ts` | Refresher udløbne tokens på hvert sidekald (sammensat med next-intl, der stadig håndterer sprog-routing) |
| `config.ts` | alle tre | Fælles env-læsning med klar fejlbesked |

**Indtil værdierne er udfyldt**, registrerer `config.ts` at variablerne er
tomme: middlewaren springer session-refreshen over, og klienterne kaster
først en forklarende fejl, hvis man faktisk kalder dem.

## Database-tabeller (Supabase)

Skemaet ligger i **`supabase/migrations/`** (idempotente — kan køres direkte
i Supabase-dashboardet → **SQL Editor**). Syv tabeller:

| Tabel | Indhold | Adgang (RLS) |
| --- | --- | --- |
| `creators` | Filmselskaber (navn, handle, bio, land) | Offentlig læsning |
| `documentaries` | Kataloget (titel, synopsis, varighed, video-URL, betalingsrate, `sort_order` = rækkefølgen på forsiden) | Offentlig læsning |
| `watch_history` | Én række pr. (bruger, film): færdigsettelse + progress | Kun egne rækker (`auth.uid() = user_id`) |
| `saved_films` | Brugerens watchlist (sammensat PK: user_id + slug) | Kun egne rækker |
| `view_sessions` | Anti-fraud-sessioner pr. afspilning (enhedsmetadata + verdict som jsonb) | Egne rækker; gæstesessioner (user_id null) fungerer som bearer-tokens |
| `view_events` | Append-only rålog pr. session (`seq`-orden, payload som jsonb — ML-træningsdata) | Via parent-sessionens adgang |
| `comments` | Offentlig diskussion under hver film (user_id kan ikke forfalskes) | Alle kan læse; indsæt kun eget/null user_id |

Designvalg:

- **Stats-kolonner** (`total_views`, `valid_completions`, …) på `documentaries`
  er redaktionelle — de opdateres af et service-role-job senere; en
  almindelig bruger-token kan (med hensigt) ikke skrive til dem.
- **Watch-history skrives kun ved gyldig completion**: `validate`-ruten kalder
  `recordValidCompletion()` efter dommet `valid` (upsert på
  `(user_id, documentary_slug)`). Delvis fremskridt følger senere.
- **Gemte film** skrives direkte fra browseren (`SaveFilmButton`) — RLS
  sikrer, at man kun kan se og røre egne rækker, så ingen API-rute behøves.
- **Sessions + rålog + kommentarer** ligger bag `DoccysStore`-kontrakten
  (`store/memoryStore.ts` definerer den, `store/supabaseStore.ts` implementerer
  den mod databasen) — alt over ruterne mærker ikke forskellen, men data
  overlever nu genstarter, og råloggen er klar til ML-træning.

Data-laget er **`src/lib/data/catalog.ts`** — alle async-funktioner, som
siderne kalder i stedet for det gamle mock-data (`mockData.ts` er slettet).
Typerne i `src/lib/supabase/database.types.ts` er håndskrevne (kan senere
genereres med `npx supabase gen types` for fuld paritet).

## Login & registrering (supabase.auth)

- Siden **`/[locale]/login`** (`AuthForm`) har ét kort med begge flow:
  en tab-skifter mellem *Log ind* og *Opret konto*. Alle tekster ligger i
  `auth`-navnerummet i `messages/*.json` — oversat til alle 8 sprog.
- **Login:** `signInWithPassword` → ved succes videresendes man til
  `/[locale]/profile` (sessionen gemmes i cookies via `@supabase/ssr`,
  så også server-components ser den).
- **Registrering:** `signUp` — kræver projektet e-mail-bekræftelse, vises
  en "tjek din indbakke"-besked i stedet for en omdirigering (sessions
  udstedes først, når adressen er bekræftet).
- **Fejl** oversættes via supabase-fejlkoder (`invalid_credentials`,
  `user_already_exists`, `email_not_confirmed`, `weak_password`, …) til
  `auth.errors.*` med generisk fallback.
- **I headeren** viser `UserMenu`:
  - *ikke logget ind:* et diskret champagne-farvet "Log ind"-link + den
    sædvanlige "Min profil"-nav-link.
  - *logget ind:* "Min profil"-knappen erstattes af en bruger-chip
    (initial + e-mail) med dropdown: "Min profil" og "Log ud".

## Den loggede bruger i appen

Identiteten afgøres altid **server-side** ud fra Supabase-sessionen i
requestens cookies — klienten kan ikke opgive eller forfalske den:

- **Profil (`/[locale]/profile`)**: læser sessionen via server-klienten.
  Logget ind → rigtig e-mail, "Medlem siden" og standardplanen (Gratis),
  samt brugerens egne rækker fra `watch_history` og `saved_films`
  (hentet med `catalog.ts` + RLS). Logget ud → "Log ind for at se din
  profil"-CTA.
- **Kommentarer (`POST /api/comments`)**: er seeren logget ind, bruges
  dens e-mail (eller gemte fulde navn) + `userId` — et `authorName` fra
  klienten ignoreres. Gæster kommenterer stadig under frit navn.
  `Comment`-typen bærer nu `userId`, så databasen senere kan knytte
  kommentarer til konti.
- **View-sessions (`POST /api/views/sessions`)**: anti-fraud-sessioner
  kobles automatisk på den loggede brugers id — et `userId` fra klienten
  accepteres ikke, så visninger ikke kan tilskrives andre.

**Næste skridt med Supabase:**

- Delvis seerfremdrift (progressRatio < 1) i `watch_history` — pt. skrives
  kun gyldige completions.
- Service-role-job der aggregérer ægte visningsdata op i
  `documentaries`-statistikken (i dag redaktionelt seedet).
- Træn en ML-model direkte på `view_events`-råloggen, når der er indsamlet
  nok ægte sessioner (`modelVersion` gør gamle domme reviderbare).
- Udvid `next.config.ts` med billed-domæner, når plakater/CDN kobles på.