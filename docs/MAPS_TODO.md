# Big research maps: status and TODO plan

This document is for whoever builds the next maps, whether that's a Blender session or a person. It's based on [`docs/research/pre_islamic_levels.md`](research/pre_islamic_levels.md): each section number below points to the matching research entry, which has the history, the reference photos and Blender notes.

**State:** 7 big maps are built (batch 2). The rest are planned below and paused until someone picks them up.

---

## 1. Done (batch 2, all live or integrated)

| Map | Size | Culture | Commit | Links to |
|---|---|---|---|---|
| `jabal_ithlib`: the sacred mountain (§1) | 600 m | nabataean | 0ab8117 → d709177 | hegra, ukaz, tayma |
| `marib`: the Great Dam of Saba (§16) | 1000 × 800 m | sabaean | 0ab8117 → e3c6ecf | caravanserai, ukaz, qaryat_al_faw |
| `marib_breach`: after the flood of al-'Arim (§16) | same | sabaean | `variant_of: marib` | (same as marib) |
| `ukaz`: the poets' fair (§11) | 800 m | hijazi | 6eb4eeb | jabal_ithlib, marib |
| `tayma`: the walled oasis (§4) | 640 m | hijazi | fcbbae8 | jabal_ithlib, dumat_al_jandal |
| `dumat_al_jandal`: city of queens (§6) | 700 m | bedouin | fcbbae8 | tayma |
| `qaryat_al_faw`: gate of the Empty Quarter (§9) | 800 m | kindite | d709177 | marib |

All seven were re-exported to the game's performance spec:
- 120–125 m tiles
- props instanced map-wide (`Props_all`)
- town tiles baked to vertex colours (≤ 3 draws per tile)

That totals 41–93 draws per whole map (e3c6ecf).

---

## 2. Rules every new map must follow

These are agreed with the game session. Breaking them breaks the game or the old maps.

1. **Never touch the 8 original maps** (oasis, hegra, caravanserai, wadi, raider_fort, rooftops, cliffs, ruined_temple).
   - The only allowed change is adding an exit, with its cairn and `from` arrival spawn, appended after the map's dressing pass so nothing else moves.
   - Export new maps with `maps=<new names>` only.
   - Linking from the batch-2 maps is free.
2. **Schema.** Each level.json must have:
   - `title_ar`, plus `label_ar` on exits and `landmark_names` {en, ar}. Use classical Arabic without harakat, except in poetry.
   - `culture`, chosen from: hijazi, nabataean, lihyanite, thamudic, kindite, sabaean, minaean, qatabanian, hadrami, himyarite, gulf, bedouin.
   - `"batch": 2` in maps.json.
3. **Perf spec.** These are the defaults for any `MapDef` with `tile` set:
   - Playable bounds of 1000 × 1000 m at most.
   - A 2 m heightfield, or 4 m above 800 m.
   - `tile = 120–125`, `instanced = True` (props via `inst.py`).
   - The bake happens automatically.
   - At most ~3000 colliders, ~120 NPCs and ~80 enemies.
4. **Walkable tops are exact colliders.** `pos.y + half.y` must equal the visible top. Keep to the jump budget: required moves at most 1.35 m up and 2.7 m across; secrets 2.6–3.2 m up (double jump).
5. **Arrivals face into the map.** Use `face(x, y, cx, cy)`. The export prints `FACING WARN` otherwise.
6. **Automatic checks on export:**
   - `enforce_spacing()`: vultures at least 60 m and other foes at least 35 m from arrivals; ground foes out of colliders.
   - `fix_coplanar()`.
   - `bake_flat_materials()`, which keeps LampFlame, Fire, BonfireFlame, Water, WaterDeep and Lime as their own materials.
7. **Cliffs:** the heightfield rise must sit *inside* the strata columns.
   - Pass `bottom=-2` to `strata_wall`.
   - Make the columns deep enough (10 m on a 4 m grid) that the diagonal terrain triangles don't poke through.
   - Push the rise 3–8 m behind the face.
8. **Sensitivity** (from the research doc):
   - No prophet is ever shown (Hud, Salih).
   - No Mecca or Kaaba map.
   - The goddess shrines are living places of worship, not targets.
   - The Najran trench is a memorial and an escape story, never a fight.
   - Leave out poets who later became Companions (Labid, Hassan, al-Khansa).

**Tools:**
- `tools/blender/big_maps.py`: map classes; register a new one in the tuple at the bottom.
- `kit_sites.py`: site pieces. `inst.py`: instanced props.
- Preview with `preview_level.py -- map=<name> [at=<landmark>] [scale=] [yaw=]`.
- Export with `export_assets.py -- only=maps maps=<name>[,linked maps]`.

---

## 3. TODO: next maps, in build order

Each entry lists the proposed map name, titles, size and culture, where it links, the layout, what's new versus reused, and the quest hooks (markers with ids).

### 3.1 `dhofar`: the frankincense coast (§23), **next**
- **Titles:** "Dhofar: land of frankincense" / "ظفار: أرض اللبان".
- **Size and culture:** 900 × 800 m, culture hadrami, heightfield step 4.
- **Links:** east edge of `qaryat_al_faw`, or a south exit of `marib`.
- **Layout:**
  - The first green palette: monsoon (*khareef*) mist with green escarpment slopes.
  - Wadi Dawkah's frankincense grove: instanced `frankincense_tree`, already in `kit_sites`.
  - Sumhuram, a walled port on a creek: a `tower_wall` ring, a gate, a temple of Sin, a quay and warehouses.
  - A sea edge: a water plane at the south boundary with beach colours.
  - Shisr ("Ubar"): an oasis fort half-collapsed into a sinkhole. Carve a heightfield crater and tilt `pbox` ruins into it.
- **New builders:** `ship()` (dhow-style hull, mast, lateen sail; static at the quay), `quay()`, `incense_tapper` props (scraped bark and resin lumps), a coastal palette and a mist fog colour.
- **Hooks:**
  - The incense economy's quest givers: an official (port master `sumhuram_port_master`), a caravaneer (`dhofar_incense_caravan`) and farmers who tap the trees.
  - pickups `frankincense_resin_1..N`.
  - The sinkhole-fort secret: a chest `shisr_well`.
- **Enemies:** pirates on the creek, and raiders on the Shisr track.

### 3.2 The Yemeni tower-wall cities (§18–20): one shared kit, three maps
- **New family:** `tower_wall` exists, but add a city gate with a guardhouse, a mudbrick tower-wall with rows of slit windows, and a market-law stele.
- **`baraqish`** (§18), "Baraqish (Yathill): the towered city" / "براقش (يثل): المدينة ذات الأبراج":
  - 600 m, culture minaean.
  - A walled tell with about 50 towers: a siege level.
  - Hooks: wave_spawn siege markers, and a Minaean temple.
- **`timna`** (§19), "Timna: the Qatabanian capital" / "تمنع: عاصمة قتبان":
  - 700 m, culture qatabanian.
  - A paved mountain pass (Mablaqa) with a toll station; the market-law stele as lore.
- **`shabwa`** (§20), "Shabwa: the incense capital" / "شبوة: عاصمة البخور":
  - 800 m, culture hadrami.
  - The gate where every load is taxed (a toll official), and the burned palace.
- **Links:** marib (east) ↔ baraqish ↔ timna ↔ shabwa ↔ dhofar.

### 3.3 `najran` and `hima` (§14–15)
- **`najran`**, "Najran and al-Ukhdud" / "نجران والأخدود":
  - 700 m, culture himyarite.
  - A South Arabian walled town (reuse the tower-wall kit).
  - **The trench is a memorial:** walkable, with lamps, flowers and a mourner NPC. No combat inside a 60 m radius; use a `truce` zone. It's also an escape story.
- **`hima`**, "Hima: the wells of the crossroads" / "حمى: آبار الملتقى":
  - 600 m, culture bedouin.
  - A well field (`K.well`), with rock-art boulders as collectible lore (role `lore`, ids `hima_rock_1..N`), and an army's camp.
  - New builder: a `rock_art_boulder()` with box-decal camel, ibex and horseman figures.
- **Links:** najran ↔ marib (north-east), hima ↔ najran.

### 3.4 The Gulf arc (§25–27)
- **New:** a `mound_field()` terrain function (hundreds of burial tumuli), a coastal and lagoon palette, and `salt_house()`.
- **`gerrha`**, "Gerrha and Thaj" / "الجرهاء وثاج":
  - 800 m, culture gulf.
  - The salt-built trading city and the walled town of Thaj. Secret: the gold-masked girl's tomb.
- **`dilmun`**, "Dilmun: the sea of mounds" / "دلمون: بحر التلال":
  - 900 m, culture gulf.
  - The tumulus field, the Barbar spring temple, and the plant of youth (the Gilgamesh epic) as an underwater-spring pickup.
- **`mleiha`**, "Mleiha and Ed-Dur" / "مليحة والدور":
  - 700 m, culture gulf.
  - Horse burials with riders, a mint, and the sun-god temple by the lagoon.
- **Links:** qaryat_al_faw (east, across the sands) ↔ gerrha ↔ dilmun, and gerrha ↔ mleiha.

### 3.5 Legend maps, as endgame and secrets (§28, §30)
- **`iram`**, "Iram of the Pillars" / "إرم ذات العماد":
  - 800 m, culture bedouin, `secret: true`.
  - A buried city of pillars (reuse `monolith`) half-drowned in star dunes. It needs a sandstorm weather flag in level.json (`weather: "sandstorm"`).
  - Never show Hud: tell the story through ruins.
- **`wadi_abqar`**, "Wadi 'Abqar: valley of the poets' jinn" / "وادي عبقر":
  - 600 m, culture bedouin, secret.
  - Water that runs uphill (a game-side effect), and the jinn boss.
- Both are entered from a hidden exit (`exit.secret: true`) in qaryat_al_faw's dunes, or from ukaz's lost-ode tor.

### 3.6 Side maps (small, any order)
- **Petra (§3), `petra`:** the Monastery climb and water channels. Reuse the Khazneh facade and canyon. Culture nabataean.
- **Khaybar (§5), `khaybar`:** black lava fields around a green oasis, and forts on basalt spurs. Needs a dark basalt palette.
- **Rajajil (§7), `rajajil`:** a field of leaning stone pillars as a moonlit puzzle. Reuse `monolith` with tilt.
- **Ha'il, Jubbah and Shuwaymis (§8), `hail`:** rock-art cliffs and a lost lake bed. Reuse the rock-art boulders.
- **Al-Yamama (§10), `yamama`:** Zarqa al-Yamama, the blue-eyed seer, on a watchtower. An army disguised as walking trees (a scripted event).
- **Ta'if, Nakhla and Qudayd (§12), `taif`, `nakhla`, `qudayd`:** al-Lat's white rock, al-Uzza's three trees, Manat's black stone by the sea. **Living shrines with priests and pilgrims; no destruction quests.**
- **Sirwah (§17), `sirwah`:** Almaqah's temple and the victory stele. Reuse the Marib ashlar kit.
- **Zafar (§21), `zafar`:** highland terraces and caves; the legend of Ghumdan. Reuse the wadi terraces.
- **Qana and Socotra (§22), `qana`, `socotra`:** the Crow's Castle above the port. `dragons_blood_tree` is already in `kit_sites`. A sailors' graffiti cave.
- **The Empty Quarter (§24), `rub_al_khali`:** a 1000 m traversal map of star dunes and salt flats linking qaryat_al_faw to dhofar and gerrha. Mostly heightfield and instancing; very cheap.

---

## 4. Open asset items for the game (not maps)
- Enemy kinds the maps already place but which have no model yet: `scorpion`, `viper`, `ghul` (boss). The Ukaz `champion` uses the person rig (Lamellar, Helmet, Cloak) and needs no model.
  - Variants handled in game code: palmyrene, himyar, camel, jackal, hyena.
  - Done: `rat`.
- In the game (3b69568), scorpion and viper are procedural box placeholders and the ghul is a person-rig boss. Replacements the game session asked for (optional, since the placeholders work):
  - **`characters/scorpion.glb`:** a desert scorpion about 1.1 m long, flat shell, pincers forward, tail curled over the back with the sting.
    - Origin at bottom centre, facing +Z; D_Coat material optional.
    - Clips: Idle, Walk, Run, Growl (tail raised and trembling, claws open: the tell), Lunge (tail stings forward, about 0.4 s), Hit, Death.
    - Loads like `rat.glb` at native scale, so build it with `rigs.py` like `build_rat`.
  - **`characters/viper.glb`:** a horned viper (Cerastes) about 0.9 m long, sandy with bands, a horn over each eye.
    - Idle is a coil lying in the sand.
    - Clips: Idle, Walk (sidewinding), Growl (front third reared in an S), Lunge (strike, about 0.3 s), Hit, Death.
  - **The ghul:** either person accessories or a `characters/ghul.glb` on the person skeleton, so Attack, Attack2 and HeavyAttack still play.
    - Accessories: `GhulHead` (gaunt long face, wild hair), donkey-hoof feet (the folklore detail), ragged shroud strips.
    - About 2.3 m tall at scale 1, ashen grey.
    - Eyes as their own mesh or material named **`GhulEyes`**, so the game can make them glow.
- Possible later art: a sandstorm skybox or particle look for Iram; a monsoon-mist skybox for Dhofar.
