# Pre-Islamic Arabia: real places and old stories as levels

Research notes for new *Sands of Arabia* maps. They cover real sites and legends from across the Arabian Peninsula before Islam (roughly the Bronze Age to the early 7th century CE). Each entry gives:

- what the place was, with sources;
- openly licensed reference images (Wikimedia Commons; each caption links the file page with author and licence);
- a level idea for this game;
- notes on building it with the headless-Blender kit in `tools/blender/`.

Written 2026-10-21 by a research-only session. Nothing outside `docs/research/` was changed.

**About the images.** Every image is a local copy (1280 px, from Wikimedia Commons) in [`images/`](images/), one folder per section, so a Blender session can open them as modelling reference. Every caption names the author and licence and links the Commons file page; [`images/CREDITS.md`](images/CREDITS.md) lists them all. Most are CC BY or CC BY-SA, so credit the author if any image is reused in the game or its marketing. Many of the best photos are by Richard Mortel (CC BY 2.0, sometimes credited as "Prof. Mortel"). His Commons and Flickr sets have hundreds more frames of the same sites, and Carole Raddato ("Following Hadrian", CC BY-SA 2.0) has more of Hegra and Wadi Rum.

**About the game hooks.** The level ideas assume what the game has or has planned: jump and double jump (required moves ≤ 1.35 m up and ≤ 2.7 m across), horses and the winged horse, the bow, bonfires, shops, kill/talk/fetch quests and the enemy list from the brainstorm notes (raiders, skirmishers, brutes, slingers, archers, hounds, vultures, club brutes, hyenas, ghul).

---

## Overview

| # | Site | Region today | Era | Level hook |
|---|---|---|---|---|
| 1 | [Jabal Ithlib, Hegra](#1-jabal-ithlib-hegra-the-sacred-mountain) | AlUla, NW Saudi Arabia | Nabataean, 1st c. BCE – 1st c. CE | A narrow siq into a sanctuary of betyl niches and a rock-cut banquet hall; extends the existing Hegra map |
| 2 | [Dadan and Jabal Ikmah](#2-dadan-and-jabal-ikmah-alula) | AlUla, NW Saudi Arabia | Dadanite and Lihyanite, c. 8th – 1st c. BCE | Lion tombs high in a red cliff above a palm valley; a cliff "library" of inscriptions |
| 3 | [Petra and the Nabataean north](#3-petra-and-the-nabataean-north-petra-wadi-rum-humayma) | Southern Jordan | Nabataean, 4th c. BCE – 106 CE | The Monastery climb, water channels, and Allat's temple in the sandstone desert of Wadi Rum |
| 4 | [Tayma](#4-tayma) | Tabuk, NW Saudi Arabia | Bronze Age – 6th c. CE; Nabonidus 552–543 BCE | A walled oasis around a giant well; the Babylonian king's palace; the loyal Samaw'al's castle |
| 5 | [Khaybar](#5-khaybar) | Medina province | Bronze Age walled oasis; later fortress villages | Black lava fields around a green oasis, a 14 km wall, fortresses on basalt spurs |
| 6 | [Dumat al-Jandal](#6-dumat-al-jandal-adummatu) | Al-Jawf, N Saudi Arabia | Assyrian era (8th–7th c. BCE) to late antiquity | City of the Arab queens; Marid castle that Zenobia could not take |
| 7 | [Rajajil standing stones](#7-the-rajajil-standing-stones) | Sakaka, Al-Jawf | Chalcolithic, c. 4000 BCE | A field of leaning stone pillars: a moonlit puzzle level |
| 8 | [Jubbah, Shuwaymis and the mountains Aja and Salma](#8-jubbah-shuwaymis-and-the-mountains-aja-and-salma-hail) | Ha'il | Neolithic rock art to Thamudic graffiti | Rock-art cliffs, a lost lake bed, and two mountain ranges named for legendary lovers |
| 9 | [Qaryat al-Faw](#9-qaryat-al-faw-capital-of-kindah) | Edge of the Empty Quarter | c. 3rd c. BCE – 3rd c. CE | Caravan city of Kindah under the Tuwaiq escarpment: painted houses, a walled market |
| 10 | [Al-Yamama: Tasm, Jadis and Zarqa](#10-al-yamama-tasm-jadis-and-zarqa-al-yamama) | Najd (al-Kharj area) | Legendary | The blue-eyed seer who saw an army disguised as walking trees |
| 11 | [Ukaz fair](#11-ukaz-the-fair-of-the-poets) | Near Ta'if | 6th c. CE | The poetry fair: duels of verse, horse races, the champion boss |
| 12 | [Ta'if, Nakhla and Qudayd: the three goddesses](#12-taif-nakhla-and-qudayd-the-shrines-of-al-lat-al-uzza-and-manat) | Hijaz | Late pre-Islamic | Three shrine levels: al-Lat's white rock, al-Uzza's three trees, Manat's black stone by the sea |
| 13 | [Mecca before Islam](#13-mecca-before-islam-handle-with-care) | Hijaz | Late pre-Islamic | Recommended as background, not a playable map (see notes) |
| 14 | [Najran and al-Ukhdud](#14-najran-and-al-ukhdud) | Najran, SW Saudi Arabia | c. 1st millennium BCE – 6th c. CE | A South Arabian walled town; the trench of the 523 massacre |
| 15 | [Hima wells and rock art](#15-hima-wells-and-rock-art) | Najran | 7,000 years of rock art; Abraha's inscription 552 CE | Caravan wells at the crossroads; thousands of carvings; an army's camp |
| 16 | [Marib: the Great Dam and the Sabaean temples](#16-marib-the-great-dam-and-the-sabaean-temples) | Marib, Yemen | c. 8th c. BCE – 6th c. CE | The great dam and its sluices, the Awwam oval and Barran's pillars; the flood of al-'Arim |
| 17 | [Sirwah](#17-sirwah) | Marib, Yemen | 8th – 7th c. BCE | Almaqah's temple and the victory stele of Karib'il Watar |
| 18 | [Baraqish and the Minaeans](#18-baraqish-yathill-and-the-minaeans) | Al-Jawf, Yemen | 1st millennium BCE | A towered city wall on a mound: a siege level |
| 19 | [Timna and Qataban](#19-timna-and-qataban) | Shabwa, Yemen | 1st millennium BCE – c. 1st c. CE | Market-law stele, a paved mountain pass, the caravan toll |
| 20 | [Shabwa and Hadramawt](#20-shabwa-and-the-hadramawt) | Hadramawt, Yemen | 1st millennium BCE – 4th c. CE | The incense capital: every load taxed at the gate; the burned palace |
| 21 | [Zafar and Himyar](#21-zafar-and-himyar) | Ibb, Yemen | c. 1st c. BCE – 6th c. CE | Highland capital of terraces and caves; the legend of Ghumdan |
| 22 | [Qana, Socotra and the incense ships](#22-qana-socotra-and-the-incense-ships) | Yemen coast and Socotra | 1st c. BCE – 6th c. CE | The Crow's Castle above the port; dragon's-blood trees and a cave of sailors' graffiti |
| 23 | [Dhofar: Wadi Dawkah, Sumhuram and Shisr ("Ubar")](#23-dhofar-wadi-dawkah-sumhuram-and-shisr-ubar) | Southern Oman | c. 3rd c. BCE – 5th c. CE | Frankincense groves, the walled port, the oasis fort that fell into a sinkhole |
| 24 | [The Empty Quarter](#24-the-empty-quarter-rub-al-khali) | Saudi Arabia, Oman, UAE, Yemen | All eras | Star dunes and salt flats: a traversal map between the incense cities |
| 25 | [Gerrha, Thaj and the Gulf coast](#25-gerrha-thaj-and-the-gulf-coast) | Eastern Province, Saudi Arabia | c. 4th c. BCE – 3rd c. CE | The salt-built trading city, the walled town of Thaj and its gold-masked girl |
| 26 | [Dilmun](#26-dilmun-bahrain) | Bahrain | c. 2200 – 1600 BCE and later | A sea of burial mounds, the Barbar spring temple, the plant of youth from the Gilgamesh epic |
| 27 | [Mleiha and Ed-Dur](#27-mleiha-and-ed-dur) | Sharjah and Umm al-Quwain, UAE | Bronze Age tombs; 3rd c. BCE – 3rd c. CE town | Horses buried with their riders; a mint; the sun-god temple by the lagoon |
| 28 | [Iram of the Pillars and the people of 'Ad](#28-iram-of-the-pillars-and-the-people-of-ad) | Legend (al-Ahqaf, the southern sands) | Legendary | The buried city of pillars: the endgame secret map |
| 29 | [Thamud, al-Hijr and the she-camel](#29-thamud-al-hijr-and-the-she-camel) | Legend and history, NW Arabia | Thamud attested 8th c. BCE – 2nd c. CE | A people of rock-cut houses; the Ruwafa temple; a sacred camel |
| 30 | [The jinn: Wadi 'Abqar and Wadi al-Jinn](#30-the-jinn-wadi-abqar-and-wadi-al-jinn) | Legend | Pre-Islamic poetry; modern folklore | A valley of poets' jinn where water runs uphill |

## Suggested build order

The order puts reuse of the existing kit first and new art last. Each step adds one or two new modular families that the later maps use as well.

1. **Jabal Ithlib (1).** Almost entirely existing pieces: `cliff`, `canyon`, `tomb_facade`, the Hegra palette, `pbox` ledges. New: betyl niches and a rock-cut hall interior. It could be a new zone of the Hegra map rather than a new map.
2. **Marib (16).** `ruined_temple` is already an Awwam-style oval enclosure. New: the dam (a long earth bank with ashlar sluice towers), Barran's monolithic pillars, the Sabaean ashlar palette. This is the most iconic South Arabian place, and it sets up every Yemeni map after it.
3. **Ukaz fair (11).** The market kit, tents and a race track on flat ground. The champion-of-Ukaz boss from the brainstorm is already designed for it. It is cheap to build and full of NPCs.
4. **Tayma (4) and Dumat al-Jandal (6) as a pair.** The oasis kit (palms, mudbrick houses) plus a new long stone town wall and a hill fort (Marid, al-Ablaq). Zenobia's proverb links them, so one quest chain spans both.
5. **Qaryat al-Faw (9).** A new escarpment cliff (the Tuwaiq) and a square walled market. It is the gateway to the Empty Quarter.
6. **Dhofar (23).** The first green palette (monsoon mist, frankincense trees), a sea edge and a walled port. Quest givers for the whole incense economy live here.
7. **Shabwa, Baraqish and Timna (18–20).** A mudbrick tower-wall family and a city gate. All three reuse it with different layouts.
8. **Najran and Hima (14–15).** Rock-art boulders as collectible lore. Hima's wells reuse `well`.
9. **Dilmun, Mleiha and Gerrha (25–27).** A mound-field terrain function and a coastal palette. The Gulf arc can be built last, since it is the furthest from the current maps.
10. **Iram (28) and Wadi 'Abqar (30).** The legend maps are endgame or secret content. They reuse pillars and dunes but need weather (sandstorm) and the jinn boss.

Petra (3), Khaybar (5), Rajajil (7), Ha'il (8), al-Yamama (10), the goddess shrines (12), Sirwah (17), Zafar (21) and Qana/Socotra (22) fit in wherever a side map is wanted. Most are small.

## A note on sensitivity

Many players will be Muslim, and the game ships in Arabic. Some of the old stories are also stories in the Qur'an. A few rules keep the game respectful:

- **Never show a prophet.** Hud (sent to 'Ad) and Salih (sent to Thamud) must not appear as NPCs, models or voices. Tell their stories through ruins, inscriptions and what other people say, and keep the Qur'anic wording out of game dialogue.
- **Don't make Mecca a combat or looting map.** Mecca is sacred to Muslims and the Kaaba is the qibla. Use the pre-Islamic pilgrimage *fairs* instead (Ukaz, Majanna, Dhu al-Majaz), which were real and are more fun to play. Section 13 has details.
- **Idols as history, not targets.** Shrines of al-Lat, al-Uzza and Manat are real history and make good levels. Present them as the culture of the time, with priests and pilgrims. Don't build quests that copy the specific Islamic-era destructions of those shrines.
- **Massacres and martyrs.** The trench at Najran (523 CE) is remembered by Christians and Muslims alike. Treat it as a memorial and a story of escape, never as a set piece to fight in.

---

# Part I: The north-west (Hijaz, AlUla, Tabuk, Jordan)

## 1. Jabal Ithlib, Hegra: the sacred mountain

**What it was.** Hegra (Mada'in Salih, al-Hijr) was the Nabataean kingdom's second city and its southern frontier post, from about the 1st century BCE to 106 CE, when Rome annexed the kingdom. It has 111 monumental tombs, 94 of them decorated, many dated by inscription between 1 BCE and 75 CE ([UNESCO 1293](https://whc.unesco.org/en/list/1293); [Wikipedia](https://en.wikipedia.org/wiki/Hegra_%28Mada%27in_Salih%29)). Jabal Ithlib is the sandstone massif in the north-east of the site. It was the religious quarter: a short natural siq, niches carved with betyls (aniconic god-stones, most often for Dushara), water channels and basins, and the *Diwan*, an open rock-cut banquet hall with benches on three sides. Laïla Nehmé reads it as a hall where religious brotherhoods (*marzeah*) met to feast ([CNRS News, "Hegra's splendour revealed"](https://news.cnrs.fr/articles/hegras-splendor-revealed); [Google Arts & Culture](https://artsandculture.google.com/story/RQUhxatmfRWQLQ)).

![Jabal Ithlib and the mouth of its siq](images/01_jabal_ithlib_hegra_the_sacred_mo/01_jabal_ithlib_and_the_mouth_of_its_siq.jpg)
*Jabal Ithlib and the mouth of its siq.* Credit: Richard Mortel, CC BY 2.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Jabal_Ithlib_and_the_Siq,_Hegra_%28Madain_Salih%29,_Saudi_Arabia.jpg).

![The Diwan: an open hall cut straight into the rock, benches on three sides](images/01_jabal_ithlib_hegra_the_sacred_mo/02_the_diwan_an_open_hall_cut_straight_into_the_roc.jpg)
*The Diwan: an open hall cut straight into the rock, benches on three sides.* Credit: Richard Mortel, CC BY 2.0, [Commons file page](https://commons.wikimedia.org/wiki/File:The_Diwan,_Jabal_Ithlib,_Hegra_%28Madain_Salih%29,_Saudi_Arabia.jpg).

![A ritual niche with a betyl. Simple to model: a recess, a plinth and a block](images/01_jabal_ithlib_hegra_the_sacred_mo/03_a_ritual_niche_with_a_betyl_simple_to_model_a_re.jpg)
*A ritual niche with a betyl. Simple to model: a recess, a plinth and a block.* Credit: Richard Mortel, CC BY 2.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Ritual_niche,_Jabal_Ithlib,_Hegra_%28Madain_Salih%29,_Saudi_Arabia.jpg).

![Nabataean graffiti on the siq walls. These are the collectible lore stones](images/01_jabal_ithlib_hegra_the_sacred_mo/04_nabataean_graffiti_on_the_siq_walls_these_are_th.jpg)
*Nabataean graffiti on the siq walls. These are the collectible "lore stones".* Credit: Richard Mortel, CC BY 2.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Ancient_inscriptions_at_Jabal_Ithlib,_Hegra_%28MAdain_Salih%29,_Saudi_Arabia.jpg).

![Qasr al-Farid](images/01_jabal_ithlib_hegra_the_sacred_mo/05_qasr_al_farid_the_four_storey_tomb_never_finishe.jpg)
*Qasr al-Farid: the four-storey tomb, never finished at the bottom. Its crow-steps are literal stairs.* Credit: Richard Mortel, CC BY 2.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Qasr_al-Farid,_Hegra_%28Madain_Salih%29,_1st_cent._CE,_Saudi_Arabia_%288%29.jpg).


**Level idea: "The Feast of the Twelve".**
- *Layout:* the existing Hegra map's north-east corner becomes a walled-off zone. Enter by the siq, a 3–6 m wide crack with chockstones. It opens into a bowl ringed by niches at three heights, with the Diwan on one side and a stepped path to the summit on the other.
- *Mood:* blue hour into night. Lamps in every niche, a feast fire in the Diwan, and music when the brotherhood is gathered.
- *NPCs:* the brotherhood's *rb mrzḥ* (feast master); eleven members; a lyre player; the priest of Dushara.
- *Quests:* bring wine from the wadi and oil for the betyls; find the missing twelfth member, a tomb robber who stole the feast cup. A talk quest asks you to read three siq inscriptions aloud to the feast master.
- *Enemies:* tomb robbers using the Hegra kit (oil-jar throwers from the brainstorm), and archers on the upper niche ledges at night.
- *Traversal:* niches stack as ledges 1.2–1.3 m apart. The summit "high place" (a flat altar with a basin and channel) is a jump-and-double-jump route. A fallen chockstone bridges the siq at 5 m.
- *Secrets:* a dry cistern behind a niche hides a chest. A betyl lit by the setting sun at 18:12 points to a buried hoard.

**Blender notes.**
- *Terrain:* reuse `Hegra.height()`. Add a raised massif with a cut, using `canyon(mb, ctx, pts, width=5, height=14)` for the siq.
- *Pieces:* `cliff` with `ROCK` bands for the massif. `tomb_facade(face=FACADE_HEGRA)` at small scale for niches, or a new `niche(mb, ctx, x, y, z, rot, w, h, depth, betyl=True)` that cuts an `L.SHADOW` recess and places a block on a plinth. The Diwan is a `pbox` floor plus three bench boxes (0.45 m high, walkable) and a back wall.
- *Colliders:* niche floors are `ledge` boxes whose `pos.y + half.y` is the niche sill. Bench tops are tagged `altar` or `ledge`. The siq walls are tall `cliff` boxes; keep the floor heightfield-only.
- *Palette:* the existing Hegra ochre (`#d99a63`), shadowed niches in `#1d0f08`, plus a soot-darkened band above the lamp niches.

## 2. Dadan and Jabal Ikmah, AlUla

**What it was.** Dadan (biblical Dedan) in the AlUla valley was capital of the Dadanite kingdom and then of the Lihyanite kingdom, roughly from the 8th to the 1st century BCE, before the Nabataeans moved the centre to Hegra. It sat on the incense road. Tombs are cut high in the red cliff face above the town. A few, the "lion tombs", have pairs of lions carved in relief above the opening. The town had a large temple of the Lihyanite god Dhu Ghabat (Dhu Ghaybah), with stone basins and over-life-size statues of kings ([Wikipedia: Lion tombs of Dedan](https://en.wikipedia.org/wiki/Lion_tombs_of_Dedan); [Lihyan](https://en.wikipedia.org/wiki/Lihyan); [World History Encyclopedia](https://www.worldhistory.org/article/2850/dadan-tayma-khaybar-qurh--old-town-alula/)). Jabal Ikmah, a canyon nearby, holds hundreds of Dadanitic inscriptions: an "open-air library" of dedications and ritual texts ([Wikipedia: AlUla](https://en.wikipedia.org/wiki/AlUla)).

![Dadan's necropolis: rows of square tomb openings cut high in the red cliff](images/02_dadan_and_jabal_ikmah_alula/01_dadan_s_necropolis_rows_of_square_tomb_openings.jpg)
*Dadan's necropolis: rows of square tomb openings cut high in the red cliff.* Credit: Richard Mortel, CC BY 2.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Ancient_site_of_Dadan_at_al-Ula,_1st_millenium_BCE,_Saudi_Arabia_9.jpg).

![The cliff at the lion-tomb site](images/02_dadan_and_jabal_ikmah_alula/02_the_cliff_at_the_lion_tomb_site.jpg)
*The cliff at the lion-tomb site.* Credit: juhotski, CC BY-SA 3.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Lion_Tomb_Site,_Al_Ula_-_panoramio.jpg).

![The excavated temple at Dadan (locally called Mahlab al-Naqa), with the palm valley and cliffs behind](images/02_dadan_and_jabal_ikmah_alula/03_the_excavated_temple_at_dadan_locally_called_mah.jpg)
*The excavated temple at Dadan (locally called Mahlab al-Naqa), with the palm valley and cliffs behind.* Credit: Z thomas, CC BY 4.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Tempel_von_Mahlab_al-Naqa_20260129_1.jpg).

![A colossal red-sandstone statue of a Lihyanite king (4th–3rd c. BCE), shown in Berlin. Square shoulders, a kilt, arms at the sides](images/02_dadan_and_jabal_ikmah_alula/04_a_colossal_red_sandstone_statue_of_a_lihyanite_k.jpg)
*A colossal red-sandstone statue of a Lihyanite king (4th–3rd c. BCE), shown in Berlin. Square shoulders, a kilt, arms at the sides: easy to build from boxes.* Credit: Wolfgang Sauber, CC BY-SA 3.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Pergamon-Museum_-_Dedan_Statue.jpg).

![Carved blocks from Dadan's buildings: zig-zag and band mouldings](images/02_dadan_and_jabal_ikmah_alula/05_carved_blocks_from_dadan_s_buildings_zig_zag_and.jpg)
*Carved blocks from Dadan's buildings: zig-zag and band mouldings.* Credit: Richard Mortel, CC BY 2.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Ancient_site_of_Dadan_at_al-Ula,_1st_millenium_BCE,_Saudi_Arabia_44.jpg).

![Jabal Ikmah: inscriptions in Dadanitic script covering the canyon wall](images/02_dadan_and_jabal_ikmah_alula/06_jabal_ikmah_inscriptions_in_dadanitic_script_cov.jpg)
*Jabal Ikmah: inscriptions in Dadanitic script covering the canyon wall.* Credit: Richard Mortel, CC BY 2.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Jabal_Ikmah,_ancient_Arabian_rock_art_and_inscription_site;_1st_millenium_BCE;_al-Ula,_Saudi_Arabia_%2817%29.jpg).

![Jabal Ikmah: rock art and lettering together](images/02_dadan_and_jabal_ikmah_alula/07_jabal_ikmah_rock_art_and_lettering_together.jpg)
*Jabal Ikmah: rock art and lettering together.* Credit: Richard Mortel, CC BY 2.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Jabal_Ikmah,_ancient_Arabian_rock_art_and_inscription_site;_1st_millenium_BCE;_al-Ula,_Saudi_Arabia_%288%29.jpg).

![AlUla's later old town](images/02_dadan_and_jabal_ikmah_alula/08_alula_s_later_old_town_mudbrick_and_stone_on_the.jpg)
*AlUla's later old town: mudbrick and stone on the same valley floor. Good palette reference for the valley.* Credit: Pteropus conspicillatus, CC BY-SA 3.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Al_Ula_old_town,_Saudi_Arabia_2011.jpg).


**Level idea: "The Lion Tombs".**
- *Layout:* a north–south palm valley about 200 m wide between two red cliffs. The town of Dadan, with its temple and a giant stone basin, sits on the valley floor. The west cliff is a vertical necropolis: rows of square tomb openings 3–25 m up, linked by narrow carved ledges and old wooden pegs. Jabal Ikmah is a side canyon at the north end.
- *Mood:* morning, with cool shade under the cliff and hot light on the east wall.
- *NPCs:* a Lihyanite king's steward; Minaean merchants (historically a Minaean trading colony lived at Dadan); temple servants of Dhu Ghabat; a scribe at Ikmah.
- *Quests:* "The king's face": a statue's head was taken; climb the necropolis to the robbers' hide in a lion tomb. "The library": copy five dedications at Ikmah for the scribe (talk/fetch).
- *Enemies:* hyenas living in low tombs; slingers on the cliff ledges; a brute who guards the lion tomb.
- *Traversal:* the cliff is the level. Ledge rows every 1.3 m, gaps of 2–2.7 m, wooden peg ladders (thin beams). The top lion tomb, at 25 m, needs double jumps from peg to peg.
- *Secrets:* an unopened tomb behind a fallen slab with a gold sheet mask. The winged horse can land on the cliff top.

**Blender notes.**
- *Terrain:* a valley function like `Wadi.height()` but with steep 25–40 m walls; build the walls with `cliff` boxes on both sides.
- *Pieces:*
  - *Tomb openings:* a box recess with an `L.SHADOW` back. Lion tombs get two low-poly lions (a box body, a box head and a mane slab) in relief above the door.
  - *Ledges:* `pbox(tag="ledge")` strips along the cliff, 1.0–1.5 m deep.
  - *The temple basin:* a big hollow stone cylinder (the "Mahlab al-Naqa") as a landmark.
  - *Statues:* the person rig posed at 2× scale in red stone, as a static prop.
- *Palette:* `ROCK_BANDS` shifted redder (`#8f4a30`, `#a85a38`), greener palm floor, and stone the colour of the cliff.
- *Colliders:* every ledge and tomb floor is a walkable box; tomb interiors are short boxes (3 m deep).

## 3. Petra and the Nabataean north (Petra, Wadi Rum, Humayma)

**What it was.** Petra was the Nabataean capital from at least the 4th century BCE to the Roman annexation in 106 CE. It sat where the incense road met the routes to Gaza and Damascus. It is known for its rock-cut façades (the Khazneh, the Monastery/ad-Deir), a theatre carved from the rock, high places of sacrifice and an engineered water system of channels, dams and cisterns ([UNESCO 326](https://whc.unesco.org/en/list/326); [Wikipedia: Petra](https://en.wikipedia.org/wiki/Petra); [Ad Deir](https://en.wikipedia.org/wiki/Ad_Deir)). Wadi Rum to the south has a Nabataean temple of Allat built over an older shrine, and thousands of Thamudic and Nabataean inscriptions ([Wikipedia: Wadi Rum](https://en.wikipedia.org/wiki/Wadi_Rum)). Humayma was a Nabataean caravan station fed by a 27 km aqueduct ([Wikipedia: Humayma](https://en.wikipedia.org/wiki/Humayma)).

![Ad-Deir, the Monastery, about 45 m tall. The urn on top is the climb goal](images/03_petra_and_the_nabataean_north_pe/01_ad_deir_the_monastery_about_45_m_tall_the_urn_on.jpg)
*Ad-Deir, the Monastery, about 45 m tall. The urn on top is the climb goal.* Credit: Vyacheslav Argenberg, CC BY 4.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Ad_Deir_%28The_Monastery%29,_El_Deir,_Petra,_Jordan.jpg).

![Petra's theatre, cut into the hillside: a natural stepped arena](images/03_petra_and_the_nabataean_north_pe/02_petra_s_theatre_cut_into_the_hillside_a_natural.jpg)
*Petra's theatre, cut into the hillside: a natural stepped arena.* Credit: Dosseman, CC BY-SA 4.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Petra_Theatre_2054.jpg).

![The Nabataean temple of Allat in Wadi Rum](images/03_petra_and_the_nabataean_north_pe/03_the_nabataean_temple_of_allat_in_wadi_rum.jpg)
*The Nabataean temple of Allat in Wadi Rum.* Credit: Carole Raddato from FRANKFURT, Germany, CC BY-SA 2.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Remains_of_a_Nabataean_temple,_Wadi_Rum,_Jordan_%2834192496585%29.jpg).

![Wadi Rum: Nabataean ruins under the sandstone jebels](images/03_petra_and_the_nabataean_north_pe/04_wadi_rum_nabataean_ruins_under_the_sandstone_jeb.jpg)
*Wadi Rum: Nabataean ruins under the sandstone jebels.* Credit: Berthold Werner, CC BY-SA 3.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Wadi_Rum_BW_7.JPG).


**Level idea: "The Rose City's back stair".** The game already has a Khazneh (`khazneh()` in `kit.py`) in the Hegra canyon, so a full Petra map would repeat it. Two options use it better:
- *Option A, Ad-Deir (a vertical side map):* the processional stair of about 800 steps from the valley up to the Monastery. Switchbacks, cliff-edge viewpoints and a betyl shrine halfway. At the top, the Monastery's 45 m façade is the climb: plinth, column capitals, the broken pediment, the tholos, the urn. Boss: the Eagle of Dushara, if Hegra's Qasr al-Farid hasn't used it.
- *Option B, Wadi Rum (an open riding map):* huge flat red sand between domed jebels. Gallop between Allat's temple, a Nabataean spring and inscription boulders. Camel raiders and horse lancers suit open ground. A rock bridge (like Burdah) is the secret.
- *Water puzzle (either option):* follow Nabataean channels cut along the cliff to open a dammed cistern, which floods a dry basin and lets you reach a chest by swimming or rafting.

**Blender notes.**
- *Terrain:* Option B is a flat sand floor with `cliff` domes (rounded with bevelled stacks of boxes) in `ROSE_BANDS`. Option A uses a steep canyon heightfield with a stair spline.
- *Pieces:* `khazneh(face=FACADE_ROSE)` already exists. Add `monastery()`: a wide façade with two storeys of engaged columns, a tholos and an urn, all box geometry. Each cornice is a walkable `ledge` box. Steps are stacks of `pbox` 0.3 m high.
- *Water channels:* a thin `pbox` trench along the cliff wall (decor), with a `WATER` surface inside when "on".

## 4. Tayma

**What it was.** Tayma is a large oasis in the north-west. People lived there from the Bronze Age, and walls kilometres long already ringed it in the 2nd millennium BCE. The Babylonian king Nabonidus lived at Tayma for about ten years (c. 552–543 BCE), leaving the throne to his son Belshazzar. Inscriptions in Aramaic, Taymanitic and later Nabataean have been found there. The "Tayma stone" (now in the Louvre) records the cult of the god Salm of Mahram ([Wikipedia: Tayma](https://en.wikipedia.org/wiki/Tayma); [Nabonidus](https://en.wikipedia.org/wiki/Nabonidus); [Tayma stone](https://en.wikipedia.org/wiki/Tayma_stone)).
- *The well:* Bir Haddaj is a huge stone-lined well with draw-wheel frames on all sides. Its present form is later, but it may be built on an ancient one.
- *The castle:* Qasr al-Ablaq ("the piebald castle") is the fortress of the Jewish poet al-Samaw'al ibn 'Adiya (6th century). Legend says he refused to hand over the armour that Imru' al-Qais had left with him, even when the besieger killed his son. "More loyal than al-Samaw'al" became a proverb ([Wikipedia: Samaw'al](https://en.wikipedia.org/wiki/Samaw%27al_ibn_%27Adiya)). Al-Isfahani already doubted the details, so treat it as legend.

![Bir Haddaj, the great well of Tayma, with its ring of pulley frames](images/04_tayma/01_bir_haddaj_the_great_well_of_tayma_with_its_ring.png)
*Bir Haddaj, the great well of Tayma, with its ring of pulley frames.* Credit: X1700, CC BY-SA 4.0, [Commons file page](https://commons.wikimedia.org/wiki/File:%D8%A8%D8%A6%D8%B1_%D9%87%D8%AF%D8%A7%D8%AC.png).

![The Tayma stone (Aramaic, 6th–5th c. BCE), Louvre](images/04_tayma/02_the_tayma_stone_aramaic_6th_5th_c_bce_louvre.jpg)
*The Tayma stone (Aramaic, 6th–5th c. BCE), Louvre.* Credit: unknown, Public domain, [Commons file page](https://commons.wikimedia.org/wiki/File:Teima_stone_Louvre_AO1505.jpg).

![Stele of the god Salm, Tayma, Louvre](images/04_tayma/03_stele_of_the_god_salm_tayma_louvre.jpg)
*Stele of the god Salm, Tayma, Louvre.* Credit: unknown, Public domain, [Commons file page](https://commons.wikimedia.org/wiki/File:Stele_Salm_Louvre_AO5009.jpg).

![Old Tayma: mudbrick lanes between walled palm gardens](images/04_tayma/04_old_tayma_mudbrick_lanes_between_walled_palm_gar.jpg)
*Old Tayma: mudbrick lanes between walled palm gardens.* Credit: Richard Mortel, CC BY 2.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Old_town_of_Tayma_2020.jpg).

![A rock drawing of a horseman in Neo-Assyrian style, one of the few traces of Nabonidus's stay at Tayma](images/04_tayma/05_a_rock_drawing_of_a_horseman_in_neo_assyrian_sty.jpg)
*A rock drawing of a horseman in Neo-Assyrian style, one of the few traces of Nabonidus's stay at Tayma.* Credit: Nabataeus, CC BY 4.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Tayma_horseman.jpg).


**Level idea: "The Loyal Host".**
- *Layout:* a round oasis about 300 m across inside a long ruined outer wall of stone and mud, with gaps and towers. Bir Haddaj sits in the centre with camels hauling water up ramps. A ruined palace on a low mound (Qasr al-Radm, possibly from Nabonidus's time) is the old royal quarter. Al-Ablaq is a two-tone stone keep on a rise at the edge.
- *Mood:* a hot noon, with the well area busy. Night siege for the main quest.
- *NPCs:* water-wheel camel drivers; an Aramaic scribe; a Babylonian astrologer's ghost-story teller; al-Samaw'al and his son.
- *Quests:*
  - *Fetch:* drive the well camels (a herding mini-quest).
  - *Main:* al-Samaw'al keeps the armour of a fugitive prince. Raiders besiege the keep at night and take the son hostage. You can't save the armour *and* give it up: the chain's choice and its ending follow the legend.
  - *Link:* the Zenobia proverb ties this to Dumat al-Jandal (section 6). "Marid rebelled and al-Ablaq held out."
- *Enemies:* a siege camp of raiders, slingers and brutes with ladders; hounds at night.
- *Traversal:* the outer wall-walk (2–4 m) with crumbled gaps; the keep's three storeys of ledges.
- *Secrets:* inscribed stones (Taymanitic) in the wall; a hidden channel from the well to the palace cellar.

**Blender notes.**
- *Terrain:* mostly flat oasis using the oasis palette, with a gentle mound for al-Radm.
- *Pieces:*
  - *Outer wall:* `ruin_wall` along a long loop with towers every 40 m. A wall-walk top `pbox(tag="wall")`.
  - *The well:* a big stone cylinder 18 m across, with a ring of wooden A-frame pulley posts and ramps for camels. The ramps can also be the player's way down to a ledge inside the well.
  - *Al-Ablaq:* a keep built from alternating white and red stone bands. Add materials `StoneWhite #e5d7bd` and `StoneRed #a85a3e`.
- *Reuse:* `palm`, `house`, `tower_house` from `arabia_lib.py`.

## 5. Khaybar

**What it was.** Khaybar is an oasis about 150 km north of Medina, set in the black basalt lava fields of Harrat Khaybar. Satellite survey and excavation have found a walled oasis: a wall about 14.5 km long and the fortified town of al-Natah, built about 2400–2000 BCE and later abandoned. In the 6th–7th centuries CE Khaybar was a rich date oasis of Jewish tribes, with fortresses (*hisn*) on basalt spurs ([Wikipedia: Khaybar](https://en.wikipedia.org/wiki/Khaybar); [PLOS ONE, Charloux et al. 2024](https://doi.org/10.1371/journal.pone.0309963); [ScienceAlert summary](https://www.sciencealert.com/ancient-town-from-4000-years-ago-found-hidden-in-saudi-arabian-oasis)).

![Khaybar: a fortress on a basalt outcrop above the palm valley](images/05_khaybar/01_khaybar_a_fortress_on_a_basalt_outcrop_above_the.jpg)
*Khaybar: a fortress on a basalt outcrop above the palm valley.* Credit: Hardscarf, CC BY-SA 4.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Khaybar_-_view_over_the_fortress.jpg).

![Harrat Khaybar from the International Space Station](images/05_khaybar/02_harrat_khaybar_from_the_international_space_stat.jpg)
*Harrat Khaybar from the International Space Station: black lava flows and volcanic cones (NASA, public domain).* Credit: Expedition 16 Crew Member on the International Space Station, NASA, Public domain, [Commons file page](https://commons.wikimedia.org/wiki/File:Harrat_Khaybar_Space.jpg).


**Level idea: "The Black Stone Country".** A strong contrast map, black lava and green palms.
- *Layout:* a green palm valley snaking through black lava. Fortified hamlets on basalt spurs. The Bronze Age wall is a ruined black-stone line across the plain, and al-Natah is a ruined walled town on the edge.
- *Mood:* evening, with the black rock radiating heat (a heat shimmer) and long shadows.
- *Enemies:* wolves and hyenas on the lava; a raider band camped in al-Natah's ruins.
- *Traversal:* lava fields are rough ground. Horses are slowed on lava but full speed in the palm valley, which makes route choice matter. Lava tubes (short caves) are shortcuts.
- *Secrets:* old *mustatil* stone rectangles and "keyhole" monuments on the plateau, visible only from high up (the winged horse view).

**Blender notes.**
- *Palette:* add a basalt band set (`#2b2826`, `#3a3532`, `#4a433d`) next to `GREY_BANDS`, with dark grey sand.
- *Pieces:* scatter rocks with `rock_cluster(palette=BASALT)`. Forts are `tower_house` built in black stone. The Bronze Age wall is `ruin_wall(m=BASALT)` at 1.5 m high.
- *Terrain:* a valley cut into a plateau; the lava is noisy, lumpy and slightly raised.

## 6. Dumat al-Jandal (Adummatu)

**What it was.** Dumat al-Jandal ("Duma of the stones"), in the Jawf depression of northern Arabia, is the Adummatu of Assyrian texts (8th–7th c. BCE). It was the seat of the Qedarite Arabs and their queens: Zabibe, Samsi, Te'elhunu, and Tabua, whom Esarhaddon installed. Sennacherib sacked it and carried off its gods; Esarhaddon gave the statues back ([Wikipedia: Dumat al-Jandal](https://en.wikipedia.org/wiki/Dumat_al-Jandal); [Zabibe](https://en.wikipedia.org/wiki/Zabibe); [Te'elhunu](https://en.wikipedia.org/wiki/Te%CA%BEel%E1%B8%ABunu); [PSAS: "Dūmat al-Jandal, a North Arabian oasis from the Assyrian period to the advent of Islam"](https://archaeopresspublishing.com/ojs/index.php/PSAS/article/view/2248)). Later it was a Nabataean and Roman outpost. Marid castle on its hill dates in part to around the 1st century CE. Tradition says Zenobia of Palmyra failed to take both Marid and Tayma's al-Ablaq, and said *"tamarrada Mārid wa-ʿazza al-Ablaq"*: "Marid rebelled and al-Ablaq held firm" ([Saudipedia, Marid castle (Arabic)](https://saudipedia.com/%D9%82%D9%84%D8%B9%D8%A9-%D9%85%D8%A7%D8%B1%D8%AF)).

![Marid castle: battlemented walls and a round tower on the rock](images/06_dumat_al_jandal_adummatu/01_marid_castle_battlemented_walls_and_a_round_towe.jpg)
*Marid castle: battlemented walls and a round tower on the rock.* Credit: Richard Mortel, CC BY 2.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Marid_Castle,_Dumat_al-Jandal,_Saudi_Arabia,_ca._1st_cent._CE_%282%29.jpg).

![Marid castle: the inner walls and a gateway](images/06_dumat_al_jandal_adummatu/02_marid_castle_the_inner_walls_and_a_gateway.jpg)
*Marid castle: the inner walls and a gateway.* Credit: Richard Mortel, CC BY 2.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Marid_Castle,_Dumat_al-Jandal,_Saudi_Arabia,_ca._1st_cent._CE_%286%29.jpg).


**Level idea: "City of Queens".**
- *Layout:* a deep oasis basin with palms and the old stone town of narrow lanes. Marid castle sits on the hill above it, and a sacred spring and a salt lake lie beyond.
- *Mood:* late afternoon, with a gold haze off the salt lake.
- *NPCs:* the queen of Adummatu (a quest giver who holds the gods' statues), a priestess of Ruda (the Qedarite god), and Assyrian envoys.
- *Main quest:* "The returned gods". The Assyrians took the gods' statues. A treaty returns them, but bandits ambush the convoy in the dunes. Escort the cart (a camel caravan escort) to the temple.
- *Siege quest:* Marid's hill. Hold the castle against a (Palmyrene-styled) assault in waves. Paired with Tayma's al-Ablaq siege, it completes the proverb, and the reward is a shield.
- *Traversal:* castle towers, walls and a hill path; the old town's flat roofs.
- *Enemies:* Palmyrene archers (a new look: scale armour, conical caps), camel raiders.

**Blender notes.**
- *Pieces:* dry-stone masonry is perfect for low-poly: horizontal bands of 0.4 m boxes with jittered colours. A `round_tower(r, h)` (an octagon prism with a crenellated top) is needed here and in Mleiha and Baraqish.
- *Palette:* sandy grey-brown limestone `#a8916f`, `#bfa680`; palm greens; a white salt lake.
- *Colliders:* tower tops are `tower` tags; wall-walks are `wall`.

## 7. The Rajajil standing stones

**What it was.** Al-Rajajil ("the men") near Sakaka in al-Jawf is a field of some 50 groups of rough sandstone pillars, many up to 3 m tall and leaning, set up around the 4th millennium BCE (Chalcolithic). Their purpose is unknown; ideas include ritual and astronomical alignment. Some carry later Thamudic graffiti ([Wikipedia: Columns of Rajajil](https://en.wikipedia.org/wiki/Columns_of_Rajajil); [Amusing Planet: "The al-Rajajil standing stones"](https://www.amusingplanet.com/2017/04/the-al-rajajil-standing-stones.html)).

![One of the Rajajil pillars on the sand plain](images/07_the_rajajil_standing_stones/01_one_of_the_rajajil_pillars_on_the_sand_plain.jpg)
*One of the Rajajil pillars on the sand plain.* Credit: Richard Mortel, CC BY 2.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Rajajil_standing_columns,_al-Jouf,_6th_-_5th_millenia_BCE_%286%29.jpg).

![A 1976 survey photo of a pillar group (public domain)](images/07_the_rajajil_standing_stones/02_a_1976_survey_photo_of_a_pillar_group_public_dom.png)
*A 1976 survey photo of a pillar group (public domain).* Credit: Masry, Abdullah H., Steven C. Caton, Ahmad H. Sharafaddin, and Mahm..., Public domain, [Commons file page](https://commons.wikimedia.org/wiki/File:Columns_of_Rajajil,_Saudi_Arabia,_1976_01.png).


**Level idea: "The Men Who Stand".** A small night puzzle map, about 120 m across.
- At night the stone groups cast moon shadows. Turn the player's torch on and off; when the moon reaches a set position, the shadows of three groups meet over a dig spot.
- A Bedouin elder tells the local story: they are men turned to stone for breaking guest-right. (This is invented, and marked as such in the dialogue: "so the old women say".)
- Ghuls appear as "a man who wasn't there before", one more pillar than you counted.
- *Traversal:* jump between leaning pillar tops (1.3 m steps) to reach a nest on the tallest.

**Blender notes.** Each stone is a tall box with random tilt (≤ 12°) and a jittered top. Each group is 4–8 stones in a rough row. Leaning stones need a yaw-rotated box collider at the stone's footprint, plus a `pillar` walkable top box at the summit height. Use the `GREY_BANDS` palette and night fog.

## 8. Jubbah, Shuwaymis and the mountains Aja and Salma (Ha'il)

**What it was.** UNESCO's [Rock Art in the Hail Region (1472)](https://whc.unesco.org/en/list/1472) covers Jabal Umm Sinman at Jubbah and Jabal al-Manjor and Raat at Shuwaymis. They hold some 10,000 years of carvings: life-size human figures, cattle, camels, ibex, horses and hunting dogs, plus later Thamudic and Arabic inscriptions. Jubbah overlooked a lake that dried up in the Holocene ([Wikipedia: Rock Art in the Hail Region](https://en.wikipedia.org/wiki/Rock_Art_in_the_Hail_Region); [Jubbah](https://en.wikipedia.org/wiki/Jubbah,_Saudi_Arabia)). Ha'il's two mountain ranges, Aja and Salma, carry a pre-Islamic legend: two lovers of different tribes, killed by her family, whose names passed to the two mountains ([Saudipedia: Aja and Salma Mountains](https://saudipedia.com/en/aja-and-salma-mountains); [Wikipedia: Shammar Mountains](https://en.wikipedia.org/wiki/Shammar_Mountains); [Tayy](https://en.wikipedia.org/wiki/Tayy)). Ha'il is also the land of Tayy, the tribe of Hatim al-Ta'i, the byword for Arab generosity ([Wikipedia: Hatim al-Tai](https://en.wikipedia.org/wiki/Hatim_al-Tai)).

![An ibex pecked into dark, sun-varnished sandstone at Jubbah](images/08_jubbah_shuwaymis_and_the_mountai/01_an_ibex_pecked_into_dark_sun_varnished_sandstone.jpg)
*An ibex pecked into dark, sun-varnished sandstone at Jubbah.* Credit: Richard Mortel, CC BY 2.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Ibex,_Jubbah_rock_art_site,_Saudi_Arabia.jpg).

![Camels and riders at Jubbah](images/08_jubbah_shuwaymis_and_the_mountai/02_camels_and_riders_at_jubbah.jpg)
*Camels and riders at Jubbah.* Credit: Richard Mortel, CC BY 2.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Warriors,_Jubbah_rock_art_site,_Saudi_Arabia_%283%29.jpg).

![Ostriches at Jubbah: once common in the Najd](images/08_jubbah_shuwaymis_and_the_mountai/03_ostriches_at_jubbah_once_common_in_the_najd.jpg)
*Ostriches at Jubbah: once common in the Najd.* Credit: Richard Mortel, CC BY 2.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Ostriches,_Jubbah_rock_art_site,_Saudi_Arabia.jpg).


**Level idea: "The Lake That Was".**
- *Layout:* a dry lake bed of white crust and sand dunes, with a ring of dark sandstone outcrops covered in carvings. Aja's granite peaks are on the horizon.
- *Quests:* "The hunter's panel": find the 12 carved animals to recreate a hunt (fills a lore page and unlocks the saluki companion). "Hatim's fire": Hatim's camp lights a fire on a hill so guests can find him; bring a lost traveller to it. Generosity choices give gold back later.
- *Legend:* at dusk the two mountain silhouettes face each other. A poet NPC tells the story of Aja and Salma.
- *Enemies:* ostrich (comic fauna), wolves, a hyena den in a rock shelter.
- *Traversal:* sandstone pillars and mushroom rocks to climb; hidden carvings sit high up.

**Blender notes.** Rock-art panels are flat dark "patina" faces (a box face in `#4a3a2c`) with lighter pecked figures. Make each figure a tiny emissive-free decal of 3–6 boxes (ibex: body, neck, two curved horns as angled boxes). Collectibles are `pickup` spawns. Dunes reuse oasis noise.

---

# Part II: Najd, the Hijaz shrines and the fairs

## 9. Qaryat al-Faw, capital of Kindah

**What it was.** Qaryat al-Faw lies where the Tuwaiq escarpment meets the north-west edge of the Empty Quarter, about 700 km south-west of Riyadh. It was a caravan city on the road from South Arabia to the Gulf and Mesopotamia, at its height from about the 3rd century BCE to the 3rd century CE. It was the first capital of the kingdom of Kindah, the tribe later famous for the poet-prince Imru' al-Qais.
- *Excavations:* A. R. al-Ansary of King Saud University excavated from 1972. He found a walled market (*suq*) with towers, houses of mudbrick on stone footings, temples, tombs, a well field, and wall paintings with Greek, Egyptian and South Arabian traits.
- *Gods:* Kahl (also Kahil) was the chief god. Recent work identifies a temple to Shams in the so-called palace area.
- *UNESCO:* it was inscribed in 2024 as the [Cultural Landscape of Al-Faw Archaeological Area (1712)](https://whc.unesco.org/en/list/1712).

Sources: [Wikipedia: Qaryat al-Faw](https://en.wikipedia.org/wiki/Qaryat_al-Faw); [Kindah](https://en.wikipedia.org/wiki/Kindah); [de Lara, "The mrzḥ of Qaryat al-Fāw", PSAS](https://www.archaeopresspublishing.com/ojs/index.php/PSAS/article/view/2262).

![Al-Faw from the air: the market square and the town plan in the sand](images/09_qaryat_al_faw_capital_of_kindah/01_al_faw_from_the_air_the_market_square_and_the_to.jpg)
*Al-Faw from the air: the market square and the town plan in the sand.* Credit: Heritage Commission, CC BY-SA 4.0, [Commons file page](https://commons.wikimedia.org/wiki/File:%D8%B5%D9%88%D8%B1%D8%A9_%D8%AC%D9%88%D9%8A%D8%A9_%D9%84%D9%85%D9%88%D9%82%D8%B9_%D8%A7%D9%84%D9%81%D8%A7%D9%88_%D8%A7%D9%84%D8%A3%D8%AB%D8%B1%D9%8A.jpg).

![Wall painting fragment from al-Faw. Red, ochre and black on plaster](images/09_qaryat_al_faw_capital_of_kindah/02_wall_painting_fragment_from_al_faw_red_ochre_and.jpg)
*Wall painting fragment from al-Faw. Red, ochre and black on plaster: a palette for painted interiors.* Credit: Nesnad, CC BY 4.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Fragment_mural_painting_zodiacal_motif_-_2018-04-30.jpg).

![An al-Faw wall painting of a curly-haired man among vines and garlands (shown in Berlin, Roads of Arabia exhibition)](images/09_qaryat_al_faw_capital_of_kindah/03_an_al_faw_wall_painting_of_a_curly_haired_man_am.jpg)
*An al-Faw wall painting of a curly-haired man among vines and garlands (shown in Berlin, "Roads of Arabia" exhibition).* Credit: Wolfgang Sauber, CC BY-SA 3.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Pergamon-Museum_-_Wandmalerei_2.jpg).

![Bronze lion-head door knockers from al-Faw](images/09_qaryat_al_faw_capital_of_kindah/04_bronze_lion_head_door_knockers_from_al_faw.jpg)
*Bronze lion-head door knockers from al-Faw.* Credit: Nesnad, CC BY 4.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Lion_door_knockers_-_Qaryat_al-Faw_-_3rd_Century_BCE_-_20180430.jpg).

![A carved lintel with a frieze of figures and animals: a good repeating box-decal band](images/09_qaryat_al_faw_capital_of_kindah/05_a_carved_lintel_with_a_frieze_of_figures_and_ani.jpg)
*A carved lintel with a frieze of figures and animals: a good repeating box-decal band.* Credit: Nesnad, CC BY 4.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Lintel_-_Qaryat_al-Faw_-_3rd_Century_BCE_-_20180430.jpg).


**Level idea: "The Gate of the Empty Quarter".**
- *Layout:* the Tuwaiq escarpment is a 40 m cliff wall along the west side. Below it is the town: the square walled market (about 30 m a side, towers at the corners, shops inside along the walls), houses, temples of Kahl and Shams, and a field of wells and irrigated plots. East, the dunes of the Empty Quarter roll in. Tombs are cut into the escarpment.
- *Mood:* early morning, with mist off the irrigated fields. The town is busy; caravans arrive from the south.
- *NPCs:* Kindite nobles; Sabaean and Gerrhan caravan masters; a fresco painter; the priest of Kahl. A young Kindite prince who prefers poetry to war is a nod to Imru' al-Qais.
- *Quests:*
  - "Paint for the god": fetch red ochre from the escarpment and blue pigment from a Gerrhan trader.
  - "The prince's ode": collect lines of a poem scattered across the map; pays off at Ukaz (section 11).
  - "Water rights": guard the well field from a rival clan.
- *Enemies:* raiders from the sands; scorpions and vipers; a sand-storm ghul.
- *Traversal:* the escarpment has a ledge route to the cliff tombs and a lookout. The market is a rooftop circuit.
- *Secrets:* the painted room of the feasting brotherhood (a hidden interior with murals); a buried bronze statue.

**Blender notes.**
- *Terrain:* a new escarpment heightfield, flat to the west at 40 m, a near-vertical cliff (use a `cliff` box chain over the heightfield step), flat town, and dunes in the east (reuse oasis dune noise).
- *Pieces:*
  - *The suq:* a square of `pbox` shops around a courtyard, outer walls 4 m high, four square corner towers. Reuse the `caravanserai()` layout code, made smaller and with shop rooms opening inward.
  - *Houses:* `house()` from `arabia_lib.py` on a stone footing band (`STONE_DARK`, 0.8 m).
  - *Painted interiors:* walls in a plaster colour `#e8d9bf` with a red band `#9a3b2a`.
- *Colliders:* suq roof `roof`, towers `tower`, escarpment ledges `ledge`.

## 10. Al-Yamama: Tasm, Jadis and Zarqa al-Yamama

**What it was (legend).** Arab tradition tells of two lost tribes, Tasm and Jadis, in al-Yamama (central Najd, around today's al-Kharj). Their seer Zarqa al-Yamama ("the blue-eyed one of al-Yamama") could see riders three days away. The Himyarite king Hassan marched on them. His men cut branches and carried them, so the army looked like a moving forest. Zarqa warned "the trees are walking", nobody believed her, and the tribe fell. "Sharper-sighted than Zarqa al-Yamama" became a proverb, and a 2024 Riyadh opera retells it ([Wikipedia: Zarqa al-Yamama](https://en.wikipedia.org/wiki/Zarqa_al_Yamama); [Wikipedia: Al-Yamama](https://en.wikipedia.org/wiki/Al-Yamama); [Oman Observer](https://www.omanobserver.om/article/11056/Opinion/the-story-of-blue-eyed-woman-of-yamama)).

![The Tuwaiq escarpment, the spine of al-Yamama and the Najd](images/10_al_yamama_tasm_jadis_and_zarqa_a/01_the_tuwaiq_escarpment_the_spine_of_al_yamama_and.jpg)
*The Tuwaiq escarpment, the spine of al-Yamama and the Najd.* Credit: Peter Dowley from Dubai, United Arab Emirates, CC BY 2.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Tuwaiq_Escarpment_%282981960802%29.jpg).

![The Edge of the World on the Tuwaiq escarpment near Riyadh](images/10_al_yamama_tasm_jadis_and_zarqa_a/02_the_edge_of_the_world_on_the_tuwaiq_escarpment_n.jpg)
*"The Edge of the World" on the Tuwaiq escarpment near Riyadh: the cliff-edge horizon of the Najd.* Credit: S0lL0 TRAVELER, CC BY-SA 4.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Edge_of_the_World.jpg).


**Level idea: "The Walking Trees".** A stealth-and-defence map; best as a single chapter.
- *Layout:* a walled oasis town with a watchtower in the middle of the Najd plain, acacia groves to the south and a wadi.
- *Mechanic:* climb the watchtower to use Zarqa's sight, a zoomed long-distance view that shows enemy markers. Then the enemy uses the same trick against you: an army of "acacias" moves when you're not looking. Spot them before they reach the walls. This reuses the bush-raider idea from the brainstorm (shrub-hat accessory, `Rise` clip).
- *Ending:* the legend ends badly. Let the player save the town's people (an escape quest) without rewriting the story's fall.

**Blender notes.** The acacia army needs `acacia()` reusable as an accessory, or a small acacia mesh on the person rig's back. The watchtower is `watchtower(h=12)` in mudbrick.

## 11. Ukaz: the fair of the poets

**What it was.** Suq 'Ukaz was the largest of the pre-Islamic seasonal fairs. It was held each year for about three weeks in the month of Dhu al-Qa'da, on a plain near Ta'if, during the holy months when fighting was banned. Tribes came to trade, settle disputes, ransom prisoners, race horses and, above all, recite poetry.
- *The poets:* tradition says the best odes were honoured there, and the later story says the *Mu'allaqat* ("hanging odes") were hung on the Kaaba. Many scholars doubt that last part.
- *Al-Nabigha's tent:* al-Nabigha al-Dhubyani is said to have judged poets in a red leather tent.
- *Other fairs:* Majanna and Dhu al-Majaz followed Ukaz in the same season.
- *Today:* a revived Souk Okaz festival is held near Ta'if.

Sources: [Wikipedia: Souk Okaz](https://en.wikipedia.org/wiki/Souk_Okaz); [Mu'allaqat](https://en.wikipedia.org/wiki/Mu%27allaqat); [Antarah ibn Shaddad](https://en.wikipedia.org/wiki/Antarah_ibn_Shaddad); [Al-Nabigha](https://en.wikipedia.org/wiki/Al-Nabigha).

![A sketch map of the site of Ukaz (labels in Arabic)](images/11_ukaz_the_fair_of_the_poets/01_a_sketch_map_of_the_site_of_ukaz_labels_in_arabi.jpg)
*A sketch map of the site of Ukaz (labels in Arabic).* Credit: Pass276, CC BY-SA 3.0, [Commons file page](https://commons.wikimedia.org/wiki/File:%D8%B3%D9%88%D9%82_%D8%B9%D9%83%D8%A7%D8%B8.JPG).

![Camels crossing red sand: the kind of caravan that came to Ukaz](images/11_ukaz_the_fair_of_the_poets/02_camels_crossing_red_sand_the_kind_of_caravan_tha.jpg)
*Camels crossing red sand: the kind of caravan that came to Ukaz.* Credit: Mohammad Nowfal, FAL, [Commons file page](https://commons.wikimedia.org/wiki/File:Ad_Dahna_desert_-_A_journey.jpg).


**Level idea: "The Fair of Ukaz".** A peaceful hub map that turns into a boss arena.
- *Layout:* an open gravel plain ringed by low granite hills. A city of tents grouped by tribe, each with its own banner colour. A trade street of stalls; a horse-race track marked by cairns around a 600 m oval. A small hill with al-Nabigha's red tent on top. A ransom ground where prisoners are exchanged.
- *Mood:* the holy month means truce. Weapons are peace-bound: the player can't attack anyone in the fair grounds (a gameplay rule that is also a historical fact). Golden afternoons, festive music, crowd ambience at maximum.
- *Activities:*
  - *Poetry duels:* a dialogue mini-game. Pick verse lines (boast, *fakhr*; satire, *hija'*; lament, *ritha'*) to answer an opponent's theme. Lines collected from other maps (Qaryat al-Faw, Ha'il) unlock stronger answers.
  - *Horse race:* gallop around the cairn oval against three riders, with jumps over gullies.
  - *Ransom:* buy back a prisoner from the raider fort's band with gold.
  - *Trade:* the best shop in the game, with goods from every map.
- *Boss:* the champion of Ukaz (designed in the brainstorm, inspired by Antara). The duel takes place *outside* the truce ground at the edge of the plain.
- *Secrets:* a lost ode, written on a palm-leaf rib hidden on a hill top, unlocks the final poetry duel against al-Nabigha himself.

**Blender notes.**
- *Terrain:* flat, with granite hills of rounded boulder piles in `GREY_BANDS` with a pink tint (`#b49a8c`).
- *Pieces:* `big_tent()` and `tent()` with per-tribe colour swaps; `stall()` with all awning types; `banner()` on poles; `cairn()` for the race marks. Al-Nabigha's tent is `big_tent(m=red leather #8b2a1e)`.
- *Code note:* a `truce` flag in level.json could disable the player's attack (this needs game code, not just art).

## 12. Ta'if, Nakhla and Qudayd: the shrines of al-Lat, al-Uzza and Manat

**What they were.** The three goddesses of the late pre-Islamic Hijaz each had a main shrine, according to Ibn al-Kalbi's *Book of Idols* (8th–9th c.) and other early sources:
- **Al-Lat at Ta'if:** a square white rock, with a house built over it, curtains, custodians and a sacred enclosure. The Thaqif tribe kept it. Ta'if itself is a cool mountain town of orchards and vineyards at about 1,800 m.
- **Al-Uzza at Nakhla:** a sanctuary in the valley of Nakhla between Mecca and Ta'if, centred on three sacred acacia (*samura*) trees. Quraysh especially revered her.
- **Manat at Qudayd / al-Mushallal:** a black stone near the Red Sea coast between Mecca and Medina. The Aws and Khazraj of Yathrib and the Hudhayl revered her, and pilgrims shaved their heads there. Sources disagree on the exact place.

Elsewhere, Allat, al-Uzza and Manawat are also known from Nabataean, Palmyrene and Hatra inscriptions and reliefs: an Allat with a lion, al-Uzza linked to the morning star.

Sources: [Wikipedia: Al-Lat](https://en.wikipedia.org/wiki/Al-L%C4%81t); [Al-Uzza](https://en.wikipedia.org/wiki/Al-Uzza); [Manat](https://en.wikipedia.org/wiki/Manat_%28goddess%29); [Book of Idols](https://en.wikipedia.org/wiki/Book_of_Idols); [Religion in pre-Islamic Arabia](https://en.wikipedia.org/wiki/Religion_in_pre-Islamic_Arabia).

![Allat, Manat and al-Uzza on a relief from Hatra (Iraq Museum). Iconography from the northern trade cities, not the Hijaz itself](images/12_ta_if_nakhla_and_qudayd_the_shri/01_allat_manat_and_al_uzza_on_a_relief_from_hatra_i.jpg)
*Allat, Manat and al-Uzza on a relief from Hatra (Iraq Museum). Iconography from the northern trade cities, not the Hijaz itself.* Credit: Osama Shukir Muhammed Amin FRCP(Glasg), CC BY-SA 4.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Relief_of_the_Arabian_goddess_Al-Lat,_Manat_and_al-Uzza_from_Hatra._Iraq_Museum.jpg).

![Allat between two lions in a niche (Damascus museum): a model for a shrine niche](images/12_ta_if_nakhla_and_qudayd_the_shri/02_allat_between_two_lions_in_a_niche_damascus_muse.jpg)
*Allat between two lions in a niche (Damascus museum): a model for a shrine niche.* Credit: Dosseman, CC BY-SA 4.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Damascus_National_Museum_monolithic_niche_with_Allat_between_two_lions_7819.jpg).

![The Lion of Allat from Palmyra, with an antelope between its paws](images/12_ta_if_nakhla_and_qudayd_the_shri/03_the_lion_of_allat_from_palmyra_with_an_antelope.jpg)
*The Lion of Allat from Palmyra, with an antelope between its paws.* Credit: Mappo, Public domain, [Commons file page](https://commons.wikimedia.org/wiki/File:Lion_in_the_garden_of_Palmyra_Archeological_Museum,_2010-04-21.jpg).

![The Sarawat mountains at al-Hada above Ta'if](images/12_ta_if_nakhla_and_qudayd_the_shri/04_the_sarawat_mountains_at_al_hada_above_ta_if.jpg)
*The Sarawat mountains at al-Hada above Ta'if.* Credit: Richard Mortel, CC BY 2.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Al-Hada,_near_al-Taif,_Saudi_Arabia_%286%29.jpg).

![Green hills at al-Shafa, Ta'if: the cool highland look](images/12_ta_if_nakhla_and_qudayd_the_shri/05_green_hills_at_al_shafa_ta_if_the_cool_highland.jpg)
*Green hills at al-Shafa, Ta'if: the cool highland look.* Credit: Ziyad Alsufyani, CC BY-SA 4.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Alshafa20.JPG).


**Level idea: "The Three Daughters".** Three small shrine maps, one per goddess, each with a different biome. They work as a pilgrimage chain that ends at the Ukaz fair.
- **Ta'if: "The White Rock".** A highland town: terraced orchards (grapes, pomegranates, roses), stone towers, cold nights. The precinct of al-Lat is a walled courtyard with a curtained house around a white cube rock. The Thaqif custodians give quests about protecting the vineyards from baboons (the Hamadryas baboon lives in these mountains: a comic, thieving enemy). Traversal: terraces as 1.2 m steps up the mountain.
- **Nakhla: "Three Trees".** A narrow wadi with palms. The three *samura* trees stand inside a fenced enclosure, hung with cloth offerings. A night ritual (circling with torches) is a talk quest. A jinn story is told here: the trees whisper.
- **Qudayd: "The Stone by the Sea".** A coastal plain, a black stone on a low mound, Red Sea surf, mangroves, pilgrims shaving heads. The shore is a fast riding route. Pirates and wreckers on the reef give a combat side quest.
- *Treatment:* show these as living cults, with priests (*sadin*), offerings and pilgrims. Don't let the player destroy them (see the sensitivity note).

**Blender notes.**
- *Ta'if:* a mountain heightfield with terrace steps (reuse `Wadi.STEPS` logic on a slope). Make vines from small green box clusters on wooden frames. The white rock is a 2 m cube in `#efe8dc`.
- *Nakhla:* reuse `Wadi` almost as is. Three `acacia()` trees inside a `palisade(h=1.2)` ring, with cloth strips (CLOTH banners) hanging from them.
- *Qudayd:* a coastal heightfield with a sea plane, `rock()` in black basalt for the stone, and mangroves (squat, dense dark green shrubs).

## 13. Mecca before Islam (handle with care)

**What it was.** Before Islam, Mecca was a sanctuary town in a dry valley, kept by the Quraysh. The Kaaba held many idols, Hubal chief among them, and was the goal of an annual pilgrimage tied to the holy months and the nearby fairs. The well of Zamzam stood beside it. In the year traditionally linked to 570 CE (the "Year of the Elephant"), the Aksumite ruler of Yemen, Abraha, is said to have marched on Mecca. His campaigns into central Arabia are confirmed by his inscription at Murayghan near Bir Hima, dated 552 CE ([Wikipedia: Kaaba](https://en.wikipedia.org/wiki/Kaaba); [Hubal](https://en.wikipedia.org/wiki/Hubal); [Abraha](https://en.wikipedia.org/wiki/Abraha)).

**Recommendation.** Don't make Mecca or the Kaaba a playable map. For most of the game's Arabic-speaking audience it is the holiest place on earth, and an action game set in it, especially one with idols, combat and looting, would offend many players and could get the game banned in several markets. Instead:
- Use **Ukaz** (11) and the fairs of **Majanna** and **Dhu al-Majaz** for the pilgrimage-season feeling.
- Use the **three goddess shrines** (12) for idol cults.
- Use **Hima** (15) for Abraha's army, with the inscription as a lore stone.
- If the story needs it, Mecca can be named in dialogue as a distant sanctuary that is never shown.

---

# Part III: The south (Najran, Yemen, Dhofar) and the incense road

The incense kingdoms of the south are Saba (Sheba), Ma'in, Qataban, Hadramawt and later Himyar. They grew rich on frankincense and myrrh, which were carried north by camel caravans along the edge of the desert to Najran, Qaryat al-Faw, Dadan, Hegra, Petra and Gaza ([Wikipedia: Incense trade route](https://en.wikipedia.org/wiki/Incense_trade_route); [Sabaeans](https://en.wikipedia.org/wiki/Sabaeans)). Their architecture is the most distinctive in the peninsula and suits the low-poly kit very well:
- *Masonry:* fine limestone ashlar with drafted margins.
- *Pillars:* tall monolithic square pillars.
- *Decoration:* friezes of ibex heads and "dentil" false-window patterns.
- *Inscriptions:* in the angular Musnad script, set in bands.

## 14. Najran and al-Ukhdud

**What it was.** Najran is a broad oasis valley on the border with Yemen, and the northern gate of the incense road. Its ancient walled town, today the site of al-Ukhdud (ancient Ragmat), had square stone houses, a citadel and many Musnad inscriptions. By the 6th century Najran had a large Christian community. In 523 CE the Himyarite king Yusuf As'ar Yath'ar (Dhu Nuwas), a convert to Judaism, besieged the town and killed many Christians. Syriac sources remember them as the Martyrs of Najran, and Islamic tradition links the event to the "People of the Ditch" (*Ashab al-Ukhdud*). Aksumite intervention followed ([Wikipedia: Al-Ukhdud](https://en.wikipedia.org/wiki/Al-Ukhdud); [Najran](https://en.wikipedia.org/wiki/Najran); [Dhu Nuwas](https://en.wikipedia.org/wiki/Dhu_Nuwas)).

![Al-Ukhdud: the big dressed blocks of a house footing](images/14_najran_and_al_ukhdud/01_al_ukhdud_the_big_dressed_blocks_of_a_house_foot.jpg)
*Al-Ukhdud: the big dressed blocks of a house footing.* Credit: Richard Mortel, CC BY 2.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Site_of_al-Ukhdud,_Najran_%282%29.jpg).

![The Najran valley at al-Ukhdud: palms and fields beyond the ruins](images/14_najran_and_al_ukhdud/02_the_najran_valley_at_al_ukhdud_palms_and_fields.jpg)
*The Najran valley at al-Ukhdud: palms and fields beyond the ruins.* Credit: Richard Mortel, CC BY 2.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Ancient_site_of_al-Ukhdud,_Najran,_Saudi_Arabia_%2860%29.jpg).

![Excavated house foundations, with the mountains of Najran behind](images/14_najran_and_al_ukhdud/03_excavated_house_foundations_with_the_mountains_o.jpg)
*Excavated house foundations, with the mountains of Najran behind.* Credit: Richard Mortel, CC BY 2.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Site_of_al-Ukhdud,_Najran_%2817%29.jpg).


**Level idea: "Ragmat of the Gardens".**
- *Era choice:* set it about a century *before* 523. Ragmat is then a busy caravan city of the incense road with its gardens, and the later tragedy can appear as a prophecy or a memorial epilogue, never as a fight.
- *Layout:* the walled city (about 230 × 220 m) of square stone-footed houses, a citadel on the north side, and a temple. Outside lie the green Najran valley with palm groves and wheat, and the wadi with a seasonal flood.
- *NPCs:* caravan masters bound for the north; a Christian monk; a Jewish date-merchant; a Himyarite tax collector. They show the town's mixed life.
- *Quests:* "Tolls of the north road": join a caravan leaving for Hima (section 15). "The flood": save the barley fields when the wadi floods, by opening sluice gates in order.
- *Enemies:* raiders of the desert edge; vipers in the fields.

**Blender notes.**
- *Houses:* South Arabian stone footings (1.5–2 m of large ashlar) carrying mudbrick upper storeys. Use `house()` with a new `footing` band in `#c4ad8a` ashlar.
- *Inscriptions:* friezes as a strip of small dark boxes (letter shapes) on a lighter band.
- *Walls:* a city wall with square towers, about 6 m high, tagged `wall`.

## 15. Hima wells and rock art

**What it was.** Bir Hima, about 90–100 km north of Najran, is a group of wells where the incense road split towards the north-west (Hijaz) and the north-east (the Gulf). Every caravan stopped to water there for thousands of years, and travellers covered the surrounding sandstone hills with some 7,000 years of carvings: hunts, camels, ostriches, warriors with shields, and tens of thousands of inscriptions in Musnad, Thamudic, Greek and early Arabic.
- *Abraha's inscription:* the Ethiopian (Aksumite) king of Yemen carved an account of a campaign against central Arabian tribes at Murayghan, dated 552 CE.
- *UNESCO:* inscribed 2021 as the [Ḥimā Cultural Area (1619)](https://whc.unesco.org/en/list/1619).

Sources: [Wikipedia: Bir Hima Rock Petroglyphs and Inscriptions](https://en.wikipedia.org/wiki/Bir_Hima_Rock_Petroglyphs_and_Inscriptions); [Abraha](https://en.wikipedia.org/wiki/Abraha).

![A carved boulder at Hima](images/15_hima_wells_and_rock_art/01_a_carved_boulder_at_hima.jpg)
*A carved boulder at Hima.* Credit: Heritage Commission, CC BY-SA 4.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Hima_Cultural_Area_Overview2.jpg).

![Petroglyphs on a sandstone face at Hima](images/15_hima_wells_and_rock_art/02_petroglyphs_on_a_sandstone_face_at_hima.jpg)
*Petroglyphs on a sandstone face at Hima.* Credit: Richard Mortel, CC BY 2.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Ancient_petroglyphs_at_Hima_Cultural_Area,_near_Najran,_Saudi_Arabia_%2867%29.jpg).

![The Hima plain: sand and scattered acacias](images/15_hima_wells_and_rock_art/03_the_hima_plain_sand_and_scattered_acacias.jpg)
*The Hima plain: sand and scattered acacias.* Credit: Richard Mortel, CC BY 2.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Landscape_at_Hima_Cultural_Area,_near_Najran,_Saudi_Arabia_%282%29.jpg).

![Thamudic graffiti: the kind of scratched lines that cover Hima's rocks](images/15_hima_wells_and_rock_art/04_thamudic_graffiti_the_kind_of_scratched_lines_th.jpg)
*Thamudic graffiti: the kind of scratched lines that cover Hima's rocks.* Credit: Falcodigiada, CC BY-SA 4.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Thamudic_inscriptions_Wadi_Rum.jpg).


**Level idea: "The Last Wells".**
- *Layout:* a basin with seven wells, each a stone-lined shaft with a trough. A ring of dark sandstone hills and boulder fields carries the carvings. An army camp of Abraha's force on the plain uses Aksumite banners; a war elephant tethered in the camp is a unique landmark.
- *Mood:* dawn, with long shadows across the carvings (they read best in raking light).
- *Quests:*
  - "Read the road": a rock-art hunt. Each of the 12 panels shows a route or a danger, and solving them marks wells on other maps.
  - "The king's stone": a scribe of Abraha is carving the campaign record. Protect him, or steal his chisel for the Kindite side (a faction choice).
- *Enemies:* desert raiders; Aksumite spearmen in a spear-wall stance (the Rudayni lancer from the brainstorm).
- *Secrets:* a carved ostrich panel; following its "running" direction leads to a cave cache.

**Blender notes.** Reuse `well()` seven times with variations. Carved panels are the same as Ha'il (section 8). The elephant needs a new quadruped rig (large; the horse rig scaled with a trunk bone) or a static prop. Use a sandy dark sandstone palette (`#6a4a34`, `#8a6244`, `#b08560`) with a desert-varnish top coat.

## 16. Marib: the Great Dam and the Sabaean temples

**What it was.** Marib was the capital of Saba (Sheba), the richest of the incense kingdoms, from at least the 8th century BCE until the 3rd century CE, when Himyar absorbed it.
- **The Great Dam** closed Wadi Dhana with an earth embankment about 580–650 m long, with stone sluice buildings at each end. It watered two large oases (the "two gardens" of the Qur'an's Saba story) of about 9,600 hectares. It was repaired repeatedly, finally breached around 570 CE (the *Sayl al-'Arim*, "flood of 'Arim"), and never rebuilt. In Arab memory the breach scattered the southern tribes north.
- **Awwam temple (Mahram Bilqis)** was the national sanctuary of the god Almaqah. It has a huge oval enclosure wall about 300 m around, a peristyle hall with eight tall pillars at its entrance, and a cemetery beside it.
- **Barran temple ('Arsh Bilqis, "Bilqis's throne")** is a temple platform whose five and a half monolithic pillars still stand about 12 m tall.
- **UNESCO:** inscribed 2023 as the [Landmarks of the Ancient Kingdom of Saba, Marib (1700)](https://whc.unesco.org/en/list/1700) (on the danger list).

Sources: [Wikipedia: Marib Dam](https://en.wikipedia.org/wiki/Marib_Dam); [Mahram Bilqis](https://en.wikipedia.org/wiki/Mahram_Bilqis); [Barran Temple](https://en.wikipedia.org/wiki/Barran_Temple); [Almaqah](https://en.wikipedia.org/wiki/Almaqah); [National Geographic on the dam](https://www.nationalgeographic.com/science/article/150603-Yemen-ancient-Sheba-dam-heritage-destruction-Middle-East-archaeology).

![The southern sluice of the Marib dam. Ashlar walls without mortar, and the spillway](images/16_marib_the_great_dam_and_the_saba/01_the_southern_sluice_of_the_marib_dam_ashlar_wall.jpg)
*The southern sluice of the Marib dam. Ashlar walls without mortar, and the spillway.* Credit: H. Grobe, CC BY-SA 3.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Jemen1988-022_hg.jpg).

![Barran temple: the monolithic pillars on their platform, with fields around](images/16_marib_the_great_dam_and_the_saba/02_barran_temple_the_monolithic_pillars_on_their_pl.jpg)
*Barran temple: the monolithic pillars on their platform, with fields around.* Credit: Ali Mohamed, CC BY-SA 2.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Barran_Temple.jpg).

![Barran in 1986: pillars, stepped platform and ashlar courses](images/16_marib_the_great_dam_and_the_saba/03_barran_in_1986_pillars_stepped_platform_and_ashl.jpg)
*Barran in 1986: pillars, stepped platform and ashlar courses.* Credit: Bernard Gagnon, CC BY-SA 3.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Bar%27an_temple_1986-2.jpg).

![Awwam (Mahram Bilqis): the pillared entrance hall and the enclosure wall](images/16_marib_the_great_dam_and_the_saba/04_awwam_mahram_bilqis_the_pillared_entrance_hall_a.jpg)
*Awwam (Mahram Bilqis): the pillared entrance hall and the enclosure wall.* Credit: Marib Governorate, CC BY-SA 2.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Awwam_Temple.jpg).

![A reconstruction of Awwam's north-west gate](images/16_marib_the_great_dam_and_the_saba/05_a_reconstruction_of_awwam_s_north_west_gate.jpg)
*A reconstruction of Awwam's north-west gate.* Credit: Wissmann, CC0, [Commons file page](https://commons.wikimedia.org/wiki/File:Awwam_Northwest_gate.jpg).

![A 3D model of a Sabaean altar with recessed false window panels: already low-poly](images/16_marib_the_great_dam_and_the_saba/06_a_3d_model_of_a_sabaean_altar_with_recessed_fals.jpg)
*A 3D model of a Sabaean altar with recessed "false window" panels: already low-poly.* Credit: Nabataeus, CC BY-SA 4.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Sabaean_altar,_marib.jpg).


**Level idea: "The Flood of 'Arim".** A big map with two states.
- *Layout:* Wadi Dhana runs between two rocky mountain ridges. The dam closes the gorge with sluice towers at both ends; behind it is a long reservoir, in front of it the canal system and the two oases (North and South) of fields and palms. Further out, Marib city sits on its mound with mudbrick tower houses on stone footings, the Awwam oval stands in the desert sand, and Barran's pillars stand on their platform.
- *Mood:* golden hour over green fields and bright limestone. After the breach the same map turns grey and dusty, with dead fields and a silted canal.
- *NPCs:* the *mukarrib* or king of Saba; Almaqah's priests; canal wardens (the water rota is a talk quest); Himyarite envoys (rising rivals); a southern caravan master.
- *Quests:*
  - "Wardens of the water": open and close canal sluices in a sequence to water each field (a timing puzzle).
  - "Cracks in the bank": rodents and neglect weaken the dam (an Arab legend says a rat started the breach). Patrol at night, killing giant rats and rebuilding stones.
  - "The breach": the boss fight is a rising flood against a dam monster, or simply survival. You must escape up the sluice tower as water surges, then guide the tribes out. The map switches to its broken state, and refugee NPCs from Marib appear on other maps afterwards.
  - "Pilgrimage to Awwam": carry an offering through the oval's single gate during Almaqah's festival.
- *Enemies:* Himyarite raiders; giant rats; hyenas in the Awwam cemetery; jackals.
- *Traversal:*
  - The dam crest is a long walkable path.
  - The sluice towers are a climb: 8–14 m of ashlar ledges.
  - Barran's pillars are a pillar-top jump route to a secret on the tallest.
  - Awwam's oval wall top (already in `ruined_temple`) is a ring route.
- *Secrets:* a sealed Sabaean archive with bronze plaques; the Queen of Sheba's legend as a lore chain (in South Arabian memory she is Bilqis; keep the biblical and Qur'anic versions out of the dialogue).

**Blender notes.**
- *Reuse:* `RuinedTemple` in `platform_maps.py` is already an Awwam-style oval. Its enclosure code (40 wall segments, walkable top) can be copied into a Marib map, or Marib can link to it as a neighbouring map.
- *Dam:* a long trapezoid earth bank (heightfield bump, not a box) with a walkable crest `pbox(tag="wall")`. Each sluice tower is a stack of ashlar `pbox` blocks with an open spillway channel.
- *Barran:* a stepped platform (3 tiers of 1.2 m) and 6 square pillars about 12 m tall (one broken at half height), using `square_pillar(top=12, s=1.1)` from `platform_maps.py`.
- *Palette:* pale limestone `#e6d6b4`, `#d4c09a`; drafted-margin highlights `#f1e6cc`; green fields `#6b7a3a`; water `WATER`.
- *Second state:* export the map twice (`marib` and `marib_breach`) with the same layout and a different reservoir level, field colours and dressing. This is simpler than a runtime switch.

## 17. Sirwah

**What it was.** Sirwah, 40 km west of Marib, was an early Sabaean centre (8th–7th c. BCE). It has a large temple of Almaqah with a crescent-shaped wall. In the temple stands the great stone inscribed with the campaigns of the *mukarrib* Karib'il Watar, the longest Sabaean inscription, which records his wars against Awsan and others. The German Archaeological Institute has excavated and restored the site ([Wikipedia: Sirwah](https://en.wikipedia.org/wiki/Sirwah); [Karib'il Watar](https://en.wikipedia.org/wiki/Karib%27il_Watar)).

![Sirwah: ashlar walls and a gate, with monolithic pillars behind](images/17_sirwah/01_sirwah_ashlar_walls_and_a_gate_with_monolithic_p.jpg)
*Sirwah: ashlar walls and a gate, with monolithic pillars behind.* Credit: Kmatura, CC BY 3.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Jemen_Sirwah_01.JPG).

![Sirwah in its mountain valley](images/17_sirwah/02_sirwah_in_its_mountain_valley.jpg)
*Sirwah in its mountain valley.* Credit: Kmatura, CC BY-SA 3.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Jemen_Sirwah_04.JPG).


**Level idea: "The Stone of Victories".** A small fortress-temple map in a mountain valley. The main quest is a ritual: the carvers are inscribing the victory stone, and you go to each battlefield mentioned (other maps) to bring back a token. When all are in, the full inscription text unlocks a strong weapon. Traversal: the curved temple wall and the citadel above it.

**Blender notes.** Reuse the Marib palette and pillars. The crescent wall is a 20-segment arc of `ruin_wall`. The stele is a 6 m `pbox` slab with letter-band decals.

## 18. Baraqish (Yathill) and the Minaeans

**What it was.** Baraqish (ancient Yathill) in Yemen's al-Jawf was a city of the Minaean kingdom (Ma'in), the great traders of the incense road; Minaean merchants had colonies as far as Dadan and Egypt. Its stone wall, with dozens of towers, rings an oval mound of earlier towns. Inside is a temple of Nakrah. It is usually identified with the Athrula that the Roman general Aelius Gallus took in 25/24 BCE during his failed campaign into Arabia ([Wikipedia: Baraqish](https://en.wikipedia.org/wiki/Baraqish); [Minaean kingdom](https://en.wikipedia.org/wiki/Ma%27in)).

![Baraqish on its mound: the ancient wall with later tower houses on top](images/18_baraqish_yathill_and_the_minaean/01_baraqish_on_its_mound_the_ancient_wall_with_late.jpg)
*Baraqish on its mound: the ancient wall with later tower houses on top.* Credit: txago, CC BY 2.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Barakisk_flickr01.jpg).


**Level idea: "Fifty-Seven Towers".** A siege map in two phases.
- *Defence:* Aelius Gallus's legionaries (a new enemy look: helmets and rectangular shields) assault the walls with ladders and a ram, while you hold towers and pour down stones.
- *Infiltration (the alternative path):* you work for the Romans' Nabataean guide (historically Syllaeus, blamed for leading the army astray). Climb the wall at night between towers.
- *Traversal:* the whole wall is a ring of walkable tops and towers 2–3 m apart, ideal for the jump budget. The inner tell is a mound of stacked older houses.

**Blender notes.** This is the first map to need a `tower_wall(points, h=12, tower_every=18)` builder in `kit.py`: a mudbrick-on-stone curtain wall with square towers that rise 1.5 m above the wall-walk. Shibam, Shabwa and Timna can reuse it. The palette is mud over stone (`MUD` from `arabia_lib.py` above an ashlar footing).

## 19. Timna and Qataban

**What it was.** Timna (Hajar Kohlan), in Wadi Bayhan, was the capital of Qataban, a kingdom of the incense road that peaked in the last centuries BCE. A stele set at the city's market gate carried Qataban's commercial law: rules for traders, taxes and market days. Above the valley, the Mablaqa pass was paved and stepped for caravans. Timna burned in the 1st century CE and Qataban was absorbed by its neighbours ([Wikipedia: Timnaʿ](https://en.wikipedia.org/wiki/Timna%CA%BF); [Qataban](https://en.wikipedia.org/wiki/Qataban)).

![A Qatabanian inscribed alabaster stele (Louvre)](images/19_timna_and_qataban/01_a_qatabanian_inscribed_alabaster_stele_louvre.jpg)
*A Qatabanian inscribed alabaster stele (Louvre).* Credit: unknown, Public domain, [Commons file page](https://commons.wikimedia.org/wiki/File:Inscribed_stele_Qataban_Louvre_AO21124.jpg).

![An alabaster head from Qataban (3rd–1st c. BCE)](images/19_timna_and_qataban/02_an_alabaster_head_from_qataban_3rd_1st_c_bce.jpg)
*An alabaster head from Qataban (3rd–1st c. BCE).* Credit: Mary Harrsch, CC BY-SA 4.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Head_of_a_man_Qataban_%28Arabia_Felix%29_3rd-1st_century_BCE_Alabaster_at_the_Seattle_Art_Museum.jpg).

![An alabaster funerary head from South Arabia (Walters Art Museum, public domain). The stylised faces suit low-poly heads well](images/19_timna_and_qataban/03_an_alabaster_funerary_head_from_south_arabia_wal.jpg)
*An alabaster funerary head from South Arabia (Walters Art Museum, public domain). The stylised faces suit low-poly heads well.* Credit: Anonymous (South Arabia), Public domain, [Commons file page](https://commons.wikimedia.org/wiki/File:South_Arabian_-_Head_of_a_Woman_with_a_Rectangular_Face_-_Walters_2123_-_Three_Quarter.jpg).

![A man's head in the same style](images/19_timna_and_qataban/04_a_man_s_head_in_the_same_style.jpg)
*A man's head in the same style.* Credit: Anonymous (South Arabia), Public domain, [Commons file page](https://commons.wikimedia.org/wiki/File:South_Arabian_-_Head_of_a_Man_with_a_Rectangular_Face_-_Walters_2122_-_Three_Quarter.jpg).


**Level idea: "The Market Law".**
- *Layout:* a walled city with a big market square. The law stele stands at the south gate, and the paved pass zig-zags up the mountain behind.
- *Quests:* a series of "market law" puzzles, each based on one rule of the stele: catching a cheat who sells outside market hours, collecting a toll, settling a debt. Talk and fetch quests with consequences.
- *Traversal:* the Mablaqa pass is a switchback climb with shortcuts that skip a bend by jumping between rock ledges.
- *Enemies:* smugglers who avoid the tolls on the mountain paths.

**Blender notes.** Reuse `tower_wall` from Baraqish. The pass is a spline stair of `pbox` steps 0.25 m high, 3 m wide, with a retaining wall. Alabaster funerary heads make great small props: white boxes with a face carved in 3 planes.

## 20. Shabwa and the Hadramawt

**What it was.** Shabwa was the capital of the Hadramawt kingdom, the land where frankincense grew. Pliny the Elder (*Natural History* 12.63) says all the incense had to be brought to Shabwa (*Sabota*), where a tenth was taken for the god Sayin before any could be sold. Shabwa had some 60 temples, a royal palace called Shaqir and a monumental gate. Himyar sacked and burned it around 300 CE. Wadi Hadramawt, to its east, is a deep canyon with mudbrick tower cities. Its most famous one, Shibam, is post-Islamic in its present form, but it was founded in late antiquity and shows how Hadrami builders built high in mud ([Wikipedia: Shabwa](https://en.wikipedia.org/wiki/Shabwa); [Kingdom of Hadhramaut](https://en.wikipedia.org/wiki/Kingdom_of_Hadhramaut); [Shibam, UNESCO 192](https://whc.unesco.org/en/list/192)).

![Ruins of Shabwa's rampart](images/20_shabwa_and_the_hadramawt/01_ruins_of_shabwa_s_rampart.jpg)
*Ruins of Shabwa's rampart.* Credit: BluesyPete, CC BY-SA 3.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Y%C3%A9men-104.JPG).

![Shibam in Wadi Hadramawt](images/20_shabwa_and_the_hadramawt/02_shibam_in_wadi_hadramawt_mudbrick_towers_with_li.jpg)
*Shibam in Wadi Hadramawt: mudbrick towers with lime-white tops. Its present form is much later, but the building tradition is old.* Credit: Jialiang Gao www.peace-on-earth.org, CC BY-SA 3.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Shibam_Wadi_Hadhramaut_Yemen.jpg).


**Level idea: "The Tithe of Sayin".**
- *Layout:* a walled city in a dry valley among salt domes, with a great gate where every load is weighed. The burned palace of Shaqir has charred colonnades. Ten temples cluster in a sacred quarter. The incense warehouses are guarded.
- *Mood:* noon, white haze, heat shimmer, incense smoke drifting from the temples.
- *Quests:*
  - "The tithe": weigh caravans at the gate and catch the one hiding incense (a search quest).
  - "Fire at Shaqir": the night the palace burned. Escape the fire across burning rafters, a platforming set piece with falling beams.
- *Enemies:* Himyarite assault troops at night; temple-thief rogues.
- *Side trip:* Wadi Hadramawt's canyon city, a vertical rooftop map like `rooftops` with tower houses 5–8 storeys high and narrow alleys.

**Blender notes.** Use the `tower_wall` from Baraqish and `tower_house()` stretched to 20–30 m with banded windows. Shibam-style towers have white lime tops (`#efe9dc`) over mud brown. Salt domes are smooth grey-white humps. Burned rafters are thin `beam()` pieces in a charred `#2a1f1a`.

## 21. Zafar and Himyar

**What it was.** Zafar, in the highlands south of Sana'a, was the capital of the Himyarite kingdom (from about 110 BCE). By the late 3rd century CE Himyar had united all of South Arabia, and it ruled until the Aksumite conquest of 525 CE. The site lies on a volcanic hill with rock-cut rooms, caves, cisterns and terraced fields, and has yielded fine reliefs ([Wikipedia: Zafar, Yemen](https://en.wikipedia.org/wiki/Zafar,_Yemen); [Himyarite Kingdom](https://en.wikipedia.org/wiki/Himyarite_Kingdom)). In Sana'a, the legendary palace of **Ghumdan** was said to rise 20 storeys, roofed with alabaster so thin that birds could be seen flying overhead ([Wikipedia: Ghumdan Palace](https://en.wikipedia.org/wiki/Ghumdan_Palace)).

![Bronze bust of the Himyarite king Dhamar'ali Yuhabirr (3rd c. CE)](images/21_zafar_and_himyar/01_bronze_bust_of_the_himyarite_king_dhamar_ali_yuh.jpg)
*Bronze bust of the Himyarite king Dhamar'ali Yuhabirr (3rd c. CE): curly hair, a bare chest and a regal look. A model for a king NPC.* Credit: Retlaw Snellac, CC BY 2.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Dhamar_Ali_Yahbur_%28bust%29.jpg).

![A miniature stone door panel from Zafar (2nd–3rd c.), framed with vine scrolls](images/21_zafar_and_himyar/02_a_miniature_stone_door_panel_from_zafar_2nd_3rd.jpg)
*A miniature stone door panel from Zafar (2nd–3rd c.), framed with vine scrolls: a model for Himyarite doors.* Credit: sailko, CC BY-SA 3.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Antico_yemen,_porta_in_miniatura,_da_zafar,_II-III_sec.JPG).


**Level idea: "The Green Mountains".** The game's only highland-rain map.
- *Layout:* misty volcanic peaks covered in terraced fields. Zafar's citadel hill is honeycombed with rock-cut rooms. Waterfalls fall in the rainy season.
- *Ghumdan:* a legendary tower as a vertical climb. Twenty floors of ledges; the alabaster roof at the top is a glass-like platform; four bronze lions at the corners "roar" when the wind blows through them (a sound puzzle). This could be a dream or legend map entered from Zafar.
- *Enemies:* Aksumite invaders (the Himyar fall); mountain leopards; baboons.

**Blender notes.** A steep terrace heightfield (Wadi steps on a cone), green palette (`#5f7434` and up), mist fog. Ghumdan is `tower_house()` stacked to 20 floors with ledges every 3.2 m (two jumps per floor using interior crates). The alabaster roof material is translucent-looking: pale `#f3eadb` with low roughness.

## 22. Qana, Socotra and the incense ships

**What it was.** Qana (Bir Ali today) was Hadramawt's harbour on the Arabian Sea, below a black volcanic headland crowned by a fort called Husn al-Ghurab ("Crow's Castle"). Frankincense came in from Dhofar and Socotra and went out again by caravan. The 1st-century Greek *Periplus of the Erythraean Sea* describes it. Socotra, the island offshore, was the source of aloe and of dragon's blood resin (from *Dracaena cinnabari*). In the Hoq cave, sailors from India, South Arabia, Ethiopia and the Greek world left graffiti (1st c. BCE – 6th c. CE) ([Wikipedia: Bir Ali (Qana)](https://en.wikipedia.org/wiki/Bir_Ali); [Socotra](https://en.wikipedia.org/wiki/Socotra)).

![The black volcanic headland at Bir Ali (ancient Qana), where Husn al-Ghurab stands](images/22_qana_socotra_and_the_incense_shi/01_the_black_volcanic_headland_at_bir_ali_ancient_q.jpg)
*The black volcanic headland at Bir Ali (ancient Qana), where Husn al-Ghurab stands.* Credit: Ljuba brank, CC BY-SA 3.0, [Commons file page](https://commons.wikimedia.org/wiki/File:23_Bir_Ali_%285%29.jpg).

![The cliff with the Hoq cave on Socotra](images/22_qana_socotra_and_the_incense_shi/02_the_cliff_with_the_hoq_cave_on_socotra.jpg)
*The cliff with the Hoq cave on Socotra.* Credit: Clemens Schmillen, CC BY-SA 4.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Hoq_Cave_-_entrance.jpg).

![Socotra's dragon's blood trees: an unmistakable low-poly silhouette](images/22_qana_socotra_and_the_incense_shi/03_socotra_s_dragon_s_blood_trees_an_unmistakable_l.jpg)
*Socotra's dragon's blood trees: an unmistakable low-poly silhouette.* Credit: Alex38, CC BY 4.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Dragonblood_tree_in_Socotra_2.jpg).

![Dragon's blood trees on the plateau](images/22_qana_socotra_and_the_incense_shi/04_dragon_s_blood_trees_on_the_plateau.jpg)
*Dragon's blood trees on the plateau.* Credit: Rod Waddington, CC BY-SA 4.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Dragon%27s_Blood_Tree,_Socotra_Is.jpg).


**Level idea: "The Crow's Castle".** A coastal map with a harbour full of sewn-plank ships (*dhow* ancestors), warehouses, the Crow's Castle on the black headland (a climb route of 140 m switchbacks) and a lighthouse fire. A boat trip reaches **Socotra** as a small secret island map of dragon's-blood trees, limestone plateaus and the Hoq cave, where you read the graffiti of many languages.

**Blender notes.** A black basalt headland (BASALT bands from Khaybar), a sea plane, and ships as box hulls with a single mast and a square sail. Dragon's blood tree: a straight trunk, branches that split two at a time in a fan, and a flat umbrella crown (a flattened box disk). It is easy and iconic.

## 23. Dhofar: Wadi Dawkah, Sumhuram and Shisr ("Ubar")

**What it was.** Dhofar in southern Oman is the heartland of frankincense (*Boswellia sacra*). Its coast catches the summer monsoon (*khareef*), which turns the hills green and misty for three months. UNESCO's [Land of Frankincense (1010)](https://whc.unesco.org/en/list/1010) covers four sites:
- **Wadi Dawkah:** a frankincense grove.
- **Sumhuram (Khor Rori):** a walled port founded by Hadramawt about the 3rd century BCE on a lagoon. It shipped incense and was abandoned around the 5th century CE when a sandbar closed the estuary.
- **Al-Baleed:** a later medieval port.
- **Shisr:** an oasis fort on the desert side.

Shisr was found in 1992 with the help of satellite images by an expedition including Nicholas Clapp and Ranulph Fiennes. They presented it as Ubar, the lost city of 'Ad and "Iram of the Pillars". Part of the fortress had collapsed into a sinkhole beneath it, which fitted the legend of a city swallowed by the sands. Most archaeologists now see Shisr as a caravan watering fort, not the legendary Iram ([Wikipedia: Ubar](https://en.wikipedia.org/wiki/Ubar); [Khor Rori](https://en.wikipedia.org/wiki/Khor_Rori); [Boswellia sacra](https://en.wikipedia.org/wiki/Boswellia_sacra)).

![Wadi Dawkah: frankincense trees dotting a stony plain](images/23_dhofar_wadi_dawkah_sumhuram_and/01_wadi_dawkah_frankincense_trees_dotting_a_stony_p.jpg)
*Wadi Dawkah: frankincense trees dotting a stony plain.* Credit: Dr. Thomas Liptak, CC BY-SA 4.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Oman,_Wadi_Dawkah,_Land_of_Frankincense.jpg).

![A frankincense tree: a short, twisted trunk with papery bark and small leaves](images/23_dhofar_wadi_dawkah_sumhuram_and/02_a_frankincense_tree_a_short_twisted_trunk_with_p.jpg)
*A frankincense tree: a short, twisted trunk with papery bark and small leaves.* Credit: Mauro Raffaelli, CC BY-SA 3.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Boswellia_sacra_in_Wadi_Dowkah_%28Dhofar%29.JPG).

![Sumhuram above its lagoon, now closed by a sandbar](images/23_dhofar_wadi_dawkah_sumhuram_and/03_sumhuram_above_its_lagoon_now_closed_by_a_sandba.jpg)
*Sumhuram above its lagoon, now closed by a sandbar.* Credit: Richard N Horne, CC BY-SA 4.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Khor_Rori,_the_site_of_the_ancient_fortified_port_city_of_Sumhuram,_was_abandoned_in_the_5th_century_most_likely_due_to_the_formation_of_the_sandbar_blocking_the_estuary.jpg).

![The sinkhole at Shisr, into which part of the fort collapsed](images/23_dhofar_wadi_dawkah_sumhuram_and/04_the_sinkhole_at_shisr_into_which_part_of_the_for.jpg)
*The sinkhole at Shisr, into which part of the fort collapsed.* Credit: Armatus1995, CC BY-SA 4.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Ubar.jpg).


**Level idea: "Three Faces of Dhofar".** One map with three bands from south to north.
- **Coast (south):** Sumhuram on its headland over the lagoon: a walled port, a temple of Sayin, warehouses, ships. Khareef mist and green hills.
- **Mountains (middle):** frankincense groves in wadis. Harvesting (*tapping*) is a gathering mini-quest: scrape the bark, come back later for the tears of resin. The trees are guarded, and legend says winged serpents guard them (Herodotus 3.107). A flying-snake enemy would be fun.
- **Desert edge (north):** Shisr's fort over its sinkhole, the last water before the Empty Quarter. At the end of the questline the floor gives way and the fort collapses into the cavern (a set-piece escape), which hints at the Iram endgame.
- *Mood:* the only map with drizzle and green; the contrast is the point.
- *Enemies:* incense thieves; winged snakes; a boss ambush in the mists.
- *Secrets:* the cave under the Shisr sinkhole, the entrance to Iram (section 28).

**Blender notes.**
- *Frankincense tree:* a short, twisted multi-stem trunk of 3–4 bent boxes, peeling pale bark `#c8b9a0`, sparse leaf clusters `#6f803c`.
- *Terrain:* a north–south gradient. Sea plane and green hills in the south (`#7d8f4a`), stony brown jebel in the middle, sand in the north.
- *Sinkhole:* a heightfield pit 25 m across and 15 m deep with the fort's rubble sliding in. The collapse can be two exported states, as at Marib.
- *Fog:* thick khareef fog on the coast (`fog.near` 20), clear inland. Needs per-zone fog in code, or simply accept a single grey-green fog.

## 24. The Empty Quarter (Rub' al-Khali)

**What it is.** The largest continuous sand desert on earth, about 650,000 km² across Saudi Arabia, Oman, the UAE and Yemen. It has star and linear dunes up to 250 m high, salt flats (*sabkha*) and gravel plains. In the wetter Holocene there were lakes here, and fossil hippo and water-buffalo bones have been found. Caravans skirted its edges; only the Bedouin crossed it ([Wikipedia: Rub' al Khali](https://en.wikipedia.org/wiki/Rub%27_al_Khali)).

![Rub' al-Khali from orbit: linear dune ridges with salt flats between them](images/24_the_empty_quarter_rub_al_khali/01_rub_al_khali_from_orbit_linear_dune_ridges_with.jpg)
*Rub' al-Khali from orbit: linear dune ridges with salt flats between them.* Credit: NASA/GSFC/METI/ERSDAC/JAROS, and U.S./Japan ASTER Science Team, Public domain, [Commons file page](https://commons.wikimedia.org/wiki/File:Rub%27_al_Khali_%28Arabian_Empty_Quarter%29_sand_dunes_imaged_by_Terra_%28EOS_AM-1%29.jpg).

![At ground level: knife-edged ridges and empty sky](images/24_the_empty_quarter_rub_al_khali/02_at_ground_level_knife_edged_ridges_and_empty_sky.jpg)
*At ground level: knife-edged ridges and empty sky.* Credit: Ulf Rydin, CC BY-SA 4.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Rub_al-Khali_Oman_2.jpg).

!['Uruq Bani Ma'arid: red dunes and gravel corridors on the western edge](images/24_the_empty_quarter_rub_al_khali/03_uruq_bani_ma_arid_red_dunes_and_gravel_corridors.jpg)
*'Uruq Bani Ma'arid: red dunes and gravel corridors on the western edge.* Credit: Saudi Press Agency (SPA), CC BY-SA 4.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Uruq_Bani_Ma%27arid_Reserve,_Saudi_Arabia_%282025%29.jpg).

![The Arabian oryx: white coat, long straight horns. A legendary animal of the sands](images/24_the_empty_quarter_rub_al_khali/04_the_arabian_oryx_white_coat_long_straight_horns.jpg)
*The Arabian oryx: white coat, long straight horns. A legendary animal of the sands.* Credit: Charles J. Sharp, CC BY-SA 3.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Arabian_oryx_%28oryx_leucoryx%29.jpg).


**Level idea: "The Crossing".** A traversal map, not a town.
- *Layout:* the largest map: a 600 × 600 m stretch of dune ridges and *sabkha* corridors linking Qaryat al-Faw (north-west), Dhofar (south-east) and Gerrha (north-east). The corridors are fast for riding; the ridges are slow but carry the secrets.
- *Survival:* the waterskin as a real water meter that drains in sun. Wells are rare and some are dry; a hidden well is a bonfire.
- *Navigation:* stars at night; Suhayl (Canopus) points south (ties to brainstorm quest 21).
- *Encounters:* oryx herds; the sarab (mirage double); the ghul; a lost caravan; fossil hippo bones in an old lake bed (a lore beat).
- *Weather:* sandstorms hide the map and push you sideways. During a storm the exit to Iram appears.

**Blender notes.**
- *Terrain:* a long-wave sine ridge function (`|sin|`-based star and linear dunes) over the noise, ridges 20–40 m high (scaled down from life). White-grey salt flats in the troughs.
- *Palette:* orange-red sand (`#d58a4f`, `#e3a066`, `#f0bb85`), white sabkha `#e9e2d0`.
- *Dressing:* very sparse: `dry_bush`, `bones`, the odd `dead_tree`. Make a cheap heightfield at 2 m resolution.

---

# Part IV: The Gulf coast (Eastern Arabia, Bahrain, the Emirates)

## 25. Gerrha, Thaj and the Gulf coast

**What it was.** Gerrha was the great trading city of eastern Arabia in the Hellenistic age.
- *Strabo:* its people grew rich carrying Arabian aromatics and Indian goods by land and by river into Mesopotamia, and its houses were built of blocks of salt (Strabo, *Geography* 16.3.3).
- *Polybius:* when Antiochus III came in 205 BCE, the Gerrhaeans bought their freedom with 500 talents of silver, 1,000 of frankincense and 200 of myrrh oil (Polybius 13.9).
- *Location:* never proven. The candidates are the al-Ahsa oasis (Hofuf), the port of Uqair, Bahrain, and the walled inland town of Thaj ([Wikipedia: Gerrha](https://en.wikipedia.org/wiki/Gerrha)).

**Thaj** is an oval walled town of the 4th century BCE – 3rd century CE about 95 km inland, with a stone wall and towers around a salt-flat lake. At nearby Tell al-Zayer, in 1998, the grave of a young girl was found with a gold funerary mask, gold jewellery, rubies and pearls ([Wikipedia: Thaj](https://en.wikipedia.org/wiki/Thaj)). The region wrote in the Hasaitic variant of South Arabian script and minted coins that imitated Alexander's. **Al-Ahsa** is the world's largest palm oasis, fed by artesian springs ([UNESCO 1563](https://whc.unesco.org/en/list/1563)). **Tarout island** has Bronze Age layers tied to Dilmun ([Wikipedia: Tarout Island](https://en.wikipedia.org/wiki/Tarout_Island)).

![Gold necklace from Thaj (Tell al-Zayer, 1st c. CE), shown in Berlin](images/25_gerrha_thaj_and_the_gulf_coast/01_gold_necklace_from_thaj_tell_al_zayer_1st_c_ce_s.jpg)
*Gold necklace from Thaj (Tell al-Zayer, 1st c. CE), shown in Berlin.* Credit: Wolfgang Sauber, CC BY-SA 3.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Pergamon-Museum_-_Halskette_Thaj.jpg).

![A tetradrachm of Alexander type minted in eastern Arabia (Gerrha/Thaj), Bibliothèque nationale de France](images/25_gerrha_thaj_and_the_gulf_coast/02_a_tetradrachm_of_alexander_type_minted_in_easter.jpg)
*A tetradrachm of Alexander type minted in eastern Arabia (Gerrha/Thaj), Bibliothèque nationale de France.* Credit: Bibliothèque nationale de France, Public domain, [Commons file page](https://commons.wikimedia.org/wiki/File:Monnaie_-_T%C3%A9tradrachme,_argent,_types_d%27Alexandre_III_le_Grand,_Gerrha_%28Thaj%29,_,_-_btv1b103057231_%281_of_2%29.jpg).

![Uqair on the Gulf coast, seen through an arcade. The buildings are later, but the shore and light are right](images/25_gerrha_thaj_and_the_gulf_coast/03_uqair_on_the_gulf_coast_seen_through_an_arcade_t.jpg)
*Uqair on the Gulf coast, seen through an arcade. The buildings are later, but the shore and light are right.* Credit: Mark Dolce, CC BY-SA 3.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Uqair.jpg).

![Tarout castle stands on a far older Bronze Age tell](images/25_gerrha_thaj_and_the_gulf_coast/04_tarout_castle_stands_on_a_far_older_bronze_age_t.jpg)
*Tarout castle stands on a far older Bronze Age tell.* Credit: Mustafa Al-Elq, CC BY-SA 4.0, [Commons file page](https://commons.wikimedia.org/wiki/File:%D9%88%D8%A7%D8%AC%D9%87%D8%A9-%D9%82%D9%84%D8%B9%D8%A9-%D8%AA%D8%A7%D8%B1%D9%88%D8%AA.jpg).


**Level idea: "The City of Salt".**
- *Layout:* a coastal map. The lagoon port has sewn-plank boats and pearl divers; a salt flat stretches inland. The city of Gerrha is built of salt blocks that glitter grey-white and need constant repair. Behind it lie palm groves fed by springs. Thaj, inland, is a stone-walled rival, and the gold-masked girl's tomb mound lies on its edge.
- *Mood:* humid pearl-grey morning, glare off the salt. At sunset the salt walls turn pink.
- *Mechanic:* the salt houses "melt" when wet. A rare rain event (or a flood quest) makes walls slump, which changes routes.
- *NPCs:* Gerrhaean merchant princes; pearl divers and their *nakhuda* (captain); a Seleucid envoy demanding tribute; a Hasaitic scribe.
- *Quests:*
  - "Tribute": collect the frankincense and myrrh for Antiochus, or hide it.
  - "The diver's lungs": a pearl-diving mini-game (hold breath, collect oysters, avoid sharks and jellyfish).
  - "The golden mask": tomb robbers are after the girl's grave. Guard it, or find the mask before them and return it.
- *Enemies:* Seleucid soldiers (phalanx look: bronze helmets, long spears, the spear wall); sea raiders.

**Blender notes.**
- *Salt houses:* `house()` with a new salt material (`#d9d6cc` with a slight sheen, darker `#b9b3a5` damp bands at the base).
- *Coast:* a flat sabkha heightfield with a sea plane.
- *Boats:* from Qana (section 22).
- *Thaj:* an oval stone wall from the Baraqish `tower_wall`.
- *Palms:* the al-Ahsa palms use `palm()`.
- *Colliders:* boats are short walkable boxes (deck) when docked.

## 26. Dilmun (Bahrain)

**What it was.** Dilmun was a Bronze Age trading civilisation centred on Bahrain, at its height around 2200–1600 BCE. It linked Mesopotamia with Magan (Oman, copper) and Meluhha (the Indus).
- *Monuments:* Qal'at al-Bahrain was its capital, a tell 12 m high topped by a later fort ([UNESCO 1192](https://whc.unesco.org/en/list/1192)). The **Barbar temple** was built three times over a sacred freshwater spring, probably for Enki, the god of sweet water ([Wikipedia: Barbar Temple](https://en.wikipedia.org/wiki/Barbar_Temple)).
- *The mounds:* about 11,700 burial mounds survive out of a once much larger number, including "royal mounds" at A'ali up to 15 m high ([UNESCO 1542, Dilmun Burial Mounds](https://whc.unesco.org/en/list/1542)).
- *In myth:* Dilmun was a pure land of sweet water (*Enki and Ninhursag*). In the Sumerian flood story the survivor Ziusudra is settled there. Some scholars link the plant of youth that Gilgamesh dives for to the freshwater springs that bubble up from the sea floor around Bahrain ([Wikipedia: Dilmun](https://en.wikipedia.org/wiki/Dilmun)).

![Burial mounds at A'ali: a lumpy field of low rubble mounds. Easy to build as terrain](images/26_dilmun_bahrain/01_burial_mounds_at_a_ali_a_lumpy_field_of_low_rubb.jpg)
*Burial mounds at A'ali: a lumpy field of low rubble mounds. Easy to build as terrain.* Credit: Step, CC BY 2.0, [Commons file page](https://commons.wikimedia.org/wiki/File:A%27ali_Burial_Mounds.jpg).

![The Barbar temple: low ashlar terraces and platforms](images/26_dilmun_bahrain/02_the_barbar_temple_low_ashlar_terraces_and_platfo.jpg)
*The Barbar temple: low ashlar terraces and platforms.* Credit: Richard Mortel, CC BY 2.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Barbar_temple,_Dilmun_culture,_ca._3000-2000_BCE;_Bahrain_%2814%29.jpg).

![Barbar: the big dressed blocks of the temple platform](images/26_dilmun_bahrain/03_barbar_the_big_dressed_blocks_of_the_temple_plat.jpg)
*Barbar: the big dressed blocks of the temple platform.* Credit: Richard Mortel, CC BY 2.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Barbar_temple,_Dilmun_culture,_ca._3000-2000_BCE;_Bahrain_%288%29.jpg).

![Qal'at al-Bahrain: the tell by the sea. The fort on top is much later](images/26_dilmun_bahrain/04_qal_at_al_bahrain_the_tell_by_the_sea_the_fort_o.jpg)
*Qal'at al-Bahrain: the tell by the sea. The fort on top is much later.* Credit: Diego Delso, CC BY-SA 4.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Qal%27at_al-Bahrain,_Karbabad,_Bar%C3%A9in,_2024-08-18,_DD_67.jpg).


**Level idea: "The Land of the Living".** Set Dilmun as an ancient past: a map-within-a-legend, entered through a dream at the Barbar spring.
- *Layout:* an island with three zones. A green coast with springs and palms around Barbar's terraced temple. A huge field of burial mounds inland, hundreds of them, with the royal mounds as giants. The capital's harbour on the north shore.
- *Mood:* timeless, misty white noon. Then night in the mound field with lights moving between the mounds.
- *Quests:*
  - "The plant of youth": dive at the sea springs (marked by bubbling) to find a thorny plant. A snake steals it while you rest at the bonfire, as in the epic. The loss is the point; a second visit can win a lesser reward.
  - "The merchant's seal": Dilmun's round stamp seals are a collectible set. Each opens a warehouse in the harbour.
- *Enemies:* tomb wraiths of the mound field (ghul variants); giant crabs on the shore; sea snakes.
- *Traversal:* mound tops are a hop route over the field (mounds of 2–4 m with 2 m gaps), and the royal mounds are climbs of 10–15 m. Barbar's terraces step down to the spring.
- *Secrets:* an unrobbed mound with a door stone; a ring of sweet-water springs offshore marked by bubbles.

**Blender notes.**
- *Terrain:* a mound-field height function: the sum of many Gaussian or cosine domes (`h += A·max(0, 1 − (d/r)²)`), with random r = 3–8 m and A = 1.5–4 m, plus a few royal mounds (r = 18 m, A = 12 m). This is cheap and very readable from the high camera.
- *Barbar:* `pbox` terraces in pale ashlar, a square well pit with steps, and water.
- *Palette:* pale limestone `#ddd0b4`, mound earth `#c2a57c`, sea `#2f8a8a`.
- *Colliders:* mounds need no boxes, since they are heightfield. Temple terraces are `stair` and `altar` boxes.

## 27. Mleiha and Ed-Dur

**What it was.** Two sites in the UAE.
- **Mleiha** (Sharjah) is an inland site with a long history: a Bronze Age Umm an-Nar communal tomb (about 2300 BCE) with relief-carved stone, and a large town of about the 3rd century BCE – 3rd century CE. The later town had a fort, a mint that struck coins in the name of a king Abi'el, and graves in which horses and camels were buried beside their owners, some with gold trappings ([Wikipedia: Mleiha](https://en.wikipedia.org/wiki/Mleiha); [UNESCO tentative list 6643](https://whc.unesco.org/en/tentativelists/6643); [Sharjah Archaeology Authority](https://saa.shj.ae/en/place_exc/mleiha-sharjah)).
- **Ed-Dur** (Umm al-Quwain) was a coastal town of about the 1st century BCE – 2nd century CE on a lagoon, with a small temple to the sun god Shamash, Roman glass and coins from across the Indian Ocean world ([Wikipedia: Ed-Dur](https://en.wikipedia.org/wiki/Ed-Dur)).

![A plan of the Mleiha fort: a square enclosure with corner towers and rooms along the walls](images/27_mleiha_and_ed_dur/01_a_plan_of_the_mleiha_fort_a_square_enclosure_wit.jpg)
*A plan of the Mleiha fort: a square enclosure with corner towers and rooms along the walls.* Credit: Azd0815, CC BY-SA 4.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Mlaiha_fort_CW,_Sharjah_emirate.jpg).

![The Umm an-Nar tomb](images/27_mleiha_and_ed_dur/02_the_umm_an_nar_tomb_a_round_communal_grave_of_dr.jpg)
*The Umm an-Nar tomb: a round communal grave of dressed stone, with the Hajar mountains behind.* Credit: Angela Manthorpe, CC BY-SA 4.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Mleiha_tomb2.jpg).

![The tomb's entrance: a small window-like door in the curved ashlar wall](images/27_mleiha_and_ed_dur/03_the_tomb_s_entrance_a_small_window_like_door_in.jpg)
*The tomb's entrance: a small window-like door in the curved ashlar wall.* Credit: Richard Mortel, CC BY 2.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Entrance_of_the_Middle_Bronze_Age_Umm_al-Nar_tomb_at_Mleiha,_Sharjah,_UAE,_ca._2300_BCE_%281%29.jpg).

![Relief animals carved on the tomb's stones](images/27_mleiha_and_ed_dur/04_relief_animals_carved_on_the_tomb_s_stones.jpg)
*Relief animals carved on the tomb's stones.* Credit: Richard Mortel, CC BY 2.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Relief_decoration_on_the_Middle_Bonze_Age_Umm_al-Nar_tomb_at_Mleiha,_Sharjah,_UAE,_ca._2300_BCE.jpg).

![A Mleiha coin of the 1st–2nd c. CE](images/27_mleiha_and_ed_dur/05_a_mleiha_coin_of_the_1st_2nd_c_ce.jpg)
*A Mleiha coin of the 1st–2nd c. CE.* Credit: Alexandermcnabb, CC BY-SA 4.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Mleiha_Tetra_Drachma_-_100-200AD.jpg).

![Ed-Dur's dunes by the lagoon](images/27_mleiha_and_ed_dur/06_ed_dur_s_dunes_by_the_lagoon.jpg)
*Ed-Dur's dunes by the lagoon.* Credit: Alexandermcnabb, CC BY-SA 4.0, [Commons file page](https://commons.wikimedia.org/wiki/File:The_site_of_Ed-Dur_today.jpg).


**Level idea: "Where Horses Sleep".**
- *Layout:* a gravel plain under the jagged limestone ridge of Jebel Faya, with Mleiha town, its fort, a mint workshop, the round Bronze Age tomb, and a cemetery where horse graves are marked by stone circles.
- *Mood:* night: the horse graves are a ghost story. The rider who loses their horse in the game can find its "spirit" here, a free re-summon.
- *Quests:*
  - "Coins of Abi'el": the mint's dies are stolen. Find them in a raider camp in the ridge's caves.
  - "The last ride": an old warrior wants to be buried with his horse. Escort them to the cemetery, then protect the grave from robbers.
- *Ed-Dur:* a short coastal leg with the Shamash temple. A light puzzle: at sunrise a beam through the temple door lights the altar.
- *Enemies:* tomb robbers, desert foxes and hyenas, raiders from the ridge.
- *Traversal:* Jebel Faya's limestone fins are a ridge route; the fort's round towers.

**Blender notes.**
- *Pieces:* `round_tower()` (from Dumat). An Umm an-Nar tomb is a ring wall of dressed stone with a doorway and a relief band. The ridge is a sharp `cliff` chain in `GREY_BANDS`.
- *Horse graves:* stone circles of `rock()`.
- *Ed-Dur:* small sand dunes with `shrub`, a lagoon, and a temple as a square stone room on a platform.

---

# Part V: Legends

## 28. Iram of the Pillars and the people of 'Ad

**What it is.** In Arab tradition, 'Ad were a mighty ancient people of southern Arabia, in al-Ahqaf ("the curving sand dunes"). They built *Iram dhat al-'Imad*, "Iram of the Pillars". The Qur'an tells how the prophet Hud warned them and how a roaring wind destroyed them. Later storytellers (Wahb ibn Munabbih, the *Thousand and One Nights*) added King Shaddad ibn 'Ad, who built Iram as a garden of gold, silver and gems to rival paradise, and saw it destroyed before he could enter it. The 1992 Shisr "Ubar" discovery made the legend famous again (section 23) ([Wikipedia: Iram of the Pillars](https://en.wikipedia.org/wiki/Iram_of_the_Pillars); ['Ad](https://en.wikipedia.org/wiki/%CA%BFAd); [Ubar](https://en.wikipedia.org/wiki/Ubar)).

![The 1992 space-radar image used to find old caravan tracks converging on Shisr (NASA, public domain)](images/28_iram_of_the_pillars_and_the_peop/01_the_1992_space_radar_image_used_to_find_old_cara.gif)
*The 1992 space-radar image used to find old caravan tracks converging on Shisr (NASA, public domain).* Credit: NASA, Public domain, [Commons file page](https://commons.wikimedia.org/wiki/File:SIR-C_X-SAR_Ubar,_Oman.gif).

![The Shisr ruins over the sinkhole](images/28_iram_of_the_pillars_and_the_peop/02_the_shisr_ruins_over_the_sinkhole.jpg)
*The Shisr ruins over the sinkhole.* Credit: 9591353082 (English Wikipedia), CC BY 2.5, [Commons file page](https://commons.wikimedia.org/wiki/File:Shisr_%28Ubar%299.jpg).

![Al-Ahqaf, the curving dunes, where the legend places 'Ad](images/28_iram_of_the_pillars_and_the_peop/03_al_ahqaf_the_curving_dunes_where_the_legend_plac.jpg)
*Al-Ahqaf, the "curving dunes", where the legend places 'Ad.* Credit: NASA/GSFC/METI/ERSDAC/JAROS, and U.S./Japan ASTER Science Team, Public domain, [Commons file page](https://commons.wikimedia.org/wiki/File:Rub%27_al_Khali_%28Arabian_Empty_Quarter%29_sand_dunes_imaged_by_Terra_%28EOS_AM-1%29.jpg).


**Level idea: "Iram of the Pillars" (the secret endgame map).** The brainstorm already plans this (§5.4: a sandstorm-only exit, sunken colonnades, sinking sand, the Jinn of the sandstorm boss). The real material adds:
- *Two layers.* The surface is a field of column tops sticking out of the dunes: the platforming route. Below it, reached through Shisr's sinkhole, is Shaddad's garden: halls of gold-tiled pillars, dry fountains, and trees of metal with gem fruit. It is beautiful and dead.
- *The story through ruins only.* No prophet appears. Pillars carry inscriptions in an invented "elder" script that the player slowly learns to read. The text tells of a warning ignored, a wind and a garden never entered.
- *Wind as the enemy.* The boss is the wind itself; the jinn of the sandstorm is its face. Pillar shelters break line of sight from the gusts.
- *Reward.* There is nothing to take that doesn't crumble, except one item: a plain clay water jar from a servant's room. Its lore says the servants were the ones who shared water. It is the best waterskin upgrade in the game.

**Blender notes.**
- *Columns:* reuse `column()` and `square_pillar()` at 1.5× scale, sunk at random depths. Use a sinking-sand material for pits (a darker, smoother `#c98f55`).
- *The gold hall:* gold `L.GOLD` (Brass `#c99a3a`) with low roughness and lapis `#2a4b8f` inlays.
- *Gem trees:* `acacia()` with emissive-free coloured box fruit.
- *Sky:* storm fog (`fog.near` 15, brown).
- *Colliders:* column tops are `pillar` boxes at varied heights within the jump budget (1.0–1.35 m steps, 2–2.7 m gaps), with 3.2 m double-jump secrets.

## 29. Thamud, al-Hijr and the she-camel

**What it is.**
- *History:* Thamud is one of the oldest named Arab peoples. Sargon II of Assyria lists them in 715 BCE, and classical writers (Diodorus, Ptolemy, Pliny) place them in north-west Arabia. At **Ruwafa**, about 200 km north-west of Hegra, a temple of about 165–169 CE carries a bilingual Greek and Nabataean inscription saying the "Thamud of Robathu" built it for the emperors Marcus Aurelius and Lucius Verus ([Wikipedia: Thamud](https://en.wikipedia.org/wiki/Thamud); [Ruwafa inscriptions](https://en.wikipedia.org/wiki/Ruwafa_inscriptions)).
- *Scripts:* "Thamudic" is also the old label for thousands of graffiti in Ancient North Arabian scripts across the peninsula (now split into Hismaic, Taymanitic, Dadanitic and others).
- *Tradition:* Islamic tradition places Thamud at al-Hijr (Hegra) and remembers them as carvers of houses in the rocks. Their prophet Salih brought them a she-camel as a sign, to share their water on alternate days. They hamstrung her and were destroyed. Because of this, people long avoided the Hegra tombs as a cursed place.

![Thamudic graffiti at Jubbah](images/29_thamud_al_hijr_and_the_she_camel/01_thamudic_graffiti_at_jubbah.jpg)
*"Thamudic" graffiti at Jubbah.* Credit: Richard Mortel, CC BY 2.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Thamudic_inscription_at_Jubbah_Rock_Art_Site_%281%29.jpg).

![Julius Euting's 1880s drawings of Nabataean tomb inscriptions at Hegra (public domain)](images/29_thamud_al_hijr_and_the_she_camel/02_julius_euting_s_1880s_drawings_of_nabataean_tomb.jpg)
*Julius Euting's 1880s drawings of Nabataean tomb inscriptions at Hegra (public domain).* Credit: Julius Euting, Public domain, [Commons file page](https://commons.wikimedia.org/wiki/File:Euting_Nabataean_inscriptions_from_Hegra,_Al-Ula_20.jpg).

![Qasr al-Farid at Hegra. Later tradition made Hegra's tombs the houses in the rocks of Thamud](images/29_thamud_al_hijr_and_the_she_camel/03_qasr_al_farid_at_hegra_later_tradition_made_hegr.jpg)
*Qasr al-Farid at Hegra. Later tradition made Hegra's tombs the "houses in the rocks" of Thamud.* Credit: Ahmad AlHasanat, CC BY-SA 4.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Mada%27in_Saleh_2017.jpg).


**Level idea: woven through existing maps, not its own map.** The game's Hegra already has the setting.
- *Never show Salih or the miracle.* Do not show the camel coming from the rock, and do not stage its killing.
- *Use the theme:* sharing water. A recurring quest-line can run across the oasis, Tayma and Hegra: "the well's other day". A herd and a town must share one well on alternate days, and the player keeps the peace or breaks it. Breaking it has consequences (the well dries).
- *Ruwafa side map:* a small, real-history map. A lone Thamudic-Roman temple in the Hisma sand plains, where a Thamudic auxiliary troop (camel-mounted Roman allies) asks for help. It is a good place to show Roman influence and the Greek/Nabataean bilingual inscription as a lore stone.
- *A legend NPC:* an old guide refuses to sleep in Hegra's tombs "because of the people of the rock". That gives the flavour without retelling scripture.

**Blender notes.** Ruwafa is a small temple of square-cut sandstone with a lintel inscription band and two engaged columns on a Hisma sand plain: domed sandstone jebels as in Wadi Rum (section 3), in `ROSE_BANDS`.

## 30. The jinn: Wadi 'Abqar and Wadi al-Jinn

**What it is.**
- *'Abqar:* pre-Islamic Arabs spoke of 'Abqar, a land or valley of the jinn, placed variously in Yemen or the Najd. Anything uncannily excellent was *'abqari*, "from 'Abqar", which is the source of the modern Arabic word for genius. Poets said a jinn companion (*tabi'*, *ra'i*) gave them their verses; the poet al-A'sha called his Mis-hal.
- *Other beings:* the *ghul* (a shape-shifter of the empty desert), the *si'lat* (a sorceress-ghul) and the *hatif* (an unseen voice).
- *Wadi al-Jinn:* a modern piece of folklore. Wadi al-Baida, about 30 km north-west of Medina, is a "gravity hill" where cars seem to roll uphill; the effect is an optical illusion of the slope.

Sources: [Wikipedia: Jinn](https://en.wikipedia.org/wiki/Jinn); [Ghoul](https://en.wikipedia.org/wiki/Ghoul); [Yosefi, "The origins of the traditional approach towards the jinn of poetic inspiration", PSAS 2019](https://archaeopresspublishing.com/ojs/index.php/PSAS/article/view/353); [Atlas Obscura: Wadi e Jinn](https://www.atlasobscura.com/places/wadi-e-jinn); [Arab News](https://www.arabnews.com/node/1221666).

![Wadi al-Disah (Tabuk)](images/30_the_jinn_wadi_abqar_and_wadi_al/01_wadi_al_disah_tabuk_a_palm_filled_canyon_between.jpg)
*Wadi al-Disah (Tabuk): a palm-filled canyon between sandstone towers. Good reference for a hidden jinn valley.* Credit: Clemens Schmillen, CC BY-SA 4.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Wadi_al-Disah1.jpg).

![Wadi al-Disah: a Nabataean façade cut in the canyon wall](images/30_the_jinn_wadi_abqar_and_wadi_al/02_wadi_al_disah_a_nabataean_fa_ade_cut_in_the_cany.jpg)
*Wadi al-Disah: a Nabataean façade cut in the canyon wall.* Credit: Clemens Schmillen, CC BY-SA 4.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Wadi_al-Disah2,_Nabataean_tomb_facade.jpg).

![Wadi al-Jinn (al-Baida) near Medina, the gravity hill: bare rocky hills](images/30_the_jinn_wadi_abqar_and_wadi_al/03_wadi_al_jinn_al_baida_near_medina_the_gravity_hi.jpg)
*Wadi al-Jinn (al-Baida) near Medina, the "gravity hill": bare rocky hills.* Credit: khadim-un-nabi Rao, CC BY-SA 3.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Wadi_Jinn_29_K.m_from_Madina_-_panoramio.jpg).


**Level idea: "'Abqar, Valley of the Poets' Jinn".** A secret map unlocked by winning the Ukaz poetry chain (section 11).
- *Layout:* a deep, green canyon (Wadi al-Disah as reference) with springs, palms and tall sandstone towers. Everything is a little *wrong*.
- *Mechanics:*
  - *Water runs uphill* (the gravity-hill idea). Some slopes push the player upward, which is a traversal puzzle: you can "fall up" ramps to reach ledges.
  - *Hatif voices* give directions that are true once and lies the second time.
  - *Jinn companions:* each map's best poet NPC has a jinn. Here you meet them as glowing, faceless figures. They test you with riddles and reward you with a verse line for the final Ukaz duel.
- *Enemies:* the si'lat (a ghul variant that mimics a friendly NPC's voice); dust devils; the ghul mother (brainstorm boss 5) can live here.
- *Mood:* a permanent moonlit dusk with green-blue light and no sun. Nights are louder than days.
- *Secrets:* a pool that reflects a different map (a fast-travel shortcut).

**Blender notes.** Reuse `canyon()` and `cliff` (`ROSE_BANDS`), `palm()` and water. The "uphill" slopes are ordinary heightfield ramps tagged in level.json (a new `zones: [{type: "updraft", ...}]` entry for code). Jinn figures are the person rig with a single emissive material and no accessories. Do the colour grading in the time-of-day system (lock the `sky.ts` time to dusk with a green tint).

---

# Cultural details worth getting right

These are short notes for art, dialogue and localisation, and they apply to every map above.

**Peoples and dress**
- *Men in the south* (Saba, Qataban, Hadramawt, Himyar): statues show long hair or ringlets, a bare chest or short tunic, a wrapped kilt to the knee and a dagger in the belt. Funerary heads are clean-shaven or have a short beard.
- *Northerners* (Nabataeans, Lihyanites): Lihyanite royal statues wear a short kilt and stand stiffly, arms at the sides. Nabataean men wear a long tunic and a mantle.
- *Bedouin:* a wrapped head-cloth (keffiyeh-like), a long shirt, a cloak (*'aba'a*) of camel or goat hair, and sandals. Women's veiling varied by region and class; many depictions show a head-cloth or mantle rather than a face veil.
- *Arms:* a straight sword (Indian steel, *hindi*, was prized and named in the poems), a spear, a bow, a sling, a round leather or wicker shield, mail shirts for the rich. Horses had no stirrups until very late. Riders of the period sat on a saddle cloth or pad.
- *Colour:* indigo blue, madder red, saffron and ochre yellow, undyed white and brown wool. Striped textiles (*burud* of Yemen) were famous.

**Scripts** (use the right one for each place's lore stones)

| Script | Where | Notes |
|---|---|---|
| Ancient South Arabian (*Musnad*) | Yemen, Najran, Hima, Qaryat al-Faw; the Gulf as Hasaitic | Angular, monumental, written in bands; boustrophedon in early texts. Use it for every Yemeni map. |
| Dadanitic | Dadan / AlUla | A north Arabian cousin of Musnad, used for the Lihyanite kingdom. |
| Taymanitic and Imperial Aramaic | Tayma | Aramaic was used for official stelae under Babylon and Persia. |
| Nabataean (Aramaic) | Petra, Hegra, Wadi Rum | Cursive, with ligatures; the ancestor of the Arabic script. |
| "Thamudic", Hismaic, Safaitic | Everywhere in the deserts | Graffiti scratched by herders: names, prayers, complaints. Perfect for collectible lore. |
| Greek | Ruwafa, Hima, coins | Used next to Nabataean at Ruwafa, and on coins imitating Alexander's in the Gulf. |
| Cuneiform | Dilmun, Tayma (Nabonidus) | Only for Bronze Age or Babylonian lore. |

Don't put modern Arabic script on ancient objects. The *Mu'allaqat* were oral poetry; show poets reciting, not reading from scrolls.

![A Sabaean inscription (2nd c. CE)](images/99_cultural_details/01_a_sabaean_inscription_2nd_c_ce_musnad_letters_in.jpg)
*A Sabaean inscription (2nd c. CE): Musnad letters in raised bands. This is the look for South Arabian lore stones.* Credit: Osama Shukir Muhammed Amin FRCP(Glasg), CC BY-SA 4.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Slab_with_an_inscription_about_the_political_activities_of_the_kings_of_Sheba._Ancient_South_Arabian_script_appears._From_Yemen,_2nd_century_CE._Ancient_Orient_Museum,_Istanbul.jpg).

![The Nabataean alphabet set out on a tablet](images/99_cultural_details/02_the_nabataean_alphabet_set_out_on_a_tablet.jpg)
*The Nabataean alphabet set out on a tablet.* Credit: Nesnad, CC BY 4.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Nabataean_alphabet_tablet_-_2018430.jpg).


**Gods** (by region; give each map its own pantheon)
- *Saba:* Almaqah (the national god; ibex and bull symbols), 'Athtar (Venus, common to all the south), Dhat-Himyam, Dhat-Badan.
- *Ma'in:* Wadd. *Qataban:* 'Amm. *Hadramawt:* Sayin. *Himyar (later):* Rahmanan, a monotheist god, by the 4th–6th c.
- *Nabataeans:* Dushara (often a betyl stone), al-Kutba (writing), Allat, al-Uzza, Manawat, Hubal.
- *Dadan and Lihyan:* Dhu Ghabat. *Tayma:* Salm of Mahram, Shingala, Ashira.
- *Qaryat al-Faw:* Kahl, Shams. *Hijaz:* al-Lat (Ta'if), al-Uzza (Nakhla), Manat (Qudayd), Hubal (Mecca).
- *Dilmun:* Inzak and his consort Meskilak; Enki in the Sumerian myths about Dilmun. *Ed-Dur:* Shamash.
- *Practices:* incense burning on small cubical altars with feet; betyls in niches; animal sacrifice at high places; ritual banquets (*marzeah*); pilgrimage in the sacred months; divination with arrows (*azlam*); the soothsayer (*kahin*) who speaks in rhymed prose (*saj'*).

![A South Arabian incense burner (5th–4th c. BCE, British Museum) with the names of the incenses carved on it. A must-have prop for every shrine](images/99_cultural_details/03_a_south_arabian_incense_burner_5th_4th_c_bce_bri.jpg)
*A South Arabian incense burner (5th–4th c. BCE, British Museum) with the names of the incenses carved on it. A must-have prop for every shrine.* Credit: Osama Shukir Muhammed Amin FRCP(Glasg), CC BY-SA 4.0, [Commons file page](https://commons.wikimedia.org/wiki/File:Incense_burner,_from_Yemen,_5th-4th_century_BCE._An_ancient_South_Arabian_inscription_about_the_names_of_incense._British_Museum.jpg).

![An ibex frieze (Walters Art Museum). Rows of ibex heads crown South Arabian temples](images/99_cultural_details/04_an_ibex_frieze_walters_art_museum_rows_of_ibex_h.jpg)
*An ibex frieze (Walters Art Museum). Rows of ibex heads crown South Arabian temples: an easy repeating box decal.* Credit: Anonymous (South Arabia), Public domain, [Commons file page](https://commons.wikimedia.org/wiki/File:South_Arabian_-_Fragment_of_an_Ibex_Frieze_-_Walters_2137.jpg).


**Trade goods** (for shops, fetch quests and caravan cargo)
- *Frankincense and myrrh:* from Dhofar, Hadramawt and Somalia. Frankincense is pale amber "tears"; myrrh is darker red-brown.
- *From India via the Gulf and Qana:* pepper, cinnamon and cassia (Indian or East African, passed off by Arab traders as Arabian), Indian steel, cotton and pearls.
- *Local goods:* dates, wine and raisins from Ta'if, horses (mainly from the north and centre), camels, leather (Ta'if was famous for it), Yemeni striped cloth, gold from the Hijaz mines (Mahd al-Dhahab), copper from Magan (Oman), salt, and dragon's blood and aloe from Socotra.
- *Money:* barter, with silver coins. Sabaean "owl" coins imitated Athens; Gerrha and Mleiha minted Alexander types. Rome brought denarii.

**Animals** (what fits which map)
- *Domestic:* the dromedary (the centre of everything); the Arabian horse, rare and precious, used for war raids, not caravans; donkeys; sheep and goats; the saluki (a sight-hound for hunting) and guard dogs; falcons.
- *Wild:* Arabian oryx and gazelles (open sands); Nubian ibex (cliffs and mountains; a sacred animal in the south); ostrich (Najd; the Arabian ostrich died out in the 20th century); onager in the north; Arabian leopard (mountains); striped hyena; Arabian wolf; caracal; red fox and sand fox; hamadryas baboon (Hijaz and Yemen mountains).
- *The Asiatic lion* lived in northern and central Arabia in antiquity and appears in art (the lion tombs of Dadan, Allat's lion). It is right for a boss.
- *Birds:* lappet-faced and griffon vultures; ravens (an omen bird in the poems); bustards; sandgrouse (they carry water to their chicks in their breast feathers).
- *Pests:* scorpions, vipers (the horned viper buries itself in sand), camel spiders and locusts.
- *Not right:* no elephants except Abraha's (from Africa); no stirrups; no cats as pets in the desert (fine in towns); no turkeys, tomatoes, maize or chillies (New World crops).

![A South Arabian frieze: a crouching ibex beside a row of oryx heads](images/99_cultural_details/05_a_south_arabian_frieze_a_crouching_ibex_beside_a.jpg)
*A South Arabian frieze: a crouching ibex beside a row of oryx heads.* Credit: Anonymous (South Arabia), Public domain, [Commons file page](https://commons.wikimedia.org/wiki/File:South_Arabian_-_Fragment_of_a_Frieze_with_an_Ibex_and_Oryxes_-_Walters_2138.jpg).


**Architecture cheat sheet**
- *South:* fine ashlar with drafted margins; monolithic square pillars; recessed "false window" panels; ibex friezes; dentils; mudbrick tower houses with small windows and white lime-plaster tops; dams and sluices.
- *Nabataean:* façades cut into the rock with crow-step crowns or Hellenistic pediments, Nabataean "horned" capitals, betyl niches, water channels.
- *Hijaz and Najd oases:* mudbrick courtyard houses, palm-trunk beams and roofs, fortified tower farms, palm groves inside walls, wells with draw-wheel frames.
- *Gulf:* coral-stone and gypsum (later), salt blocks (Gerrha), *barasti* palm-frond huts, round Bronze Age tombs, burial mounds.
- *Nomad:* the black goat-hair tent (*bayt al-sha'r*) with a woven divider; camel saddles (the North Arabian *shadad* saddle frame from the late 1st millennium BCE).

**Time and calendar**
- *Seasons and stars:* the year was read by the rising and setting of star groups (*anwa'*), such as al-Thurayya (the Pleiades) and Suhayl (Canopus).
- *Sacred months:* there were four holy months of truce (Rajab, Dhu al-Qa'da, Dhu al-Hijja, Muharram), and the fairs fell in them.
- *Dates in text:* many South Arabian inscriptions date by the Himyarite era (from 115/110 BCE).

**Names** (for NPCs; take them from inscriptions, not from later Islamic history)
- *South Arabian:* Karib'il, Yatha'amar, Sumhu'alay, Ilsharah, Wahab'il, Dhamar'ali (kings' names; check DASI for commoners and women).
- *Nabataean:* 'Abd-'Obodat, Hu'aynu, Kamkam, Shullay, Wushuh.
- *Classical pre-Islamic Arabic* (poets' world): Ka'b, Zuhayr, Labid, 'Amr, Harith, Tarafa, Hind, Salma, Layla, 'Abla, Asma'.

---

## Sources (general)

- [Wikipedia: Pre-Islamic Arabia](https://en.wikipedia.org/wiki/Pre-Islamic_Arabia) and [Religion in pre-Islamic Arabia](https://en.wikipedia.org/wiki/Religion_in_pre-Islamic_Arabia): good overviews with references.
- [Wikipedia: Incense trade route](https://en.wikipedia.org/wiki/Incense_trade_route) and [Ancient South Arabian script](https://en.wikipedia.org/wiki/Ancient_South_Arabian_script).
- *Roads of Arabia: Archaeology and History of the Kingdom of Saudi Arabia* (exhibition catalogue, Louvre / Sackler / Pergamon, 2010–2017): many of the museum photos above come from this touring show.
- *Proceedings of the Seminar for Arabian Studies* (Archaeopress, [open-access journal](https://archaeopresspublishing.com/ojs/index.php/PSAS)): excavation reports for most sites here.
- [OCIANA, Online Corpus of the Inscriptions of Ancient North Arabia](https://ociana.osu.edu/): real Safaitic, Hismaic, Dadanitic and Taymanitic texts for lore stones.
- [DASI, Digital Archive for the Study of pre-Islamic Arabian Inscriptions](http://dasi.cnr.it/): real Sabaean, Minaean, Qatabanic and Hadramitic inscriptions in translation.
- UNESCO World Heritage pages linked in each section.
