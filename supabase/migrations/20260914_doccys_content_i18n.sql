-- ============================================================
-- Doccys: flersprogede skaber-bios og film-synopser
-- ============================================================
-- Kørsel: Supabase-dashboardet → SQL Editor → New query → klistr
-- hele filen ind → Run. Idempotent: kolonnerne tilføjes kun hvis
-- de mangler, og UPDATE'erne rører kun rækker, hvor oversættelsen
-- endnu ikke findes (is null).
--
-- Modell: den danske tekst forbliver i den oprindelige kolonne
-- (bio / synopsis) som canonical fallback; bio_i18n og
-- synopsis_i18n indeholder én nøgle pr. sprog (en, es, fr, de,
-- no, sv, fi). App'en vælger oversættelsen for det aktive sprog
-- og falder tilbage til dansk, hvis en nøgle mangler.

-- ---------- kolonner ----------
alter table public.creators      add column if not exists bio_i18n      jsonb;
alter table public.documentaries add column if not exists synopsis_i18n jsonb;

-- ============================================================
-- Skaber-bios
-- ============================================================

-- Nordlys Film
update public.creators set bio_i18n = jsonb_build_object(
  'en', 'A two-person film company from Iceland documenting climate, landscape and the people living in the middle of the change. Shot on 16mm, edited in Reykjavik.',
  'es', 'Una productora de dos personas de Islandia que documenta el clima, el paisaje y las personas que viven en medio del cambio. Rodada en 16 mm, montada en Reikiavik.',
  'fr', 'Une société de production islandaise de deux personnes qui documente le climat, le paysage et celles et ceux qui vivent au cœur du changement. Tourné en 16 mm, monté à Reykjavik.',
  'de', 'Eine zweiköpfige Filmproduktion aus Island, die Klima, Landschaft und die Menschen dokumentiert, die mitten im Wandel leben. Gedreht auf 16 mm, geschnitten in Reykjavík.',
  'no', 'Et tomanns filmselskap fra Island som dokumenterer klima, landskap og menneskene som lever midt i endringen. Spilt inn på 16 mm, klippet i Reykjavik.',
  'sv', 'Ett tvåmannas filmbolag från Island som dokumenterar klimat, landskap och människorna som lever mitt i förändringen. Inspelad på 16 mm, klippt i Reykjavik.',
  'fi', 'Kahden hengen elokuvayhtiö Islannista, joka dokumentoi ilmastoa, maisemaa ja ihmisiä, jotka elävät muutoksen keskellä. Kuvalaadultaan 16 mm, leikattu Reykjavíkissa.'
)
where handle = 'nordlys-film' and bio_i18n is null;

-- Havblik Medier
update public.creators set bio_i18n = jsonb_build_object(
  'en', 'Havblik Medier tells stories from the coast: fishermen, painters, archives and the voices that rarely reach land. Founded by two documentary filmmakers from Thyborøn.',
  'es', 'Havblik Medier cuenta historias de la costa: pescadores, pintores, archivos y las voces que rara vez llegan a tierra. Fundada por dos documentalistas de Thyborøn.',
  'fr', 'Havblik Medier raconte des histoires du littoral : pêcheurs, peintres, archives et ces voix qui atteignent rarement la terre ferme. Fondée par deux documentaristes de Thyborøn.',
  'de', 'Havblik Medier erzählt Geschichten von der Küste: Fischer, Maler, Archive und die Stimmen, die selten das Land erreichen. Gegründet von zwei Dokumentarfilmern aus Thyborøn.',
  'no', 'Havblik Medier forteller historier fra kysten: fiskere, malere, arkiver og stemmene som sjelden når land. Grunnlagt av to dokumentarister fra Thyborøn.',
  'sv', 'Havblik Medier berättar historier från kusten: fiskare, målare, arkiv och rösterna som sällan når land. Grundat av två dokumentärer från Thyborøn.',
  'fi', 'Havblik Medier kertoo rannikon tarinoita: kalastajia, maalareita, arkistoja ja ääniä, jotka harvoin kantautuvat maihin. Perustanut kaksi dokumentaristia Thyborønistä.'
)
where handle = 'havblik-medier' and bio_i18n is null;

-- Betonværket
update public.creators set bio_i18n = jsonb_build_object(
  'en', 'A Copenhagen collective making documentaries about architectural and labour history: cities, machines and the built environment.',
  'es', 'Un colectivo de Copenhague que realiza documentales de historia arquitectónica y laboral sobre ciudades, máquinas y el entorno construido.',
  'fr', 'Un collectif de Copenhague qui réalise des documentaires sur l''histoire architecturale et ouvrière : villes, machines et cadre bâti.',
  'de', 'Ein Kollektiv in Kopenhagen, das Dokumentarfilme zur Architektur- und Arbeitergeschichte dreht: über Städte, Maschinen und die gebaute Umwelt.',
  'no', 'Kollektiv i København som lager dokumentarer om arkitektur- og arbeiderhistorie: byer, maskiner og den bygde omgivelsen.',
  'sv', 'Kollektiv i Köpenhamn som gör dokumentärer om arkitektur- och arbetarhistoria: städer, maskiner och den byggda miljön.',
  'fi', 'Kööpenhaminalainen kollektiivi, joka tekee dokumentteja arkkitehtuuri- ja työläishistoriasta: kaupungeista, koneista ja rakennetusta ympäristöstä.'
)
where handle = 'betonvaerket' and bio_i18n is null;

-- ============================================================
-- Film-synopser
-- ============================================================

-- Isens Sidste Vinter
update public.documentaries set synopsis_i18n = jsonb_build_object(
  'en', 'For three years, Nordlys Film followed glaciologist Elín on her final field mission on Vatnajökull. A quiet film about ice that disappears and a life that remains.',
  'es', 'Durante tres años, Nordlys Film siguió a la glacióloga Elín en su última misión de campo en el Vatnajökull. Una película serena sobre el hielo que desaparece y la vida que permanece.',
  'fr', 'Pendant trois ans, Nordlys Film a suivi la glaciologue Elín lors de sa dernière mission de terrain sur le Vatnajökull. Un film silencieux sur la glace qui disparaît et une vie qui demeure.',
  'de', 'Drei Jahre lang begleitete Nordlys Film die Glaziologin Elín auf ihrer letzten Feldmission am Vatnajökull. Ein stiller Film über Eis, das verschwindet, und ein Leben, das bleibt.',
  'no', 'I tre år fulgte Nordlys Film glasiologen Elín på hennes siste feltmisjon på Vatnajökull. En stille film om is som forsvinner, og et liv som blir igjen.',
  'sv', 'I tre år följde Nordlys Film glaciologen Elín på hennes sista fältuppdrag på Vatnajökull. En stilla film om is som försvinner och ett liv som blir kvar.',
  'fi', 'Kolmen vuoden ajan Nordlys Film seurasi glasiologi Elíniä hänen viimeisellä kenttätehtävällään Vatnajökullilla. Hiljainen elokuva jäätiköstä, joka katoaa, ja elämästä, joka jää jäljelle.'
)
where slug = 'isens-sidste-vinter' and synopsis_i18n is null;

-- Saltmaleren
update public.documentaries set synopsis_i18n = jsonb_build_object(
  'en', 'The painter Agnes has painted the same salt marsh for 42 years. As the sea rises, her motifs begin to vanish beneath the water — and her final exhibition becomes a farewell.',
  'es', 'La pintora Agnes ha pintado la misma marisma salina durante 42 años. Cuando el mar sube, sus motivos empiezan a desaparecer bajo el agua, y su última exposición se convierte en una despedida.',
  'fr', 'La peintre Agnes peint la même marée salée depuis 42 ans. À mesure que la mer monte, ses motifs disparaissent sous l''eau — et sa dernière exposition devient un adieu.',
  'de', 'Die Malerin Agnes malt seit 42 Jahren dieselbe Salzwiese. Während das Meer steigt, verschwinden ihre Motive unter Wasser — und ihre letzte Ausstellung wird zu einem Abschied.',
  'no', 'Malaren Agnes har malt den samme saltvannsengen i 42 år. Når havet stiger, begynner motivene hennes å forsvinne under vann — og hennes siste utstilling blir et farvel.',
  'sv', 'Målaren Agnes har målat samma saltäng i 42 år. När havet stiger börjar hennes motiv försvinna under vattnet — och hennes sista utställning blir ett farväl.',
  'fi', 'Maalari Agnes on maalannut samaa suolaniittyä 42 vuoden ajan. Kun meri nousee, hänen aiheensa alkavat kadota veden alle — ja viimeisestä näyttelystään tulee jäähyväiset.'
)
where slug = 'saltmaleren' and synopsis_i18n is null;

-- Byen under Betonen
update public.documentaries set synopsis_i18n = jsonb_build_object(
  'en', 'Beneath Copenhagen''s concrete surfaces lies a city no one remembers anymore: factories, tram lines and apartments. Betonværket digs through archives and talks to the last residents who lived there.',
  'es', 'Bajo las superficies de hormigón de Copenhague hay una ciudad que ya nadie recuerda: fábricas, tranvías y viviendas. Betonværket excava en archivos y habla con los últimos que vivieron allí.',
  'fr', 'Sous les surfaces de béton de Copenhague dort une ville que plus personne ne connaît : usines, tramways et appartements. Betonværket fouille les archives et rencontre les derniers habitants.',
  'de', 'Unter Kopenhagens Betonflächen liegt eine Stadt, an die sich niemand mehr erinnert: Fabriken, Straßenbahnen und Wohnungen. Betonværket wühlt in Archiven und spricht mit den Letzten, die dort lebten.',
  'no', 'Under Københavns betongflater ligger en by ingen lengre husker: fabrikker, sporvei og leiligheter. Betonværket graver i arkiver og snakker med de siste som bodde der.',
  'sv', 'Under Köpenhamns betongytor ligger en stad ingen längre minns: fabriker, spårvägar och lägenheter. Betonværket gräver i arkiv och talar med de sista som bodde där.',
  'fi', 'Kööpenhaminän betonin alla lepää kaupunki, jota kukaan ei enää muista: tehtaita, raitiovaunuja ja asuntoja. Betonværket kaivaa arkistoissa ja puhuu viimeisten siellä asuneiden kanssa.'
)
where slug = 'byen-under-betonen' and synopsis_i18n is null;

-- Havets Arkiv
update public.documentaries set synopsis_i18n = jsonb_build_object(
  'en', 'In the attic of Havblik Medier sit 300 hours of tape recordings from vanished coastal communities. Editor Marianne re-reads the sound and builds an archive of voices the sea took.',
  'es', 'En el desván de Havblik Medier hay 300 horas de grabaciones de comunidades costeras desaparecidas. La editora Marianne relee el sonido y construye un archivo de voces que el mar se llevó.',
  'fr', 'Dans les combles de Havblik Medier reposent 300 heures d''enregistrements de communautés côtières disparues. La monteuse Marianne relit le son et construit une archive de voix que la mer a emportées.',
  'de', 'Auf dem Dachboden von Havblik Medier liegen 300 Stunden Bandaufnahmen verschwundener Küstengemeinschaften. Cutterin Marianne liest den Klang neu und baut ein Archiv der Stimmen, die das Meer nahm.',
  'no', 'På loftet til Havblik Medier ligger 300 timer med båndopptak av bortevegne kystsamfunn. Klipperen Marianne gjenleser lyden og bygger et arkiv av stemmer havet tok.',
  'sv', 'På Havblik Mediers vind ligger 300 timmar bandupptagningar från försvunna kustsamhällen. Redaktören Marianne återläser ljudet och bygger ett arkiv av röster som havet tog.',
  'fi', 'Havblik Medierin ullakolla on 300 tuntia nauhoituksia kadonneista rannikkoyhteisöistä. Leikkaaja Marianne lukee äänen uudelleen ja rakentaa arkiston meren vietämistä äänistä.'
)
where slug = 'havets-arkiv' and synopsis_i18n is null;

-- Skovens Lys
update public.documentaries set synopsis_i18n = jsonb_build_object(
  'en', 'A year in an old Danish deciduous forest, filmed without interviews or voiceover. Only animals, weather and light — and a forester watching over it all.',
  'es', 'Un año en un antiguo bosque caducifolio danés, grabado sin entrevistas ni voz en off. Solo animales, clima y luz, y un guarda forestal que lo observa todo.',
  'fr', 'Une année dans une vieille forêt de feuillus danoise, filmée sans entretien ni voix off. Uniquement des animaux, la météo et la lumière — et une garde forestière qui veille sur tout.',
  'de', 'Ein Jahr in einem alten dänischen Laubwald, gedreht ohne Interviews und Off-Stimme. Nur Tiere, Wetter und Licht — und ein Förster, der über alles wacht.',
  'no', 'Et år i en gammel dansk løvskog, spilt inn uten intervju og fortellerstemme. Kun dyr, vær og lys — og en skogbruker som passer på alt.',
  'sv', 'Ett år i en gammal dansk lövskog, inspelad utan intervjuer och berättarröst. Bara djur, väder och ljus — och en skogvaktare som ser över allt.',
  'fi', 'Vuosi vanhassa tanskalaisessa lehtimetsässä, kuvattuna ilman haastatteluja tai kertojan ääntä. Vain eläimiä, säätä ja valoa — sekä metsänvartija, joka pitää kaiken silmällä.'
)
where slug = 'skovens-lys' and synopsis_i18n is null;

-- Maskinen der Drømte
update public.documentaries set synopsis_i18n = jsonb_build_object(
  'en', 'In a closed automation workshop in Jutland sits a 40-year-old stencilling machine, drawing. Betonværket follows the technician who believes the machine has intentions.',
  'es', 'En un taller de automatización cerrado de Jutlandia hay una máquina de estarcido de 40 años que dibuja. Betonværket sigue al técnico que cree que la máquina tiene intenciones.',
  'fr', 'Dans un atelier d''automatisation fermé du Jutland se trouve une machine à pochoir de 40 ans, qui dessine. Betonværket suit le technicien persuadé que la machine a des intentions.',
  'de', 'In einer stillgelegten Automatisierungswerkstatt in Jütland sitzt eine 40 Jahre alte Schabloniermaschine und zeichnet. Betonværket begleitet den Techniker, der glaubt, die Maschine habe Absichten.',
  'no', 'I et lukket automasjonsverksted i Jylland sitter en 40 år gammel stensilmaskin og tegner. Betonværket følger teknikeren som tror maskinen har intensjoner.',
  'sv', 'I en stängd automationsverkstad i Jylland sitter en 40 år gammal stencilmaskin och ritar. Betonværket följer tekniken som tror att maskinen har avsikter.',
  'fi', 'Suljetulla automaatiopajalla Jyllannissa istuu 40-vuotias sapluunakone ja piirtää. Betonværket seuraa teknikkoa, joka uskoo, että koneella on aikomuksia.'
)
where slug = 'maskinen-der-dromte' and synopsis_i18n is null;