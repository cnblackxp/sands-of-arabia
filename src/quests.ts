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
  | { kind: 'fetch'; map: string; pickup: string; item: string };

/** Quest text (title, offer, waiting, turnIn, objectives) is in locales/ under `quests.<id>`. */
export interface QuestDef {
  id: string;
  giver: NpcRef;
  /** Quest that must be done before this one is offered. */
  requires?: string;
  objectives: Objective[];
  /** Items handed over when the quest starts (e.g. a letter to deliver). */
  gives?: string;
  reward: { gold: number; upgrade?: string; weapon?: string };
}

export const QUESTS: QuestDef[] = [
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
    const text = questText(id);
    const where = (m: string) => (m ? t('quest.where', { region: tOr(`regions.${m}`, m.replace('_', ' ')) }) : '');
    const obj = st.state === 'active' ? q.objectives[st.step] : null;
    const line = obj ? (text.objectives[st.step]?.text ?? '') + where(objMap(obj)) : t('quest.returnTo', { giver: roleName(q.giver) }) + where(q.giver.map);
    return t('quest.line', { title: text.title, line });
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
  const title = L().titles[ref.id ?? ref.role ?? ''];
  if (title && L() !== en) return title;
  if (ref.id) {
    const parts = ref.id.split('_');
    return (parts.length > 1 ? parts.slice(1) : parts).join(' ');
  }
  return (ref.role ?? 'giver').replace('_', ' ');
}
