# Proposal: the vertical slice

A playable, testable slice of the bigger game: one new home map, two story chapters on existing maps, a settlement that grows twice, seven short cutscenes, one real choice per chapter, and the engine, art and writing each of those needs.

Written 2026-10-21. Revised the same day from a full-game proposal down to a slice. The full-game ideas are kept in the last section as a backlog, not a plan.

**What a vertical slice is here.** One continuous run of about 25 minutes, at the quality the finished game should have, cutting across every discipline: the home map, combat, platforming, dialogue choices, cutscenes, the settlement growing, Arabic and English, sound. Small enough to finish, representative enough to judge. It is for us, not the public. The consistent advice in the sources is to cut scope before quality, and to keep every "one more system" in the backlog.

---

## 1. The slice in one paragraph

You wake in a tent in a small basin oasis ringed by mountains, with your wife and a goat. She wants a well and a wall; you want a name. You climb the lookout above the tent and see the smoke of the town beyond the pass. You ride out. At the town gate a stranger is being turned away; he asks for your protection and follows you home. His pursuers arrive at the pass that night. You decide what he is worth. Later, at the same gate, a captain hands you a sealed letter for the king's man at the caravanserai down the road, and a poet with his own letter rides with you. At the cistern a boy reads letters for a copper. You decide whether yours is opened. You come home each time to a camp that has grown, a wife with opinions, and in the end a guest at your fire and a poem with your name in it.

Two chapters, two choices, four outcomes, one home that grows from a tent to a clan camp.

---

## 2. Structure, and how open-world games do it

What the sources agree on, applied to a small world:

- **Hub and spoke.** The home map is the hub. Every chapter starts by riding out and ends by riding back. The existing maps are the spokes; the slice uses three of them.
- **A golden path, not a checklist.** The chapters are the main road. Tasks (the current small quests) sit beside it, on roads the player already travels, so wandering off pays and nothing has to be hunted for.
- **Diegetic breadcrumbs, markers only at the start.** Smoke on the horizon, a figure at the gate, a poet at the cairn. The giver and the first step get a marker; the middle of a chapter is found by playing.
- **Strands, not one-offs.** Ghost of Tsushima's best side content is the character strands, several short tales about one person. Our two chapters are strands: each named character comes back at the fire.
- **One kind of progress.** The common complaint about open worlds is that main and side feel like two games. Here both feed the same two numbers, Gold and Name, and both show up at home.

Sources at the end.

---

## 3. The home map

A new map, `home` (title "The home oasis" / "واحة الدار"). Isolated, small, no town, with the elevations the platforming needs. It replaces the current start in the oasis town.

**Layout** (all distances are for the level kit; the art list in section 8 has the full spec):

| Part | What it is | Why |
|---|---|---|
| The basin | ~320 × 320 m playable, flat sand and gravel floor with a spring pool and a few palms | the camp site; room for three settlement stages |
| The ring | mountains on all sides as backdrop and as colliders, one pass out | isolation; the pass is the only exit |
| The lookout | a ledge path up the north wall, 10 m above the floor, with steps of at most 1.3 m and gaps of at most 2.5 m | the jump tutorial in the prologue; a view of the town's smoke |
| The eagle's ledge | a shelf 2.8 m above the lookout's top | a double-jump secret (a chest and a poem) for after chapter 2 |
| The pass | a canyon to the south-east with an exit cairn to `oasis` | the only road; where the pursuers arrive in chapter 1 (a truce circle for the duel) |
| The spring | pool and reeds | the wife's first wish is a well beside it |

**Three stages** as map variants (`home`, `home_2`, `home_3`, with `variant_of: 'home'`, the mechanism Marib's flood uses):

| Stage | After | Looks like | Who's there | Gives |
|---|---|---|---|---|
| 1 Tent | start | one tent, a fire, a goat pen | the wife | the home bonfire (rest, respawn) |
| 2 Camp | chapter 1 | three tents, a well under construction, a pen with camels | the wife, a cousin who trades, a herder | shop (the cousin), waterskin +1 |
| 3 Clan camp | chapter 2 | a ring of tents, a guest tent, a stable awning, a second fire | plus a stable hand, a guest (section 5.4) | the horse kept at home; the guest tent |

Stage is a pure function of chapters finished. No management. The wife's wish list (section 4.2) buys the well and the wall early for gold, which moves the look one step ahead of the stage, so there is something visible to spend on.

**Arrival at home** is always through the pass, so the growth shot (section 6, cutscene 6) always has the same framing: ride in, the camp below, the wife walking up.

---

## 4. The people at home

### 4.1 The wife

The game's narrator of progress. Named (al-Aghani has plenty of names; the user picks). Competent, sharp, right about half the time. She has:

- a line set per stage (what changed);
- a line set per chapter outcome (what she thinks of what you did, said on the next return);
- the wish list (4.2);
- the prologue and the two homecoming cutscenes.

About 40 lines in the slice. Her lines are where the money-versus-name argument lives; nothing else in the game argues it.

### 4.2 The wish list

A menu at the fire with four items in the slice: a well (waterskin +1), a wall (shield), a second tent (flask +1), a loom (nothing, she wants it; Name +small, because a man who gives his wife a loom is talked about). Each costs gold and changes the map dressing at once (a conditional spawn, section 7.3). This is the whole "money and safety" side for now.

### 4.3 The cousin and the herder (stage 2)

The cousin is the shop (sells the iron sword, arrows, the upgrades the shop sells now). The herder is one sitter with three lines. Both are flagged spawns.

### 4.4 The guest (stage 3)

Whoever survived the slice with you: al-Harith if sheltered, else al-Mutalammis if he lived, else nobody and the tent is empty (the wife has a line about that). One scene (cutscene 7), one reward.

---

## 5. The two chapters

Lore from the standard accounts; check both against al-Aghani before writing. Step kinds in `code` are objective kinds (section 7.1).

### 5.1 Prologue: the lookout (home)

1. **Cutscene 1**, the tent at dawn: the book's voice over a black screen ("these are the akhbar as the storytellers told them"), fade in on the player waking, the wife at the fire. Four lines. She tells him to look at the road before he talks about it.
2. `visit` the lookout (`above`): the jump tutorial. Prompts for jump on the first ledge. The path needs single jumps only.
3. At the top, a hold on the view: the pass, and smoke beyond it. The town is a landmark on the horizon.
4. Back at the fire, `talk`: she gives him two waterskins and the bronze sword that was his father's. "Go then. Come back with something."
5. The pass exit opens (`Exit.when: 'quest:prologue'`).

Five minutes. Verbs taught: move, jump, talk, interact, the bonfire.

### 5.2 Chapter 1: The Guest (home, oasis, the pass)

Al-Harith ibn Zalim, an outlaw with a famous sword and a blood debt. In the standard story he killed Khalid ibn Ja'far in the king's own camp to avenge his father Zalim, and no tribe could shelter him long. The user's reading adds the tribe of women and the singer; follow the book.

| Step | Kind | What happens |
|---|---|---|
| Opener | scene witnessed | arriving at the oasis gate: **cutscene 2**, a stranger refused by the guards ("no tribe will have him"). He stands aside. A marker over him. |
| 1 | `talk` | he asks for jiwar, protection, three nights. He does not give his name. |
| 2 | `follow` | he walks home with you through the pass. Three lines on the road about kings and debts. |
| 3 | `talk` at the fire | **cutscene 3**: the second night, he gives his name. The wife, aside: "that name has riders behind it." |
| 4 | the pursuers | at the pass, a line of horsemen (conditional spawns). **Cutscene 4**: the parley with their chief. |
| 5 | `choose` | **give him up**, **pay his blood price** (`pay`: 300 gold, most of what the player has), or **refuse**. |
| 6a refuse | `duel` | the chief's champion in the truce circle at the pass; al-Harith beside you against the rest after (`kill_named` the chief). |
| 6b pay | | the riders go; the gold is gone; the wife is relieved and says so. |
| 6c give up | | he is taken, quietly. A flag. The guards at the oasis gate greet you differently from now on. |
| Outcome | | Name: refuse 3, pay 2, give up 0. Return home: **cutscene 6** (first homecoming), stage 2. |

Rewards by outcome: refuse, his gratitude and later his sword (the guest scene); pay, nothing but her approval; give up, 150 gold from the chief and a line from every Bedouin for the rest of the game.

Twelve minutes. Verbs: talk, follow, choose, duel, fight with an ally.

### 5.3 Chapter 2: The Letter (oasis, caravanserai)

Al-Mutalammis and Tarafa carried sealed letters from King Amr ibn Hind to his governor, each believing it a letter of reward. Each ordered the bearer's death. Al-Mutalammis had his read, threw it in the river and fled. Tarafa carried his.

| Step | Kind | What happens |
|---|---|---|
| Opener | giver | the gate captain (the current `letter_south` giver) hands a sealed letter for the king's man at the caravanserai. A purse on delivery. The poet at the cairn has one too and is going the same way. |
| 1 | `follow` | al-Mutalammis rides with you down the road (the caravanserai arrival). He talks about Tarafa, about kings, about not reading what is sealed. |
| 2 | `visit` the cistern | a boy reads for a copper. **Cutscene 5**: al-Mutalammis has his read. His face. He throws it in the cistern. |
| 3 | `choose` | **have yours read**, or **keep the seal**. |
| 4a opened | `kill_named` | it orders your death. He laughs: "then we are two." The king's man's riders come down the road; fight them with him. The purse is lost; the king's name is against you. |
| 4b sealed | `climb` | the king's man receives on the serai's upper terrace, reached by the old post (single jumps). You hand it over. **Cutscene 6b**: he reads, and has you seized. |
| 5b | escape | you wake stripped of your weapons on the terrace at night. Climb out over the roofs (the platform route; the white feather sits on the highest roof, which gives the double jump, and a double-jump shortcut down the far side), take your sword back from the rack at the gate, fight out. Al-Mutalammis is gone. Tarafa, you learn later, carried his. |
| Outcome | | Name: opened 2, sealed 3 (a harder road). Return home: **cutscene 6**, stage 3. A poem enters the world about you: "the one who read" or "the one who carried it". |

Eight minutes. Verbs: follow, choose, fight, climb, double jump (sealed branch; the opened branch gets the feather from the cousin's shop at stage 3 so both branches have it for the eagle's ledge).

### 5.4 Epilogue: the fire (home, stage 3)

**Cutscene 7.** The guest tent is lit. Al-Harith (sheltered) or al-Mutalammis (alive and you rode with him) sits at your fire. The wife brings the bowl. The guest recites: al-Mutalammis a verse of his own (public domain, in `poetry.ts` style), al-Harith a line about the sword, and leaves it: a unique weapon. The poem about you is recited after. The wife's last line depends on both outcomes. A card: *end of the slice*. The world stays open; the eagle's ledge chest is there for players with the double jump.

---

## 6. Cutscenes

Seven, none longer than 25 seconds, all skippable with the interact key. They use what exists: the follow camera, the dialogue box, NPC path-following, the Talk/Sit/Ride/Walk clips, fades. No new animation beyond one clip (section 8).

| # | Where | Length | Beats |
|---|---|---|---|
| 1 | home, the tent | 20 s | black, the book's voice (text), fade in, the wife at the fire, two lines each |
| 2 | oasis gate | 12 s | camera on the gate, a guard turns the stranger away, he steps aside, camera returns |
| 3 | home, the fire, night | 15 s | three seated, the name, the wife's aside |
| 4 | the pass | 20 s | riders in a line, the chief steps forward, the parley lines, then the choice prompt |
| 5 | caravanserai cistern | 15 s | the boy reads, al-Mutalammis's reaction, the letter in the water, then the choice prompt |
| 6 | home, the pass | 12 s | the homecoming shot: a long boom on the road, the camp below, the wife walking up; a different line set each time |
| 6b | serai terrace | 10 s | the king's man reads, nods to the guards, fade |
| 7 | home, the guest tent | 25 s | the guest, the bowl, the recitation, the sword laid down |

**The runner.** A small `Cutscene` class in a new `story.ts`: a list of steps run in order, each one of `camera {to, lookAt, seconds}`, `walk {npc, to}`, `play {npc, clip}`, `say {npc, key}` (the dialogue box, advanced by the player or after a timeout), `fade {out|in, seconds}`, `wait {seconds}`, `prompt {choice}`. Input is locked except interact (advance) and the skip. Letterbox bars on. NPCs in a cutscene are taken out of their state machine for its duration and put back after.

---

## 7. Engine: what the slice needs

Only what sections 3 to 6 use. The file each belongs in is named.

### 7.1 Quests (`quests.ts`)

- **`choose`**: `{ kind: 'choose'; options: { id: string; flag: string; pay?: number }[] }`. Shown as a two- or three-option prompt in the dialogue box. Writes the flag, deducts `pay` if present.
- **`follow`**: `{ kind: 'follow'; npc: string; to: { map: string; landmark: string } }`. The NPC walks with the player (reuse the convoy keeper's path following, but target the player's position with a 2 m lag), crosses maps with them, and fights beside them (`npc.ts` gets a hit arc against `Foe` and enemies take a token on the nearest hostile, player or ally). Done on reaching the landmark.
- **`kill_named`**: `{ kind: 'kill_named'; map: string; id: string }`. Hooks `onEnemyKilled` by spawn id. Uses the existing `boss` bar.
- **`duel`**: `kill_named` plus `truce: landmark`: while the duel runs, other enemies in the circle stay dormant (`setDormant`), the ally waits, the crowd faces in.
- **`climb`**: `visit` with `above: number` (the player's feet must be above that height at the landmark). No new kind.
- `QuestDef` gains `chapter?: string`, `name?: number` (Name awarded), and `requires` accepts `'flag:<name>'`. Objectives gain `when?: string[]` so a step exists only for one outcome; the runner skips steps whose condition is false.
- Rewards gain `poem?: string` and `weapon` is already there.

Not in the slice: `chase`, `carry`, `accuse`, a journal, titles.

### 7.2 Save (`progress.ts`)

`flags: Record<string, true>`, `name: number`, `wishes: string[]`. Version 2 with a one-line migration (old saves: `name` = 1 per quest done).

### 7.3 Level data (`level.ts`, `npc.ts`, `main.ts`)

- `Spawn.when?: string[]` / `Spawn.unless?: string[]`, evaluated on map entry. `!` negates. Quest ids count (`quest:prologue`), wishes count (`wish:well`), stage counts (`stage:2`). `Exit.when` the same.
- Named story NPCs: `Spawn.name` exists; add `look?: string` (a fixed accessory and colour set from a small table in `characters.ts`) and `lines?: string` (a dialogue pool id instead of the role pool).
- `Spawn.follow?: boolean` (an NPC that can be a `follow` target) and `Spawn.ally?: boolean`.
- Stage variants: `maps.json` entries `home_2`, `home_3` with `variant_of: 'home'`; `enterMap('home')` resolves to the variant for the current stage (the Marib lookup, keyed on stage instead of a one-off flag).
- `maps.json` `start: 'home'`.

### 7.4 Dialogue (`dialogue.ts`, `hud.ts`, locales)

- **Choice prompt** in the dialogue box: two or three options, arrows or stick, confirm; gamepad and keyboard glyphs as the HUD does now. Used by `choose` and the wish list.
- **Conditional lines**: pool entries may be `{ text, when }`; the conversation builder filters by flags. Needed for the gate guards after "give up" and the Bedouin greeting.
- **Named pools**: `lines.harith.*`, `lines.mutalammis.*`, `lines.wife.*` keyed by state. The wife's picker: `wifeLines(stage, lastOutcome)`.

### 7.5 Story runner (`story.ts`, new)

The cutscene runner (section 6), the homecoming trigger (arrival at `home` from the pass runs cutscene 6 and the stage check), the wish list, and the dialogue section that is in `main.ts` now. `main.ts` is at 2,500 lines; this is the moment to move story code out before more goes in.

### 7.6 Enemies (`enemy.ts`)

- Riders as a group spawn with a `chief` (`boss`) and a `champion` (`boss`), flagged `when: ['quest:guest.night2']`.
- The dormant-in-truce rule for duels (one check in the engage logic).
- Allies as valid targets (one branch in target selection).

### 7.7 Debug tab

Set a flag, set the stage, start a chapter at a step, skip a cutscene, give the feather. Without these the slice cannot be tested in under an hour.

---

## 8. Art: what the Blender session needs to make

For the [art session](#local_bc916a8a-aafc-46c3-a4b9-be14b8aad3da), in its own terms (`big_maps.py` map classes, `kit.py` pieces, `rigs.py` clips, `export_assets.py`). Everything follows `docs/MAPS_TODO.md` rules: exact walkable colliders, the jump budget (required moves at most 1.35 m up and 2.7 m across; secrets 2.6–3.2 m up), arrivals facing in, `title_ar` and `landmark_names`, the perf spec.

### 8.1 The home map (`home`, plus `home_2`, `home_3`)

- **Size:** 320 × 320 m playable, culture `hijazi`, heightfield step 2 m. Backdrop ring of mountains on all sides (buttes and strata walls from the kit), with the rise inside the strata columns as the cliffs rule says.
- **Floor:** a basin, mostly flat, a spring pool with reeds and 6–8 palms on the north side, gravel and a few rocks elsewhere, one dead tree. Enough flat ground for the stage 3 ring of tents (about 60 m across) east of the spring.
- **The lookout:** a ledge path up the north wall to a shelf 10 m above the floor. Six to eight steps of 0.9–1.3 m, two gaps of 2.0–2.5 m, every top an exact collider (tags `ledge`, `cliff`). Landmark `lookout` on the shelf; from it the pass and the horizon beyond must be visible (the town's smoke is a game effect at landmark `town_smoke`, on the backdrop ring to the south-east).
- **The eagle's ledge:** a shelf 2.8 m above the lookout's top, landmark `eagle_ledge`, with a `chest` marker `home_eagle_chest` (`secret: true`).
- **The pass:** a canyon 10–14 m wide running south-east out of the basin, 60 m long, with a flat area 30 m across at its inner mouth (landmark `pass`, the duel's truce circle; `truce: { center, radius: 14 }` in level.json) and the exit cairn at the far end (`exits: [{ to: 'oasis', label: 'The road to the town' }]`).
- **Spawns, stage 1:** `player` (in the tent), `wife` (id `wife`, `name`, a fixed `look`), a goat (reuse the dog rig recoloured, or a kit prop), `bonfire` id `home_fire`, landmarks `tent`, `fire`, `spring`, `guest_tent` (empty ground at stage 1).
- **Stage 2 (`home_2`):** three tents, a well ring beside the spring (two states: being dug, and done, as separate dressing with `when: ['wish:well']`), a pen with two camels, spawns `cousin` (id `cousin`, `shopkeeper`), `herder` (sitter).
- **Stage 3 (`home_3`):** a ring of six tents, a guest tent (kit `tent` with an open front, landmark `guest_tent`, a second fire marker), a stable awning with a `horse` spawn, spawn `stable_hand`, and a `guest` spawn id `guest` with `when: ['flag:ch.guest.sheltered']` and a second with `when: ['flag:ch.letter.opened', '!flag:ch.guest.sheltered']`.
- **Wish dressing** on every stage: a wall segment across the pass mouth (`when: ['wish:wall']`), a loom by the tent (`wish:loom`), a second tent (`wish:tent`).
- **Pursuer spawns** at the pass (stage 1 and 2 variants): `enemy` × 6 (`kind: raider`, `camp: 'pursuers'`), one `title: 'chief'` with `boss`, one `title: 'champion'` with `boss`, four `horse` spawns beside them, all `when: ['quest:guest.night2']`.
- **Preview:** `preview_level.py -- map=home at=lookout` and `at=pass`, and one with `colliders`.

### 8.2 Changes to existing maps (allowed: an added exit and its arrival)

- **`oasis`:** an exit cairn to `home` on the west edge with a `player` arrival `from: 'home'` facing the gate; a `quest_giver` spawn `gate_captain` beside the gate (the `letter_south` giver moves here); a spawn `stranger` (id `harith`, `name`, `look`, `follow: true`, `when: ['quest:prologue', '!quest:guest']`) just outside the gate; a `poet` spawn `mutalammis` (`look`, `follow: true`, `when: ['quest:guest', '!quest:letter']`) by the home cairn.
- **`caravanserai`:** check the old post: a single-jump route to the serai's upper terrace (landmark `terrace`, `above` ~4 m), a roof route from the terrace over the wall and down the far side (one 2.8 m drop needing nothing, one 1.6 m rise needing the double jump as the shortcut), the `white_feather` pickup moved to the highest roof, a weapon rack prop at the gate (landmark `rack`), spawns `kings_man` (id, `look`, on the terrace), `boy_reader` (child-sized: the person rig at 0.7 scale, by the cistern, landmark `cistern`), and riders (`enemy` × 4 with a `captain` `boss`, `when: ['flag:ch.letter.opened']`) on the road.

### 8.3 Characters (`rigs.py` looks, one row on the contact sheet)

Fixed accessory sets and colours, named in a `looks` table so the game can spawn them by id: the wife (veil, a distinct robe colour), al-Harith (face wrap, lamellar, the long beard, a dark robe), al-Mutalammis (turban, cloak, a bow on the back, grey hair), the king's man (vest, a bright sash), the pursuer chief (helmet, shield), the champion (lamellar, spear), the boy (0.7 scale, headband), the cousin (belly, keffiyeh).

### 8.4 Props and clips

- A notable sword: `props/sword_harith.glb`, same grip convention as `sword.glb`, a different blade and guard.
- A sealed letter: `props/letter.glb`, a small rolled tube with a seal, usable as a hand item in the Read clip and as a pickup.
- A goat: a small quadruped on the dog rig, or a static prop.
- One clip: `Read` (upper layer, 2 s, hand_R raised holding the letter, head down). Everything else uses Talk, Sit, Ride, Walk, Death.
- A weapon rack: `props/rack.glb` with two swords on it.

### 8.5 Not needed for the slice

Creature models beyond the goat, new regions, burnt-camp dressing, stage 4 and 5, winged horse work.

---

## 9. Writing budget

| Block | Lines (EN, then AR) |
|---|---|
| the book's voice, prologue | 8 |
| the wife, all states | 40 |
| al-Harith (road, fire, parley, guest scene) | 30 |
| the pursuer chief and champion | 8 |
| al-Mutalammis (road, cistern, riders, guest scene) | 30 |
| the gate captain, the king's man, the boy | 12 |
| the cousin, herder, stable hand | 10 |
| guards' and Bedouin conditional greetings | 6 |
| choice prompts, toasts, objective texts | 20 |
| two poems (one existing, one about the player, both outcomes) | 8 |
| **total** | **~170 per language** |

Rules from the earlier research still apply: offers withhold, one choice per chapter, consequences visible at home, no line that only summarises what the player just saw.

---

## 10. Test plan

The slice is done when a tester who has never seen the game can do all of this without help in under 30 minutes, with keyboard and with a gamepad, in English and in Arabic:

1. Wake, climb the lookout with single jumps only, see the smoke, get the sword, leave through the pass.
2. See the stranger refused at the gate, take him home, get his name, meet the riders, make each of the three choices (three saves) and see each result at home the next time: the wife's line, the camp at stage 2, the guards' changed greeting after "give up".
3. Take the letter, ride with the poet, see the boy read his, make both choices (two saves): fight the riders on the road, or deliver, be seized, climb out over the roofs, take the feather, get the sword from the rack, fight out.
4. Come home to stage 3, find the guest, hear the poem about you, get the sword if it was earned, open the eagle's ledge chest with the double jump.
5. Skip every cutscene with one key. Reload any save mid-chapter and continue.
6. No console errors; the performance readout stays under the current maps' numbers on `home`.

---

## 11. Order of work

1. Engine groundwork: flags, Name, `choose` and the choice prompt, conditional spawns, lines and exits, `story.ts` with the cutscene runner, the Debug tab additions. (Everything else waits on this.)
2. Art: the home map stage 1 with the lookout and the pass; the wife's look; the oasis exit. (The prologue can be played the moment this lands.)
3. Prologue and the first homecoming cutscene; the wish list.
4. Chapter 1: `follow`, `duel`, `kill_named`, allies; the pursuer spawns; home stage 2; the looks for al-Harith and the riders.
5. Chapter 2: the caravanserai terrace and roofs, the feather move, the king's man and the boy, home stage 3, the guest scene.
6. Arabic pass, sound pass (the cutscenes need the oud and a horse line), the test plan above.

---

## 12. Backlog: the game after the slice

Kept from the full proposal so it is not lost. None of it is in scope now.

- Settlement stages 4 (walled hamlet: caravan master for fast travel, kahin, allied families) and 5 (town: shrine, the codex of poems recited, envoys).
- "Bigger target" on the road as Name rises: bounty riders, a rival poet's satire duel at Ukaz, a king's summons.
- Chapters: the Basus war with a side choice and burnt-camp map variants (`chase`, allied `siege`); Imru' al-Qays's armour at Tayma (`carry`, `climb`, a faith-or-son choice with al-Samaw'al); Dahis and al-Ghabra on the race system; Zarqa al-Yamama as an `accuse` chapter; Hatim's horse as a hospitality dilemma at your own fire.
- Objective kinds `chase`, `carry`, `accuse`; a journal tab; titles; poems-about-you as a codex page.
- Converting the sixty existing quests into tasks beside the golden path, two or three per map.
- Visitors as a general system: every named character met comes to the fire once.

## Sources

- Paweł Sasko, *10 Key Quest Design Lessons* (GDC 2023), via [Game Developer](https://www.gamedeveloper.com/marketing/10-key-takeaways-from-the-quest-design-of-cyberpunk-2077-and-the-witcher-3) and [GameBanshee](https://www.gamebanshee.com/943k6).
- Sam Kabo Ashwell, [Standard Patterns in Choice-Based Games](https://heterogenoustasks.wordpress.com/2015/01/26/standard-patterns-in-choice-based-games/).
- [Game Developer: Ghost of Tsushima, the art of compelling quest design](https://gamedeveloper.com/design/ghost-of-tsushima---the-art-of-compelling-quest-design) and [GamingBolt's review](https://gamingbolt.com/ghost-of-tsushima-review-ghost-of-assassins-creed) on character strands and smoke-as-marker.
- [gamedev.net on golden paths and hand-holding](https://gamedev.net/blogs/entry/2277800-should-players-be-hand-held/) and [Laptop Mag on main-versus-side](https://www.laptopmag.com/uk/features/interrogating-the-modern-open-world-game).
- [Bugnet: how to scope a vertical slice](https://bugnet.io/blog/how-to-scope-a-vertical-slice) and [Wayline: scoping before the slice](https://www.wayline.io/blog/scoping-before-vertical-slice).
- [PC Gamer on Elden Ring's quest markers](https://www.pcgamer.com/uk/elden-rings-npc-quest-markers-are-just-a-band-aid/); [Red Dead Wiki, Strangers](https://reddead.fandom.com/wiki/Strangers).
- Kitab al-Aghani (Abu al-Faraj al-Isfahani) for al-Harith ibn Zalim and al-Mutalammis; check both stories there before writing.
