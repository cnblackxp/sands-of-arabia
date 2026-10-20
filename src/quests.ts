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

export type Objective =
  | { kind: 'kill_camp'; map: string; camp: string; text: string }
  | { kind: 'talk'; npc: NpcRef; text: string; lines: string[] }
  /** `pickup`: a `role: "pickup"` marker id in that map. */
  | { kind: 'fetch'; map: string; pickup: string; item: string; text: string };

export interface QuestDef {
  id: string;
  title: string;
  giver: NpcRef;
  /** Quest that must be done before this one is offered. */
  requires?: string;
  offer: string[];
  /** Spoken while the quest is active and unfinished. */
  waiting: string;
  turnIn: string[];
  objectives: Objective[];
  /** Items handed over when the quest starts (e.g. a letter to deliver). */
  gives?: string;
  reward: { gold: number; upgrade?: string; weapon?: string };
}

export const QUESTS: QuestDef[] = [
  // --- oasis -------------------------------------------------------------------
  {
    id: 'tomb_robbers',
    title: 'Thieves at the Tomb',
    giver: { map: 'oasis', id: 'oasis_priest' },
    offer: [
      'Raiders have made camp before the rock tomb to the north-east. They dig at the dead for trinkets.',
      'The gods will not forgive us if we let it pass. Drive them off — all of them.',
    ],
    waiting: 'The robbers still dig at the tomb. North-east, past the camp.',
    turnIn: ['The dead sleep quietly again. Take this — the shrine has little, but it gives freely.'],
    objectives: [{ kind: 'kill_camp', map: 'oasis', camp: 'tomb', text: 'Clear the raider camp at the rock tomb' }],
    reward: { gold: 250 },
  },
  {
    id: 'tomb_tablet',
    title: 'The Tablet of the Tomb',
    giver: { map: 'oasis', id: 'oasis_priest' },
    requires: 'tomb_robbers',
    offer: ['The robbers broke a tablet from the tomb’s face before you came. A piece lies high on the rock.', 'Climb, and bring it back. Gently.'],
    waiting: 'The tablet lies high on the tomb rock.',
    turnIn: ['The names are whole again. You have the gods’ thanks — and mine.'],
    objectives: [{ kind: 'fetch', map: 'oasis', pickup: 'tomb_tablet', item: 'tomb_tablet', text: 'Recover the broken tablet from the tomb rock' }],
    reward: { gold: 200, upgrade: 'vitality' },
  },
  {
    id: 'pool_jar',
    title: 'The Elder’s Jar',
    giver: { map: 'oasis', id: 'oasis_elder' },
    offer: ['My grandmother’s jar — I set it down by the pool and the children ran off with it, then dropped it in the reeds.', 'My knees will not bend that far any more. Would you?'],
    waiting: 'By the pool, in the reeds. A painted jar.',
    turnIn: ['That is the one! Take a little silver for an old man’s jar.'],
    objectives: [{ kind: 'fetch', map: 'oasis', pickup: 'pool_jar', item: 'painted_jar', text: 'Find the painted jar by the pool' }],
    reward: { gold: 90 },
  },
  {
    id: 'letter_south',
    title: 'A Letter for the Caravanserai',
    giver: { map: 'oasis', role: 'guard', index: 0 },
    offer: [
      'You look like someone who travels. The innkeeper at the caravanserai must have this letter.',
      'South along the incense road. Hand it to the innkeeper, no one else.',
    ],
    waiting: 'The letter goes to the innkeeper of the caravanserai, south along the road.',
    turnIn: ['Delivered? Good. The road is safer with honest feet on it. Here, for your trouble.'],
    gives: 'caravan_letter',
    objectives: [
      {
        kind: 'talk',
        npc: { map: 'caravanserai', id: 'serai_innkeeper' },
        text: 'Give the letter to the caravanserai innkeeper',
        lines: ['A letter from the oasis gate? Let me see… raiders on the ridge, and worse in the north.', 'Tell them we will keep the road. Go back with my thanks.'],
      },
    ],
    reward: { gold: 150, upgrade: 'flask' },
  },
  {
    id: 'crest_bundle',
    title: 'Lost on the Crest',
    giver: { map: 'rooftops', id: 'rooftops_lantern_maker' },
    offer: ['My brother’s caravan lost a bundle of wicks and glass on the great dune crest by the oasis. Raiders sit there now.', 'Bring it back and every lantern I make this year will burn for you.'],
    waiting: 'The bundle is on the dune crest west of the oasis.',
    turnIn: ['Wicks, glass, even the copper caps! Here, take this.'],
    objectives: [{ kind: 'fetch', map: 'oasis', pickup: 'crest_lost_bundle', item: 'lantern_bundle', text: 'Recover the lost bundle on the oasis dune crest' }],
    reward: { gold: 260 },
  },
  // --- caravanserai -------------------------------------------------------------
  {
    id: 'sweet_water',
    title: 'Sweet Water for the Wadi',
    giver: { map: 'wadi', id: 'wadi_farmer_elder' },
    offer: [
      'The falaj runs bitter this week — salt in the channel, the elders say. My children are sick of it.',
      'The cistern at the caravanserai keeps the sweetest water on the road. Bring me one skin of it?',
    ],
    waiting: 'One skin from the caravanserai cistern. Please hurry.',
    turnIn: ['Sweet as dates! May your road always lead to water. Take what I saved.'],
    objectives: [{ kind: 'fetch', map: 'caravanserai', pickup: 'cistern_waterskin', item: 'sweet_water', text: 'Fill a skin at the caravanserai cistern' }],
    reward: { gold: 220 },
  },
  {
    id: 'lost_cargo',
    title: 'Cargo off the Camel Line',
    giver: { map: 'caravanserai', id: 'serai_innkeeper' },
    requires: 'letter_south',
    offer: ['A bale slipped off a camel and the drivers swear it climbed onto the old post by itself.', 'Fetch it down before the ridge bandits do.'],
    waiting: 'The bale is up at the old post.',
    turnIn: ['Saffron, all of it! You saved a merchant’s year.'],
    objectives: [{ kind: 'fetch', map: 'caravanserai', pickup: 'lost_cargo', item: 'saffron_bale', text: 'Bring down the lost bale at the old post' }],
    reward: { gold: 180 },
  },
  {
    id: 'stronghold',
    title: 'Break the Stronghold',
    giver: { map: 'caravanserai', id: 'caravan_master' },
    offer: [
      'The raiders on the ridge answer to a chief in the stronghold to the north. Cut off the head and the body falls.',
      'His tent is at the top of the mesa. Many guard it. Rest at a bonfire first.',
    ],
    waiting: 'The chief still lives. North, up the mesa ramp.',
    turnIn: ['The chief is dead? Then the road is ours again. Take this blade — you have earned iron.'],
    objectives: [{ kind: 'kill_camp', map: 'raider_fort', camp: 'chief', text: 'Kill the raider chief in his tent' }],
    reward: { gold: 600, weapon: 'iron_sword' },
  },
  {
    id: 'chief_seal',
    title: 'The Prisoner’s Bargain',
    giver: { map: 'raider_fort', id: 'fort_prisoner' },
    offer: ['You fight them? Then listen. The chief keeps a seal — with it the coast slavers will not trade with this band.', 'Take it from his tent and they are finished.'],
    waiting: 'The seal is in the chief’s tent.',
    turnIn: ['The seal! Break it on the stones and they are nothing. Here, I hid this from them.'],
    objectives: [{ kind: 'fetch', map: 'raider_fort', pickup: 'chief_seal', item: 'chief_seal', text: 'Take the chief’s seal from his tent' }],
    reward: { gold: 300, upgrade: 'endurance' },
  },
  // --- hegra ------------------------------------------------------------------
  {
    id: 'hegra_robbers',
    title: 'The Tomb Robbers of Hegra',
    giver: { map: 'hegra', id: 'hegra_priest' },
    offer: ['Robbers break the seals of the great tombs. Each seal is a curse on the one who breaks it — and on us who let them.', 'Hunt them down in the valley.'],
    waiting: 'The robbers are still among the tombs.',
    turnIn: ['The seals are safe. Hegra remembers its friends.'],
    objectives: [{ kind: 'kill_camp', map: 'hegra', camp: 'tomb_robbers', text: 'Defeat the tomb robbers of Hegra' }],
    reward: { gold: 300 },
  },
  {
    id: 'tomb_seal',
    title: 'A Seal for the Mason',
    giver: { map: 'hegra', id: 'hegra_mason' },
    offer: ['I carve the facades. A seal stone fell from one of my tombs and rolled into the valley.', 'Find it; I cannot finish the door without it.'],
    waiting: 'The seal stone lies somewhere in the valley.',
    turnIn: ['It is whole. A craftsman pays his debts — take this.'],
    objectives: [{ kind: 'fetch', map: 'hegra', pickup: 'tomb_seal', item: 'seal_stone', text: 'Find the fallen seal stone in the valley' }],
    reward: { gold: 160 },
  },
  {
    id: 'khazneh_incense',
    title: 'Incense for the Shrine',
    giver: { map: 'hegra', id: 'hegra_priest' },
    requires: 'hegra_robbers',
    offer: ['The offering incense was hidden at the great facade when the robbers came. Bring it to me.'],
    waiting: 'The incense is hidden at the great facade.',
    turnIn: ['Its smoke will carry your name to the gods tonight.'],
    objectives: [{ kind: 'fetch', map: 'hegra', pickup: 'khazneh_incense', item: 'incense', text: 'Bring the hidden incense from the great facade' }],
    reward: { gold: 150 },
  },
  // --- platforming maps -----------------------------------------------------------
  {
    id: 'lost_kite',
    title: 'The Runner’s Kite',
    giver: { map: 'rooftops', id: 'rooftops_runner' },
    offer: ['My kite! It snapped its string and landed on a roof up there. I would climb, but my mother is watching.', 'Roof to roof, all the way up. You can do it — you have legs.'],
    waiting: 'Up on the roofs! Keep climbing.',
    turnIn: ['You got it down! You are the best roof-runner in Qaryat — well, second best.'],
    objectives: [{ kind: 'fetch', map: 'rooftops', pickup: 'rooftops_lost_kite', item: 'kite', text: 'Climb the rooftops and fetch the runner’s kite' }],
    reward: { gold: 140 },
  },
  {
    id: 'sluice_key',
    title: 'The Sluice Key',
    giver: { map: 'cliffs', id: 'cliffs_waterman' },
    offer: ['The aqueduct’s sluice key is up on the spans — I dropped it fleeing the last rockfall.', 'Without it the wadi gets no water this season. Mind the broken spans.'],
    waiting: 'The key is on the aqueduct, past the broken spans.',
    turnIn: ['The water will run again. Here — and go carefully on the cliffs.'],
    objectives: [{ kind: 'fetch', map: 'cliffs', pickup: 'cliffs_sluice_key', item: 'sluice_key', text: 'Fetch the sluice key from the aqueduct' }],
    reward: { gold: 240 },
  },
  {
    id: 'bronze_inscription',
    title: 'The Bronze Inscription',
    giver: { map: 'ruined_temple', id: 'temple_scholar' },
    offer: ['This was a Sabaean temple. Somewhere in the hall lies a bronze plaque with the builder’s name.', 'Robbers prowl the ruins. Bring me the plaque and I will read it to you.'],
    waiting: 'The plaque lies somewhere in the pillar hall.',
    turnIn: ['“…built this house for the moon god, in the year of…” — remarkable. Take this for your trouble.'],
    objectives: [{ kind: 'fetch', map: 'ruined_temple', pickup: 'bronze_inscription', item: 'bronze_plaque', text: 'Find the bronze inscription in the temple ruins' }],
    reward: { gold: 280 },
  },
];

/** Pickups that are always in the world (not tied to a quest) and what they grant. */
export const FREE_PICKUPS: Record<string, { label: string; upgrade?: string; message: string }> = {
  white_feather: { label: 'a white feather', upgrade: 'double_jump', message: 'A white feather, light as air. You can now jump again in mid-air.' },
};

export interface QuestEvents {
  toast(text: string): void;
  reward(def: QuestDef): void;
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
    return !q.requires || this.state(q.requires)?.state === 'done';
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
      if (obj?.kind === 'talk' && sameRef(obj.npc, ref)) return 'objective';
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
        return { lines: q.turnIn, onDone: () => this.complete(q) };
      }
    }
    // A talk objective.
    for (const q of QUESTS) {
      const st = this.state(q.id);
      const obj = st?.state === 'active' ? q.objectives[st.step] : undefined;
      if (obj?.kind === 'talk' && sameRef(obj.npc, ref)) {
        return {
          lines: obj.lines,
          onDone: () => {
            if (q.gives) this.takeItem(q.gives);
            this.advance(q);
          },
        };
      }
    }
    // Offering.
    for (const q of QUESTS) {
      if (sameRef(q.giver, ref) && this.available(q)) {
        return {
          lines: [...q.offer, `— Quest accepted: ${q.title}`],
          onDone: () => this.accept(q),
        };
      }
    }
    // Waiting on progress.
    for (const q of QUESTS) {
      if (sameRef(q.giver, ref) && this.state(q.id)?.state === 'active') return { lines: [q.waiting], onDone: () => {} };
    }
    return null;
  }

  accept(q: QuestDef): void {
    this.progress.data.quests[q.id] = { state: 'active', step: 0 };
    if (q.gives) this.giveItem(q.gives);
    this.progress.data.trackedQuest = q.id;
    this.progress.save();
    this.ev.toast(`New quest: ${q.title}`);
    this.ev.sound('accept');
  }

  private advance(q: QuestDef): void {
    const st = this.state(q.id)!;
    st.step++;
    this.ev.sound('step');
    if (st.step >= q.objectives.length) {
      st.state = 'ready';
      this.ev.toast(`${q.title}: return to the ${roleName(q.giver)}`);
    } else {
      this.ev.toast(`${q.title}: ${q.objectives[st.step].text}`);
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
      if (obj?.kind === 'kill_camp' && obj.map === map && obj.camp === camp) this.advance(q);
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
      if (obj?.kind === 'fetch' && obj.map === map) out.push(obj);
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
    const where = (m: string) => (m ? ` (${m.replace('_', ' ')})` : '');
    const obj = st.state === 'active' ? q.objectives[st.step] : null;
    const line = obj ? obj.text + where(objMap(obj)) : `Return to the ${roleName(q.giver)}${where(q.giver.map)}`;
    return `${q.title} — ${line}`;
  }
}

export function objMap(o: Objective): string {
  return o.kind === 'talk' ? o.npc.map : o.map;
}

export function sameRef(a: NpcRef, b: NpcRef): boolean {
  if (a.map !== b.map) return false;
  if (a.id || b.id) return !!a.id && a.id === b.id;
  return a.role === b.role && a.index === b.index;
}

function roleName(ref: NpcRef): string {
  if (ref.id) {
    const parts = ref.id.split('_');
    return (parts.length > 1 ? parts.slice(1) : parts).join(' ');
  }
  return (ref.role ?? 'giver').replace('_', ' ');
}
