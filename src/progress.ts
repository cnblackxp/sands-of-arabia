import type { Vec3 } from './level';

/**
 * Everything the player keeps between maps and sessions. Saved to
 * localStorage (best effort: private windows may refuse, the game still runs).
 */

export interface QuestState {
  state: 'active' | 'ready' | 'done';
  step: number;
}

export interface ProgressData {
  version: 1;
  gold: number;
  /** Gold dropped on death, waiting to be picked up (Souls-style). */
  lostGold: { map: string; pos: Vec3; amount: number } | null;
  /** Last rested bonfire: where you wake up. */
  bonfire: { map: string; id: string; pos: Vec3; yaw: number } | null;
  litBonfires: string[];
  weapons: string[];
  equipped: string;
  upgrades: Record<string, number>;
  flasks: number;
  quests: Record<string, QuestState>;
  items: Record<string, number>;
  trackedQuest: string | null;
  openedChests: string[];
  /** Free (non-quest) pickups already taken, e.g. the white feather. */
  taken: string[];
  /** Arrows in the quiver (max 10); loosed ones can be picked up again. */
  arrows: number;
}

const KEY = 'sands-of-arabia.save.v1';

export function freshProgress(): ProgressData {
  return {
    version: 1,
    gold: 0,
    lostGold: null,
    bonfire: null,
    litBonfires: [],
    weapons: ['bronze_sword'],
    equipped: 'bronze_sword',
    upgrades: {},
    flasks: 2,
    quests: {},
    items: {},
    trackedQuest: null,
    openedChests: [],
    taken: [],
    arrows: 10,
  };
}

export class Progress {
  data: ProgressData;
  private dirty = false;
  private timer = 0;

  constructor() {
    this.data = freshProgress();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw) as ProgressData;
        if (d && d.version === 1) this.data = { ...freshProgress(), ...d };
      }
    } catch {
      // No storage: play without saving.
    }
  }

  get maxHp(): number {
    return 100 + 20 * (this.data.upgrades.vitality ?? 0);
  }
  get maxStamina(): number {
    return 100 + 15 * (this.data.upgrades.endurance ?? 0);
  }
  get maxFlasks(): number {
    return 2 + (this.data.upgrades.flask ?? 0);
  }
  get doubleJump(): boolean {
    return (this.data.upgrades.double_jump ?? 0) > 0;
  }
  get hasBow(): boolean {
    return this.data.weapons.includes('composite_bow');
  }
  get shield(): boolean {
    return (this.data.upgrades.shield ?? 0) > 0;
  }

  addGold(n: number): void {
    this.data.gold = Math.max(0, this.data.gold + Math.round(n));
    this.save();
  }

  /** Mark for saving (batched). */
  save(): void {
    this.dirty = true;
  }

  update(dt: number): void {
    if (!this.dirty) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 1;
    this.dirty = false;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // Ignore quota / privacy errors.
    }
  }

  reset(): void {
    this.data = freshProgress();
    this.dirty = true;
    this.timer = 0;
  }
}
