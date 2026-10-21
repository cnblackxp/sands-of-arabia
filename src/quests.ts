import { L, t, tOr } from './i18n';
import { en } from './locales/en';
import type { Progress, QuestState } from './progress';

/**
 * Basic quests: kill a camp, talk to someone, fetch an item. People are
 * referenced by map + spawn id (quest givers placed in level.json) or by
 * map + spawn role + index among that role's spawns, so they resolve to the
 * same (seeded) NPC on every visit.
 */

export interface NpcRef {
  map: string;
  /** Marker id (`quest_giver` / `shopkeeper` spawns). */
  id?: string;
  role?: string;
  index?: number;
}

/** Objective text (and talk lines) are in locales/ under `quests.<id>.objectives`, in order. */
export type Objective =
  | { kind: 'kill_camp'; map: string; camp: string }
  | { kind: 'talk'; npc: NpcRef }
  /** `pickup`: a `role: "pickup"` marker id in that map. */
  | { kind: 'fetch'; map: string; pickup: string; item: string }
  /** Work something in the world (`target`: a `sluice` spawn id), in this order. */
  | { kind: 'use'; map: string; target: string }
  /**
   * Go and see a place (`landmark` key in level.json): within `radius` m (7), and
   * when `below` is set, under that height above it (inside a room, not on its roof).
   */
  | { kind: 'visit'; map: string; landmark: string; radius?: number; below?: number }
  /** Hand `gold` to someone (a ransom); talking to them pays if you have it. */
  | { kind: 'pay'; npc: NpcRef; gold: number }
  /** Win the horse race in this map. */
  | { kind: 'race'; map: string }
  /** Hold a place against waves of foes (`wave_spawn` marker ids, foes as `kind[:variant]`). */
  | { kind: 'siege'; map: string; landmark: string; waves: { marker: string; foes: string[] }[] }
  /** Walk the convoy led by `keeper` (spawn id) to the end of its road (`path` in level.json). */
  | { kind: 'escort'; map: string; keeper: string; path: string };

/**
 * Maps that are other states of one place (Marib and Marib after the flood):
 * objectives and people of one count in the other. Set from maps.json.
 */
let MAP_ALIAS: Record<string, string> = {};
export function setMapAliases(a: Record<string, string>): void {
  MAP_ALIAS = a;
}
export function sameMap(a: string, b: string): boolean {
  return a === b || (MAP_ALIAS[a] ?? a) === (MAP_ALIAS[b] ?? b);
}

/** Quest text (title, offer, waiting, turnIn, objectives) is in locales/ under `quests.<id>`. */
export interface QuestDef {
  id: string;
  giver: NpcRef;
  /** Quest(s) that must be done before this one is offered. */
  requires?: string | string[];
  /** Something that happens to the world when it is handed in (the flood of Marib). */
  effect?: 'flood_marib';
  objectives: Objective[];
  /** Items handed over when the quest starts (e.g. a letter to deliver). */
  gives?: string;
  reward: { gold: number; upgrade?: string; weapon?: string };
}

const ITHLIB = 'jabal_ithlib';
const UKAZ = 'ukaz';
const TAYMA = 'tayma';
const DUMAT = 'dumat_al_jandal';
const FAW = 'qaryat_al_faw';
const MARIB = 'marib';
const BREACH = 'marib_breach';

export const QUESTS: QuestDef[] = [
  // --- Qaryat al-Faw: the Kindite town at the gate of the Empty Quarter --------------------------
  {
    id: 'faw_ochre',
    giver: { map: FAW, id: 'kahl_priest' },
    objectives: [{ kind: 'fetch', map: FAW, pickup: 'red_ochre', item: 'red_ochre' }],
    reward: { gold: 240 },
  },
  {
    id: 'faw_painted_room',
    giver: { map: FAW, id: 'faw_painter' },
    objectives: [
      { kind: 'pay', npc: { map: FAW, id: 'faw_gerrhan_trader' }, gold: 120 },
      { kind: 'visit', map: FAW, landmark: 'mrzh_room', radius: 2.6, below: 2.4 },
    ],
    reward: { gold: 320, upgrade: 'flask' },
  },
  {
    id: 'faw_ode',
    giver: { map: FAW, id: 'faw_prince' },
    objectives: [1, 2, 3, 4, 5].map((n) => ({ kind: 'fetch' as const, map: FAW, pickup: `ode_line_${n}`, item: `ode_line_${n}` })),
    reward: { gold: 520, upgrade: 'endurance' },
  },
  {
    id: 'faw_water',
    giver: { map: FAW, role: 'farmer', index: 0 },
    objectives: [
      {
        kind: 'siege',
        map: FAW,
        landmark: 'well_field',
        waves: [
          { marker: 'faw_rival_1', foes: ['raider:camel', 'skirmisher:camel', 'slinger'] },
          { marker: 'faw_rival_2', foes: ['raider:camel', 'clubman', 'skirmisher:camel', 'slinger'] },
          { marker: 'faw_rival_1', foes: ['brute:camel', 'raider:camel', 'archer', 'raider:camel'] },
        ],
      },
    ],
    reward: { gold: 450, upgrade: 'vitality' },
  },
  {
    id: 'faw_caravan',
    giver: { map: FAW, id: 'faw_sabaean_caravan' },
    objectives: [{ kind: 'escort', map: FAW, keeper: 'faw_sabaean_caravan', path: 'caravan_south' }],
    reward: { gold: 400 },
  },
  {
    id: 'faw_raiders',
    giver: { map: FAW, id: 'faw_noble_1' },
    objectives: [{ kind: 'kill_camp', map: FAW, camp: 'sand_raiders' }],
    reward: { gold: 500, upgrade: 'vitality' },
  },
  {
    id: 'faw_ghul',
    giver: { map: FAW, id: 'faw_sabaean_caravan' },
    requires: 'faw_caravan',
    objectives: [{ kind: 'kill_camp', map: FAW, camp: 'sandstorm' }],
    reward: { gold: 900, upgrade: 'vitality' },
  },
  // --- Tayma: the walled oasis, al-Samaw'al's al-Ablaq --------------------------------------------
  {
    id: 'tayma_siege',
    giver: { map: TAYMA, id: 'samawal_son' },
    objectives: [{ kind: 'kill_camp', map: TAYMA, camp: 'siege' }],
    reward: { gold: 600, upgrade: 'shield' },
  },
  {
    id: 'tayma_armour',
    giver: { map: TAYMA, id: 'samawal' },
    requires: 'tayma_siege',
    objectives: [{ kind: 'fetch', map: TAYMA, pickup: 'prince_armour', item: 'prince_armour' }],
    reward: { gold: 400, upgrade: 'vitality' },
  },
  {
    id: 'tayma_channel',
    giver: { map: TAYMA, id: 'tayma_well_master' },
    objectives: [{ kind: 'visit', map: TAYMA, landmark: 'hidden_channel' }],
    reward: { gold: 260 },
  },
  {
    id: 'tayma_nabonidus',
    giver: { map: TAYMA, id: 'tayma_astrologer' },
    objectives: [{ kind: 'talk', npc: { map: TAYMA, id: 'tayma_scribe' } }],
    reward: { gold: 220 },
  },
  // --- Dumat al-Jandal: city of queens, Marid castle -------------------------------------------------
  {
    id: 'dumat_marid',
    giver: { map: DUMAT, id: 'queen_adummatu' },
    objectives: [
      {
        kind: 'siege',
        map: DUMAT,
        landmark: 'marid_castle',
        waves: [
          { marker: 'marid_wave_1', foes: ['archer:palmyrene', 'archer:palmyrene', 'raider:palmyrene'] },
          { marker: 'marid_wave_2', foes: ['archer:palmyrene', 'archer:palmyrene', 'raider:palmyrene', 'skirmisher:palmyrene'] },
          { marker: 'marid_wave_3', foes: ['archer:palmyrene', 'archer:palmyrene', 'archer:palmyrene', 'brute:palmyrene', 'raider:palmyrene'] },
        ],
      },
    ],
    reward: { gold: 700, upgrade: 'shield' },
  },
  {
    id: 'dumat_gods',
    giver: { map: DUMAT, id: 'dumat_convoy_master' },
    objectives: [{ kind: 'escort', map: DUMAT, keeper: 'dumat_convoy_master', path: 'convoy' }],
    reward: { gold: 480, upgrade: 'endurance' },
  },
  {
    id: 'dumat_spring',
    giver: { map: DUMAT, id: 'ruda_priestess' },
    objectives: [{ kind: 'fetch', map: DUMAT, pickup: 'spring_water', item: 'spring_water' }],
    reward: { gold: 220 },
  },
  {
    id: 'dumat_tribute',
    giver: { map: DUMAT, id: 'queen_adummatu' },
    requires: 'dumat_gods',
    objectives: [{ kind: 'talk', npc: { map: DUMAT, id: 'assyrian_envoy_1' } }],
    reward: { gold: 300 },
  },
  // --- Ukaz: the fair of the poets -----------------------------------------------------------
  {
    id: 'ukaz_race',
    giver: { map: UKAZ, id: 'ukaz_elder_dhubyan' },
    objectives: [{ kind: 'race', map: UKAZ }],
    reward: { gold: 400, upgrade: 'endurance' },
  },
  {
    id: 'ukaz_ransom',
    giver: { map: UKAZ, id: 'ukaz_elder_tamim' },
    objectives: [{ kind: 'pay', npc: { map: UKAZ, id: 'ukaz_ransom_broker' }, gold: 150 }],
    reward: { gold: 260, upgrade: 'flask' },
  },
  {
    id: 'ukaz_champion',
    giver: { map: UKAZ, id: 'ukaz_elder_taghlib' },
    objectives: [{ kind: 'kill_camp', map: UKAZ, camp: 'duel' }],
    reward: { gold: 800, upgrade: 'vitality' },
  },
  {
    id: 'ukaz_lost_ode',
    giver: { map: UKAZ, id: 'ukaz_nabigha' },
    objectives: [{ kind: 'fetch', map: UKAZ, pickup: 'lost_ode', item: 'lost_ode' }],
    reward: { gold: 400, upgrade: 'endurance' },
  },
  {
    id: 'ukaz_bandits',
    giver: { map: UKAZ, id: 'ukaz_elder_hawazin' },
    objectives: [{ kind: 'kill_camp', map: UKAZ, camp: 'hill_bandits' }],
    reward: { gold: 320 },
  },
  {
    id: 'ukaz_jinn',
    giver: { map: UKAZ, id: 'ukaz_kahin' },
    objectives: [
      { kind: 'talk', npc: { map: UKAZ, id: 'ukaz_poet_5' } },
      { kind: 'talk', npc: { map: UKAZ, id: 'ukaz_poet_4' } },
      { kind: 'talk', npc: { map: UKAZ, id: 'ukaz_poet_2' } },
    ],
    reward: { gold: 260 },
  },
  {
    id: 'ukaz_months',
    giver: { map: UKAZ, id: 'ukaz_elder_kinana' },
    objectives: [{ kind: 'talk', npc: { map: UKAZ, id: 'ukaz_elder_thaqif' } }],
    reward: { gold: 150 },
  },
  // --- Jabal Ithlib: the Nabataean sanctuary above Hegra ------------------------------
  {
    id: 'ithlib_banquet',
    giver: { map: ITHLIB, id: 'ithlib_feast_master' },
    objectives: [
      { kind: 'fetch', map: ITHLIB, pickup: 'wadi_wine', item: 'wine_skin' },
      { kind: 'fetch', map: ITHLIB, pickup: 'betyl_oil', item: 'anointing_oil' },
    ],
    reward: { gold: 320 },
  },
  {
    id: 'ithlib_cup',
    giver: { map: ITHLIB, id: 'ithlib_feast_master' },
    requires: 'ithlib_banquet',
    objectives: [{ kind: 'kill_camp', map: ITHLIB, camp: 'robbers_east' }],
    reward: { gold: 380, upgrade: 'endurance' },
  },
  {
    id: 'ithlib_lamps',
    giver: { map: ITHLIB, id: 'ithlib_priest' },
    objectives: [{ kind: 'kill_camp', map: ITHLIB, camp: 'robbers_north' }],
    reward: { gold: 260 },
  },
  {
    id: 'ithlib_high_place',
    giver: { map: ITHLIB, id: 'ithlib_priest' },
    requires: 'ithlib_lamps',
    objectives: [{ kind: 'visit', map: ITHLIB, landmark: 'high_place' }],
    reward: { gold: 300, upgrade: 'vitality' },
  },
  {
    id: 'ithlib_night',
    giver: { map: ITHLIB, id: 'ithlib_priest' },
    requires: 'ithlib_high_place',
    objectives: [{ kind: 'kill_camp', map: ITHLIB, camp: 'night_archers' }],
    reward: { gold: 450 },
  },
  // --- Marib: the Great Dam of Saba -------------------------------------------------------
  {
    id: 'marib_rota',
    giver: { map: MARIB, id: 'marib_warden_north' },
    objectives: [
      { kind: 'fetch', map: MARIB, pickup: 'warden_rota', item: 'rota_tablet' },
      { kind: 'use', map: MARIB, target: 'sluice_north' },
      { kind: 'use', map: MARIB, target: 'gate_n1' },
      { kind: 'use', map: MARIB, target: 'gate_n2' },
      { kind: 'use', map: MARIB, target: 'gate_n3' },
    ],
    reward: { gold: 420, upgrade: 'flask' },
  },
  {
    id: 'marib_south',
    giver: { map: MARIB, id: 'marib_warden_south' },
    requires: 'marib_rota',
    objectives: [
      { kind: 'use', map: MARIB, target: 'sluice_south' },
      { kind: 'use', map: MARIB, target: 'gate_s3' },
      { kind: 'use', map: MARIB, target: 'gate_s1' },
      { kind: 'use', map: MARIB, target: 'gate_s2' },
    ],
    reward: { gold: 360 },
  },
  {
    id: 'marib_rats',
    giver: { map: MARIB, id: 'marib_warden_south' },
    requires: 'marib_south',
    objectives: [{ kind: 'kill_camp', map: MARIB, camp: 'dam_rats' }],
    reward: { gold: 300 },
  },
  {
    id: 'marib_himyar',
    giver: { map: MARIB, id: 'marib_mukarrib' },
    objectives: [{ kind: 'kill_camp', map: MARIB, camp: 'himyar' }],
    reward: { gold: 650, upgrade: 'endurance' },
  },
  {
    id: 'marib_awwam',
    giver: { map: MARIB, id: 'awwam_priest' },
    gives: 'frankincense',
    objectives: [{ kind: 'visit', map: MARIB, landmark: 'awwam_altar' }],
    reward: { gold: 300 },
  },
  {
    id: 'marib_jackals',
    giver: { map: MARIB, id: 'marib_caravan_master' },
    objectives: [{ kind: 'kill_camp', map: MARIB, camp: 'jackals' }],
    reward: { gold: 260 },
  },
  {
    id: 'barran_hyenas',
    giver: { map: MARIB, id: 'barran_priest' },
    objectives: [{ kind: 'kill_camp', map: MARIB, camp: 'cemetery' }],
    reward: { gold: 420, upgrade: 'vitality' },
  },
  {
    id: 'marib_arim',
    giver: { map: MARIB, id: 'marib_mukarrib' },
    requires: ['marib_himyar', 'marib_rats'],
    objectives: [{ kind: 'visit', map: MARIB, landmark: 'dam' }],
    reward: { gold: 500 },
    effect: 'flood_marib',
  },
  // --- Marib after the flood of al-'Arim ---------------------------------------------------
  {
    id: 'breach_scattered',
    giver: { map: BREACH, id: 'awwam_priest' },
    requires: 'marib_arim',
    objectives: [{ kind: 'talk', npc: { map: BREACH, id: 'marib_caravan_master' } }],
    reward: { gold: 320 },
  },
  {
    id: 'breach_looters',
    giver: { map: BREACH, id: 'marib_mukarrib' },
    requires: 'marib_arim',
    objectives: [{ kind: 'kill_camp', map: BREACH, camp: 'looters' }],
    reward: { gold: 480, upgrade: 'flask' },
  },
  // --- oasis -------------------------------------------------------------------
  {
    id: 'tomb_robbers',
    giver: { map: 'oasis', id: 'oasis_priest' },
    objectives: [{ kind: 'kill_camp', map: 'oasis', camp: 'tomb' }],
    reward: { gold: 250 },
  },
  {
    id: 'tomb_tablet',
    giver: { map: 'oasis', id: 'oasis_priest' },
    requires: 'tomb_robbers',
    objectives: [{ kind: 'fetch', map: 'oasis', pickup: 'tomb_tablet', item: 'tomb_tablet' }],
    reward: { gold: 200, upgrade: 'vitality' },
  },
  {
    id: 'pool_jar',
    giver: { map: 'oasis', id: 'oasis_elder' },
    objectives: [{ kind: 'fetch', map: 'oasis', pickup: 'pool_jar', item: 'painted_jar' }],
    reward: { gold: 90 },
  },
  {
    id: 'letter_south',
    giver: { map: 'oasis', role: 'guard', index: 0 },
    gives: 'caravan_letter',
    objectives: [{ kind: 'talk', npc: { map: 'caravanserai', id: 'serai_innkeeper' } }],
    reward: { gold: 150, upgrade: 'flask' },
  },
  {
    id: 'crest_bundle',
    giver: { map: 'rooftops', id: 'rooftops_lantern_maker' },
    objectives: [{ kind: 'fetch', map: 'oasis', pickup: 'crest_lost_bundle', item: 'lantern_bundle' }],
    reward: { gold: 260 },
  },
  // --- caravanserai -------------------------------------------------------------
  {
    id: 'sweet_water',
    giver: { map: 'wadi', id: 'wadi_farmer_elder' },
    objectives: [{ kind: 'fetch', map: 'caravanserai', pickup: 'cistern_waterskin', item: 'sweet_water' }],
    reward: { gold: 220 },
  },
  {
    id: 'lost_cargo',
    giver: { map: 'caravanserai', id: 'serai_innkeeper' },
    requires: 'letter_south',
    objectives: [{ kind: 'fetch', map: 'caravanserai', pickup: 'lost_cargo', item: 'saffron_bale' }],
    reward: { gold: 180 },
  },
  {
    id: 'stronghold',
    giver: { map: 'caravanserai', id: 'caravan_master' },
    objectives: [{ kind: 'kill_camp', map: 'raider_fort', camp: 'chief' }],
    reward: { gold: 600, weapon: 'iron_sword' },
  },
  {
    id: 'chief_seal',
    giver: { map: 'raider_fort', id: 'fort_prisoner' },
    objectives: [{ kind: 'fetch', map: 'raider_fort', pickup: 'chief_seal', item: 'chief_seal' }],
    reward: { gold: 300, upgrade: 'endurance' },
  },
  // --- hegra ------------------------------------------------------------------
  {
    id: 'hegra_robbers',
    giver: { map: 'hegra', id: 'hegra_priest' },
    objectives: [{ kind: 'kill_camp', map: 'hegra', camp: 'tomb_robbers' }],
    reward: { gold: 300 },
  },
  {
    id: 'tomb_seal',
    giver: { map: 'hegra', id: 'hegra_mason' },
    objectives: [{ kind: 'fetch', map: 'hegra', pickup: 'tomb_seal', item: 'seal_stone' }],
    reward: { gold: 160 },
  },
  {
    id: 'khazneh_incense',
    giver: { map: 'hegra', id: 'hegra_priest' },
    requires: 'hegra_robbers',
    objectives: [{ kind: 'fetch', map: 'hegra', pickup: 'khazneh_incense', item: 'incense' }],
    reward: { gold: 150 },
  },
  // --- platforming maps -----------------------------------------------------------
  {
    id: 'lost_kite',
    giver: { map: 'rooftops', id: 'rooftops_runner' },
    objectives: [{ kind: 'fetch', map: 'rooftops', pickup: 'rooftops_lost_kite', item: 'kite' }],
    reward: { gold: 140 },
  },
  {
    id: 'sluice_key',
    giver: { map: 'cliffs', id: 'cliffs_waterman' },
    objectives: [{ kind: 'fetch', map: 'cliffs', pickup: 'cliffs_sluice_key', item: 'sluice_key' }],
    reward: { gold: 240 },
  },
  {
    id: 'bronze_inscription',
    giver: { map: 'ruined_temple', id: 'temple_scholar' },
    objectives: [{ kind: 'fetch', map: 'ruined_temple', pickup: 'bronze_inscription', item: 'bronze_plaque' }],
    reward: { gold: 280 },
  },
];

/** Pickups that are always in the world (not tied to a quest) and what they grant; text in locales/ `free`. */
export const FREE_PICKUPS: Record<string, { upgrade?: string }> = {
  white_feather: { upgrade: 'double_jump' },
};

export interface QuestText {
  title: string;
  offer: string[];
  /** Spoken while the quest is active and unfinished. */
  waiting: string;
  turnIn: string[];
  /** One per objective, in order; `lines` for talk objectives. */
  objectives: { text: string; lines?: string[] }[];
}

/** A quest's text in the current language. */
export function questText(id: string): QuestText {
  const all = (d: { quests: object }) => d.quests as Record<string, QuestText>;
  return all(L())[id] ?? all(en)[id] ?? { title: id, offer: [], waiting: '', turnIn: [], objectives: [] };
}

export interface QuestEvents {
  toast(text: string): void;
  reward(def: QuestDef): void;
  /** A quest's world effect (QuestDef.effect). */
  effect(name: string): void;
  /** A quest was taken on, or moved to its next step. */
  sound(kind: 'accept' | 'step'): void;
}

export class QuestSystem {
  constructor(
    private progress: Progress,
    private ev: QuestEvents,
  ) {}

  state(id: string): QuestState | undefined {
    return this.progress.data.quests[id];
  }

  def(id: string): QuestDef | undefined {
    return QUESTS.find((q) => q.id === id);
  }

  private available(q: QuestDef): boolean {
    if (this.state(q.id)) return false;
    const req = q.requires === undefined ? [] : Array.isArray(q.requires) ? q.requires : [q.requires];
    return req.every((r) => this.state(r)?.state === 'done');
  }

  /** Icon over an NPC: a quest to offer, one to turn in, or nothing. */
  iconFor(ref: NpcRef): 'quest' | 'turnin' | 'objective' | null {
    for (const q of QUESTS) {
      const st = this.state(q.id);
      if (sameRef(q.giver, ref)) {
        if (st?.state === 'ready') return 'turnin';
        if (this.available(q)) return 'quest';
      }
      const obj = st?.state === 'active' ? q.objectives[st.step] : undefined;
      if ((obj?.kind === 'talk' || obj?.kind === 'pay') && sameRef(obj.npc, ref)) return 'objective';
    }
    return null;
  }

  /**
   * Talking to an NPC: returns the quest lines to show instead of small talk
   * (and applies the effects at the end), or null.
   */
  talk(ref: NpcRef): { lines: string[]; onDone: () => void } | null {
    // Turning in.
    for (const q of QUESTS) {
      if (sameRef(q.giver, ref) && this.state(q.id)?.state === 'ready') {
        return { lines: questText(q.id).turnIn, onDone: () => this.complete(q) };
      }
    }
    // A talk objective.
    for (const q of QUESTS) {
      const st = this.state(q.id);
      const obj = st?.state === 'active' ? q.objectives[st.step] : undefined;
      if (obj?.kind === 'talk' && sameRef(obj.npc, ref)) {
        return {
          lines: questText(q.id).objectives[st!.step]?.lines ?? [],
          onDone: () => {
            if (q.gives) this.takeItem(q.gives);
            this.advance(q);
          },
        };
      }
    }
    // A payment (ransom): only if the purse can bear it.
    for (const q of QUESTS) {
      const st = this.state(q.id);
      const obj = st?.state === 'active' ? q.objectives[st.step] : undefined;
      if (obj?.kind === 'pay' && sameRef(obj.npc, ref)) {
        if (this.progress.data.gold < obj.gold) return { lines: [t('quest.cannotPay', { gold: obj.gold })], onDone: () => {} };
        return {
          lines: questText(q.id).objectives[st!.step]?.lines ?? [],
          onDone: () => {
            this.progress.data.gold -= obj.gold;
            this.ev.sound('step');
            this.advance(q);
          },
        };
      }
    }
    // Offering.
    for (const q of QUESTS) {
      if (sameRef(q.giver, ref) && this.available(q)) {
        return {
          lines: [...questText(q.id).offer, t('quest.accepted', { title: questText(q.id).title })],
          onDone: () => this.accept(q),
        };
      }
    }
    // Waiting on progress.
    for (const q of QUESTS) {
      if (sameRef(q.giver, ref) && this.state(q.id)?.state === 'active') return { lines: [questText(q.id).waiting], onDone: () => {} };
    }
    return null;
  }

  accept(q: QuestDef): void {
    this.progress.data.quests[q.id] = { state: 'active', step: 0 };
    if (q.gives) this.giveItem(q.gives);
    this.progress.data.trackedQuest = q.id;
    this.progress.save();
    this.ev.toast(t('quest.toastNew', { title: questText(q.id).title }));
    this.ev.sound('accept');
  }

  private advance(q: QuestDef): void {
    const st = this.state(q.id)!;
    st.step++;
    this.ev.sound('step');
    if (st.step >= q.objectives.length) {
      st.state = 'ready';
      this.ev.toast(t('quest.toastReturn', { title: questText(q.id).title, giver: roleName(q.giver) }));
    } else {
      this.ev.toast(t('quest.toastStep', { title: questText(q.id).title, objective: questText(q.id).objectives[st.step]?.text ?? '' }));
    }
    this.progress.save();
  }

  private complete(q: QuestDef): void {
    const st = this.state(q.id)!;
    st.state = 'done';
    for (const o of q.objectives) if (o.kind === 'fetch') this.takeItem(o.item);
    if (this.progress.data.trackedQuest === q.id) this.progress.data.trackedQuest = this.firstActive();
    this.progress.save();
    this.ev.reward(q);
    if (q.effect) this.ev.effect(q.effect);
  }

  /** The `use` objective waiting in this map (the next sluice of a rota), if any. */
  nextUse(map: string): Extract<Objective, { kind: 'use' }> | null {
    for (const q of QUESTS) {
      const st = this.state(q.id);
      const obj = st?.state === 'active' ? q.objectives[st.step] : undefined;
      if (obj?.kind === 'use' && sameMap(obj.map, map)) return obj;
    }
    return null;
  }

  /** Worked `target`: advances a rota if it was the right one ('ok'), 'wrong' if another comes first, or 'free'. */
  used(map: string, target: string): 'ok' | 'wrong' | 'free' {
    const next = this.nextUse(map);
    if (!next) return 'free';
    if (next.target !== target) return 'wrong';
    for (const q of QUESTS) {
      const st = this.state(q.id);
      if (st?.state === 'active' && q.objectives[st.step] === next) this.advance(q);
    }
    return 'ok';
  }

  /** The siege or escort objective waiting in this map, if any. */
  current<K extends 'siege' | 'escort'>(kind: K, map: string): Extract<Objective, { kind: K }> | null {
    for (const q of QUESTS) {
      const st = this.state(q.id);
      const obj = st?.state === 'active' ? q.objectives[st.step] : undefined;
      if (obj?.kind === kind && sameMap(obj.map, map)) return obj as Extract<Objective, { kind: K }>;
    }
    return null;
  }

  /** A siege held, or a convoy brought home. */
  finished(kind: 'siege' | 'escort', map: string): void {
    for (const q of QUESTS) {
      const st = this.state(q.id);
      const obj = st?.state === 'active' ? q.objectives[st.step] : undefined;
      if (obj?.kind === kind && sameMap(obj.map, map)) this.advance(q);
    }
  }

  /** Won the horse race in this map. */
  raceWon(map: string): void {
    for (const q of QUESTS) {
      const st = this.state(q.id);
      const obj = st?.state === 'active' ? q.objectives[st.step] : undefined;
      if (obj?.kind === 'race' && sameMap(obj.map, map)) this.advance(q);
    }
  }

  /** Visit objectives in this map whose place the player has reached. */
  visit(map: string, near: (o: Extract<Objective, { kind: 'visit' }>) => boolean): void {
    for (const q of QUESTS) {
      const st = this.state(q.id);
      const obj = st?.state === 'active' ? q.objectives[st.step] : undefined;
      if (obj?.kind === 'visit' && sameMap(obj.map, map) && near(obj)) this.advance(q);
    }
  }

  private firstActive(): string | null {
    return QUESTS.find((q) => this.state(q.id) && this.state(q.id)!.state !== 'done')?.id ?? null;
  }

  giveItem(id: string): void {
    const items = this.progress.data.items;
    items[id] = (items[id] ?? 0) + 1;
  }

  takeItem(id: string): void {
    const items = this.progress.data.items;
    if (items[id]) items[id]--;
    if (!items[id]) delete items[id];
  }

  /** A camp in `map` has no living enemies left. */
  campCleared(map: string, camp: string): void {
    for (const q of QUESTS) {
      const st = this.state(q.id);
      const obj = st?.state === 'active' ? q.objectives[st.step] : undefined;
      if (obj?.kind === 'kill_camp' && sameMap(obj.map, map) && obj.camp === camp) this.advance(q);
    }
  }

  /** Picked up a quest item. */
  picked(item: string): void {
    this.giveItem(item);
    for (const q of QUESTS) {
      const st = this.state(q.id);
      const obj = st?.state === 'active' ? q.objectives[st.step] : undefined;
      if (obj?.kind === 'fetch' && obj.item === item) this.advance(q);
    }
  }

  /** Fetch objectives currently waiting in this map. */
  pickupsIn(map: string): Extract<Objective, { kind: 'fetch' }>[] {
    const out: Extract<Objective, { kind: 'fetch' }>[] = [];
    for (const q of QUESTS) {
      const st = this.state(q.id);
      const obj = st?.state === 'active' ? q.objectives[st.step] : undefined;
      if (obj?.kind === 'fetch' && sameMap(obj.map, map)) out.push(obj);
    }
    return out;
  }

  /** Active objectives (for map markers and the tracker). */
  active(): { q: QuestDef; st: QuestState; obj: Objective | null }[] {
    return QUESTS.filter((q) => this.state(q.id) && this.state(q.id)!.state !== 'done').map((q) => {
      const st = this.state(q.id)!;
      return { q, st, obj: st.state === 'active' ? q.objectives[st.step] : null };
    });
  }

  /** One line for the HUD tracker. */
  trackerText(): string | null {
    const id = this.progress.data.trackedQuest ?? this.firstActive();
    return id ? this.lineFor(id) : null;
  }

  /** "Title — current objective (region)" for one quest. */
  lineFor(id: string): string | null {
    const q = this.def(id);
    const st = this.state(id);
    if (!q || !st || st.state === 'done') return null;
    const text = questText(id);
    const where = (m: string) => (m ? t('quest.where', { region: tOr(`regions.${m}`, m.replace('_', ' ')) }) : '');
    const obj = st.state === 'active' ? q.objectives[st.step] : null;
    const line = obj ? (text.objectives[st.step]?.text ?? '') + where(objMap(obj)) : t('quest.returnTo', { giver: roleName(q.giver) }) + where(q.giver.map);
    return t('quest.line', { title: text.title, line });
  }
}

/** The escort in this map, if a quest has one (its keeper and road). */
export function escortIn(map: string): Extract<Objective, { kind: 'escort' }> | null {
  for (const q of QUESTS) for (const o of q.objectives) if (o.kind === 'escort' && sameMap(o.map, map)) return o;
  return null;
}

export function objMap(o: Objective): string {
  if (o.kind === 'siege' || o.kind === 'escort') return MAP_ALIAS[o.map] ?? o.map;
  const m = o.kind === 'talk' || o.kind === 'pay' ? o.npc.map : o.map;
  return MAP_ALIAS[m] ?? m;
}

export function sameRef(a: NpcRef, b: NpcRef): boolean {
  if (!sameMap(a.map, b.map)) return false;
  if (a.id || b.id) return !!a.id && a.id === b.id;
  return a.role === b.role && a.index === b.index;
}

function roleName(ref: NpcRef): string {
  const title = L().titles[ref.id ?? ref.role ?? ''];
  if (title && L() !== en) return title;
  if (ref.id) {
    const parts = ref.id.split('_');
    return (parts.length > 1 ? parts.slice(1) : parts).join(' ');
  }
  return (ref.role ?? 'giver').replace('_', ' ');
}
