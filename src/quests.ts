import type { Progress, QuestState } from './progress';

/**
 * Basic quests: kill a camp, talk to someone, fetch an item. People are
 * referenced by map + spawn role + index among that role's spawns, so they
 * resolve to the same (seeded) NPC on every visit.
 */

export interface NpcRef {
  map: string;
  role: string;
  index: number;
}

export type Objective =
  | { kind: 'kill_camp'; map: string; camp: string; text: string }
  | { kind: 'talk'; npc: NpcRef; text: string; lines: string[] }
  | { kind: 'fetch'; map: string; landmark: string; offset?: [number, number]; item: string; text: string };

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
  {
    id: 'tomb_robbers',
    title: 'Thieves at the Tomb',
    giver: { map: 'oasis', role: 'priest', index: 0 },
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
    id: 'letter_south',
    title: 'A Letter for the Caravanserai',
    giver: { map: 'oasis', role: 'guard', index: 0 },
    offer: [
      'You look like someone who travels. The captain at the caravanserai must have this letter.',
      'South along the incense road. Hand it to the gatekeeper there, no one else.',
    ],
    waiting: 'The letter goes to the gatekeeper of the caravanserai, south along the road.',
    turnIn: ['Delivered? Good. The road is safer with honest feet on it. Here, for your trouble.'],
    gives: 'caravan_letter',
    objectives: [
      {
        kind: 'talk',
        npc: { map: 'caravanserai', role: 'guard', index: 0 },
        text: 'Give the letter to the caravanserai gatekeeper',
        lines: ['A letter from the oasis gate? Let me see… raiders on the ridge, and worse in the north.', 'Tell them we will keep the road. Go back with my thanks.'],
      },
    ],
    reward: { gold: 150, upgrade: 'flask' },
  },
  {
    id: 'sweet_water',
    title: 'Sweet Water for the Wadi',
    giver: { map: 'wadi', role: 'farmer', index: 0 },
    offer: [
      'The falaj runs bitter this week — salt in the channel, the elders say. My children are sick of it.',
      'The cistern at the caravanserai keeps the sweetest water on the road. Bring me one skin of it?',
    ],
    waiting: 'One skin from the caravanserai cistern. Please hurry.',
    turnIn: ['Sweet as dates! May your road always lead to water. Take what I saved.'],
    objectives: [{ kind: 'fetch', map: 'caravanserai', landmark: 'cistern', offset: [2, 2], item: 'sweet_water', text: 'Fill a skin at the caravanserai cistern' }],
    reward: { gold: 220 },
  },
  {
    id: 'hegra_robbers',
    title: 'The Tomb Robbers of Hegra',
    giver: { map: 'hegra', role: 'priest', index: 0 },
    offer: ['Robbers break the seals of the great tombs. Each seal is a curse on the one who breaks it — and on us who let them.', 'Hunt them down in the valley.'],
    waiting: 'The robbers are still among the tombs.',
    turnIn: ['The seals are safe. Hegra remembers its friends.'],
    objectives: [{ kind: 'kill_camp', map: 'hegra', camp: 'tomb_robbers', text: 'Defeat the tomb robbers of Hegra' }],
    reward: { gold: 300 },
  },
  {
    id: 'stronghold',
    title: 'Break the Stronghold',
    giver: { map: 'caravanserai', role: 'guard', index: 0 },
    requires: 'letter_south',
    offer: [
      'The raiders on the ridge answer to a chief in the stronghold to the north. Cut off the head and the body falls.',
      'His tent is at the top of the mesa. Many guard it. Rest at a bonfire first.',
    ],
    waiting: 'The chief still lives. North, up the mesa ramp.',
    turnIn: ['The chief is dead? Then the road is ours again. Take this blade — you have earned iron.'],
    objectives: [{ kind: 'kill_camp', map: 'raider_fort', camp: 'chief', text: 'Kill the raider chief in his tent' }],
    reward: { gold: 600, weapon: 'iron_sword' },
  },
];

export interface QuestEvents {
  toast(text: string): void;
  reward(def: QuestDef): void;
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
  }

  private advance(q: QuestDef): void {
    const st = this.state(q.id)!;
    st.step++;
    if (st.step >= q.objectives.length) {
      st.state = 'ready';
      this.ev.toast(`${q.title}: return to ${roleName(q.giver.role)}`);
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
    const line = obj ? obj.text + where(objMap(obj)) : `Return to the ${roleName(q.giver.role)}${where(q.giver.map)}`;
    return `${q.title} — ${line}`;
  }
}

export function objMap(o: Objective): string {
  return o.kind === 'talk' ? o.npc.map : o.map;
}

export function sameRef(a: NpcRef, b: NpcRef): boolean {
  return a.map === b.map && a.role === b.role && a.index === b.index;
}

function roleName(role: string): string {
  return { priest: 'priest', guard: 'guard', farmer: 'farmer', merchant: 'merchant' }[role] ?? role.replace('_', ' ');
}
