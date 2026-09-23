-- ============================================================
-- Doccys: global udrulning — seed-indhold på de 5 nye sprog
-- ============================================================
-- Kørsel: Supabase-dashboardet → SQL Editor → New query →
-- klistre hele filen ind → Run. Idempotent.
--
-- 20260923_global_sprog.sql udvider GRÆNSEFLADEN; DENNE migration
-- udvider INHOLDET: de 3 seeded skaber-bios, 6 film-synopses og
-- 3 samlinger (titel + beskrivelse) får japansk, forenklet
-- kinesisk, italiensk, brasiliansk portugisisk og hindi — vinduet
-- mod verden skal ikke vise dansk, bare fordi _i18n-objektet
-- mangler nøglerne (fald tilbage til canonical er ellers reglen).
--
-- Rækkerne HAR allerede 7-sprogs-objektet fra 20260914/20260920,
-- så "… is null" ville aldrig ramme. I stedet MERGES de 5 nye
-- nøgler ind, og hver sætning vogtes med "not (… ? 'ja')": hele
-- 5-nøgle-objektet tilføjes i ÉN sætning, så 'ja' findes præcis
-- når sætningen er kørt — genkørsel og delvist tilstand er dermed
-- dækket, og dashboard-redigerede værdier bliver ikke overskrevet.
--
-- Oversættelserne er genereret med scripts/i18n-translate.mjs
-- (--payload-tilstand, gpt-4o) og gennemgået manuelt.
--
-- Uafhængig af 20260923_global_sprog.sql (ingen constraints røres)
-- — rækkefølgen er ligegyldig, men begge skal være kørt før
-- sitet vises med de nye sprog.

-- 1) Skaber-bios (creators.bio_i18n)

update public.creators
   set bio_i18n = bio_i18n || jsonb_build_object(
     'ja', 'アイスランドの二人組の映画会社で、気候、風景、変化の中で生きる人々を記録しています。16mmで撮影され、レイキャビクで編集されています。',
     'zh', '来自冰岛的双人电影公司，记录气候、风景和生活在变化中的人们。用16毫米胶片拍摄，在雷克雅未克剪辑。',
     'it', 'Una compagnia cinematografica a due persone dall''Islanda, che documenta il clima, il paesaggio e le persone che vivono nel mezzo del cambiamento. Girato in 16mm, montato a Reykjavik.',
     'pt', 'Uma produtora de filmes de duas pessoas da Islândia, que documenta o clima, a paisagem e as pessoas que vivem em meio à mudança. Filmado em 16mm, editado em Reykjavik.',
     'hi', 'आइसलैंड की एक दो-व्यक्ति फिल्म कंपनी, जो जलवायु, परिदृश्य और उन लोगों का दस्तावेजीकरण करती है जो परिवर्तन के बीच में रहते हैं। 16mm पर शूट किया गया, रेकजाविक में संपादित।'
   )
 where handle = 'nordlys-film'
   and not (bio_i18n ? 'ja');

update public.creators
   set bio_i18n = bio_i18n || jsonb_build_object(
     'ja', 'Havblik Medierは、海岸からの物語を伝えます：漁師、画家、アーカイブ、そして陸に届くことの少ない声。ティボロン出身の2人のドキュメンタリー作家によって設立されました。',
     'zh', 'Havblik Medier讲述海岸的故事：渔民、画家、档案和那些很少传到陆地的声音。由来自Thyborøn的两位纪录片制作者创立。',
     'it', 'Havblik Medier racconta storie dalla costa: pescatori, pittori, archivi e le voci che raramente raggiungono la terraferma. Fondata da due documentaristi di Thyborøn.',
     'pt', 'Havblik Medier conta histórias da costa: pescadores, pintores, arquivos e as vozes que raramente chegam à terra. Fundado por dois documentaristas de Thyborøn.',
     'hi', 'Havblik Medier तट से कहानियाँ बताता है: मछुआरे, चित्रकार, अभिलेखागार और वे आवाज़ें जो शायद ही कभी भूमि तक पहुँचती हैं। थायबोरोन के दो वृत्तचित्र निर्माताओं द्वारा स्थापित।'
   )
 where handle = 'havblik-medier'
   and not (bio_i18n ? 'ja');

update public.creators
   set bio_i18n = bio_i18n || jsonb_build_object(
     'ja', 'コペンハーゲンのコレクティブで、都市、機械、建築環境に関する建築および労働史のドキュメンタリーを制作しています。',
     'zh', '位于哥本哈根的集体，制作关于城市、机器和建筑环境的建筑和工人历史纪录片。',
     'it', 'Collettivo a Copenaghen che realizza documentari storici sull''architettura e il lavoro riguardanti città, macchine e l''ambiente costruito.',
     'pt', 'Coletivo em Copenhague que faz documentários históricos sobre arquitetura e trabalho em cidades, máquinas e o ambiente construído.',
     'hi', 'कोपेनहेगन में एक सामूहिक जो शहरों, मशीनों और निर्मित पर्यावरण के बारे में वास्तुकला और श्रमिक इतिहास वृत्तचित्र बनाता है।'
   )
 where handle = 'betonvaerket'
   and not (bio_i18n ? 'ja');

-- 2) Film-synopses (documentaries.synopsis_i18n)

update public.documentaries
   set synopsis_i18n = synopsis_i18n || jsonb_build_object(
     'ja', '3年間、Nordlys Filmは氷河学者のエリンを彼女の最後のフィールドミッションであるVatnajökullに同行しました。消えゆく氷と残される人生を描いた静かな映画です。',
     'zh', '在三年时间里，Nordlys Film 跟随冰川学家 Elín 进行她在 Vatnajökull 的最后一次实地任务。这是一部关于消失的冰和留下的生活的宁静电影。',
     'it', 'Per tre anni, Nordlys Film ha seguito la glaciologa Elín nella sua ultima missione sul campo a Vatnajökull. Un film silenzioso sul ghiaccio che scompare e una vita che resta.',
     'pt', 'Por três anos, a Nordlys Film acompanhou a glacióloga Elín em sua última missão de campo em Vatnajökull. Um filme silencioso sobre o gelo que desaparece e uma vida que fica para trás.',
     'hi', 'तीन वर्षों तक नॉरडलीस फिल्म ने ग्लेशियोलॉजिस्ट एलिन का अनुसरण किया उनकी अंतिम फील्ड मिशन पर वत्नाजोकुल में। बर्फ के गायब होने और पीछे छूटे जीवन की एक शांत फिल्म।'
   )
 where slug = 'isens-sidste-vinter'
   and not (synopsis_i18n ? 'ja');

update public.documentaries
   set synopsis_i18n = synopsis_i18n || jsonb_build_object(
     'ja', '画家のアグネスは42年間、同じ塩湿地を描き続けてきました。海面が上昇するにつれ、彼女のモチーフは水中に消え始め、彼女の最後の展示会は別れの場となります。',
     'zh', '画家 Agnes 画了同一片盐沼 42 年。当海水上升时，她的画作开始消失在水下——她的最后一次展览成为告别。',
     'it', 'La pittrice Agnes ha dipinto la stessa palude salata per 42 anni. Quando il mare sale, i suoi soggetti iniziano a scomparire sotto l''acqua — e la sua ultima mostra diventa un addio.',
     'pt', 'A pintora Agnes pintou o mesmo pântano salgado por 42 anos. Quando o mar sobe, seus motivos começam a desaparecer sob a água — e sua última exposição se torna uma despedida.',
     'hi', 'चित्रकार एग्नेस ने 42 वर्षों तक एक ही नमक दलदल को चित्रित किया है। जब समुद्र बढ़ता है, तो उसके चित्र पानी के नीचे गायब होने लगते हैं — और उसकी अंतिम प्रदर्शनी एक विदाई बन जाती है।'
   )
 where slug = 'saltmaleren'
   and not (synopsis_i18n ? 'ja');

update public.documentaries
   set synopsis_i18n = synopsis_i18n || jsonb_build_object(
     'ja', 'コペンハーゲンのコンクリートの下には、誰も覚えていない街があります：工場、路面電車、アパート。Betonværketはアーカイブを掘り起こし、そこに住んでいた最後の人々と話します。',
     'zh', '在哥本哈根的混凝土下，隐藏着一个无人记得的城市：工厂、有轨电车和公寓。Betonværket 在档案中挖掘，并与最后的居民交谈。',
     'it', 'Sotto le superfici di cemento di Copenaghen si trova una città che nessuno ricorda più: fabbriche, tram e appartamenti. Betonværket scava negli archivi e parla con gli ultimi che ci hanno vissuto.',
     'pt', 'Sob as superfícies de concreto de Copenhague, há uma cidade que ninguém mais lembra: fábricas, bondes e apartamentos. Betonværket escava nos arquivos e conversa com os últimos que viveram lá.',
     'hi', 'कोपेनहेगन के कंक्रीट के नीचे एक शहर है, जिसे अब कोई याद नहीं करता: कारखाने, ट्रामवे और अपार्टमेंट। बेतोनवेरकेट अभिलेखागार में खोज करता है और उन अंतिम लोगों से बात करता है, जो वहां रहते थे।'
   )
 where slug = 'byen-under-betonen'
   and not (synopsis_i18n ? 'ja');

update public.documentaries
   set synopsis_i18n = synopsis_i18n || jsonb_build_object(
     'ja', 'Havblik Medierの屋根裏には、消えた沿岸コミュニティの300時間の録音があります。編集者のマリアンヌは音を再読し、海に奪われた声のアーカイブを構築します。',
     'zh', '在 Havblik Medier 的阁楼上，有 300 小时的录音带记录了消失的沿海社区。编辑 Marianne 重听这些声音，建立了一个被海洋带走的声音档案。',
     'it', 'Nel solaio di Havblik Medier ci sono 300 ore di registrazioni di comunità costiere scomparse. L''editrice Marianne riascolta i suoni e costruisce un archivio di voci che il mare ha preso.',
     'pt', 'No sótão da Havblik Medier estão 300 horas de gravações de comunidades costeiras desaparecidas. A editora Marianne relê o som e constrói um arquivo de vozes que o mar levou.',
     'hi', 'हवब्लिक मीडियर्स के अटारी में 300 घंटे की टेप रिकॉर्डिंग्स हैं लुप्त तटीय समुदायों की। संपादक मरियाने ध्वनि को फिर से पढ़ती हैं और आवाजों का एक अभिलेख बनाती हैं, जिसे समुद्र ने ले लिया।'
   )
 where slug = 'havets-arkiv'
   and not (synopsis_i18n ? 'ja');

update public.documentaries
   set synopsis_i18n = synopsis_i18n || jsonb_build_object(
     'ja', 'デンマークの古い広葉樹林での1年間、インタビューやナレーションなしで撮影されました。動物、天気、光だけ—そしてすべてを見守る森林管理者。',
     'zh', '在一片古老的丹麦阔叶林中度过的一年，没有采访和旁白。只有动物、天气和光线——以及一个观察一切的护林员。',
     'it', 'Un anno in una vecchia foresta di latifoglie danese, girato senza interviste e voiceover. Solo animali, tempo e luce — e un forestale che osserva tutto.',
     'pt', 'Um ano em uma antiga floresta de folhas largas dinamarquesa, filmado sem entrevistas e narração. Apenas animais, clima e luz — e um silvicultor que observa tudo.',
     'hi', 'एक पुराने डेनिश पर्णपाती वन में एक वर्ष, बिना साक्षात्कार और वॉयसओवर के रिकॉर्ड किया गया। केवल जानवर, मौसम और प्रकाश — और एक वन उपयोगकर्ता, जो सब कुछ देखता है।'
   )
 where slug = 'skovens-lys'
   and not (synopsis_i18n ? 'ja');

update public.documentaries
   set synopsis_i18n = synopsis_i18n || jsonb_build_object(
     'ja', 'ユランの閉鎖された自動化工場で、40年前のステンシル機が描いています。Betonværketは、機械に意図があると信じる技術者を追います。',
     'zh', '在日德兰的一个封闭自动化车间里，一台 40 年的刻印机在绘图。Betonværket 跟随一位相信机器有意图的技术员。',
     'it', 'In un laboratorio di automazione chiuso nello Jutland, una macchina da stencil di 40 anni disegna. Betonværket segue il tecnico che crede che la macchina abbia intenzioni.',
     'pt', 'Em uma oficina de automação fechada na Jutlândia, uma máquina de estêncil de 40 anos desenha. Betonværket segue o técnico que acredita que a máquina tem intenções.',
     'hi', 'जटलैंड में एक बंद स्वचालन कार्यशाला में एक 40 साल पुरानी स्टेंसिलिंग मशीन बैठी है और चित्र बनाती है। बेतोनवेरकेट उस तकनीशियन का अनुसरण करता है, जो मानता है कि मशीन की अपनी इच्छाएं हैं।'
   )
 where slug = 'maskinen-der-dromte'
   and not (synopsis_i18n ? 'ja');

-- 3) Samlinger (collections.title_i18n + description_i18n — begge
--    kolonner i samme sætning; vogten på title_i18n 'ja' dækker
--    dermed også beskrivelsen, idet de altid skrives sammen her)

update public.collections
   set title_i18n = title_i18n || jsonb_build_object(
     'ja', '氷、海、自然',
     'zh', '冰、海洋和自然',
     'it', 'Ghiaccio, mare e natura',
     'pt', 'Gelo, mar e natureza',
     'hi', 'बर्फ, समुद्र और प्रकृति'
   ),
   description_i18n = description_i18n || jsonb_build_object(
     'ja', '変化する風景：消えゆく氷河、沈む塩湿地、季節と共に呼吸する森。',
     'zh', '变化的风景：消失的冰川、被淹没的盐沼和随着季节呼吸的森林。',
     'it', 'Paesaggi in cambiamento: ghiacciai che scompaiono, una palude salata che affoga e una foresta che respira con le stagioni.',
     'pt', 'Paisagens em transformação: geleiras desaparecendo, um pântano salgado se afogando e uma floresta respirando com as estações.',
     'hi', 'परिवर्तनशील परिदृश्य: गायब होते ग्लेशियर, डूबता हुआ नमक दलदल और एक जंगल जो ऋतुओं के साथ सांस लेता है।'
   )
 where slug = 'is-hav-og-natur'
   and not (title_i18n ? 'ja');

update public.collections
   set title_i18n = title_i18n || jsonb_build_object(
     'ja', '人々に焦点を当てて',
     'zh', '聚焦人物',
     'it', 'Persone al centro',
     'pt', 'Pessoas em foco',
     'hi', 'लोगों पर ध्यान'
   ),
   description_i18n = description_i18n || jsonb_build_object(
     'ja', '人生の作品を持つ人々の親しいポートレート：画家、技術者、そして彼女の最後のフィールドミッションにいる氷河学者。',
     'zh', '关于献身于毕生事业的人的亲密肖像：一位画家、一位技术员和一位在她最后一次实地任务中的冰川学家。',
     'it', 'Ritratti intimi di persone con una missione di vita: un pittore, un tecnico e una glaciologa alla sua ultima missione sul campo.',
     'pt', 'Retratos íntimos de pessoas com uma obra de vida: um pintor, um técnico e uma glacióloga em sua última missão de campo.',
     'hi', 'जीवन के कार्य के साथ लोगों के करीबी चित्र: एक चित्रकार, एक तकनीशियन और एक ग्लेशियोलॉजिस्ट उसके अंतिम फील्ड मिशन पर।'
   )
 where slug = 'mennesker-i-fokus'
   and not (title_i18n ? 'ja');

update public.collections
   set title_i18n = title_i18n || jsonb_build_object(
     'ja', '都市、機械、アーカイブ',
     'zh', '城市、机器和档案',
     'it', 'La città, la macchina e l''archivio',
     'pt', 'A cidade, a máquina e o arquivo',
     'hi', 'शहर, मशीन और अभिलेखागार'
   ),
   description_i18n = description_i18n || jsonb_build_object(
     'ja', 'コンクリートの下と屋根裏で：忘れられた都市、意図を持つ機械、そして海に奪われた声。',
     'zh', '在混凝土下和阁楼上：被遗忘的城市、有意图的机器和被海洋带走的声音。',
     'it', 'Sotto il cemento e in soffitta: città dimenticate, macchine con intenzioni e voci che il mare ha preso.',
     'pt', 'Sob o concreto e no sótão: cidades esquecidas, máquinas com intenções e vozes que o mar levou.',
     'hi', 'कंक्रीट के नीचे और अटारी में: शहर जो भुला दिए गए, इरादों वाली मशीनें और आवाजें जिन्हें समुद्र ने ले लिया।'
   )
 where slug = 'byen-maskinen-arkivet'
   and not (title_i18n ? 'ja');

-- 4) Egen verifikation (SQL Editor, efter kørslen):
--    a) Antal sprog pr. række — _i18n-objekterne havde 7 nøgler,
--       nu 12 (de 5 nye + 7 gamle; dansk er canonical, ikke i _i18n):
--       select handle,
--              (select count(*) from jsonb_object_keys(bio_i18n)) as antal
--         from public.creators
--        where handle in ('nordlys-film','havblik-medier','betonvaerket');
--       → 12, 12, 12. Tilsvarende for synopsis_i18n på de 6 film-slugs
--       og title_i18n/description_i18n på de 3 samlings-slugs.
--    b) Alle 5 nye koder findes overalt (skal give 3+6+3 = 12 rækker):
--       select 'bio' as felt, handle as id, true as ok
--         from public.creators
--        where handle in ('nordlys-film','havblik-medier','betonvaerket')
--          and bio_i18n ?& array['ja','zh','it','pt','hi']
--       union all
--       select 'synopsis', slug, true
--         from public.documentaries
--        where slug in ('isens-sidste-vinter','saltmaleren','byen-under-betonen',
--                       'havets-arkiv','skovens-lys','maskinen-der-dromte')
--          and synopsis_i18n ?& array['ja','zh','it','pt','hi']
--       union all
--       select 'samling', slug, true
--         from public.collections
--        where slug in ('is-hav-og-natur','mennesker-i-fokus','byen-maskinen-arkivet')
--          and title_i18n ?& array['ja','zh','it','pt','hi']
--          and description_i18n ?& array['ja','zh','it','pt','hi'];
--    c) Spot-tjek: japansk bio for nordlys (skal starte med アイスランド):
--       select bio_i18n->>'ja' from public.creators
--        where handle = 'nordlys-film';
--
-- Ingen grants/policies/constraints røres — UPDATE på eksisterende
-- kolonner kræver ingen nye rettigheder (dashboardet kører som
-- service role), og app'ens select using (true) er uændret.