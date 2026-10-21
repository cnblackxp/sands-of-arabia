import type * as THREE from 'three';

/** What a sword blow did, for game-feel feedback. */
export interface HitResult {
  pos: THREE.Vector3;
  killed: boolean;
  /** True if the blow broke poise (the target flinched). */
  staggered: boolean;
  /** The blow landed on a raised shield. */
  blocked?: boolean;
}

/** The player as seen by NPCs and enemies. */
export interface PlayerView {
  pos: THREE.Vector3;
  yaw: number;
  dead: boolean;
  mounted: boolean;
  /** True while a swing is in progress (shield-bearers react to it). */
  attacking: boolean;
  /** Returns false when the blow was avoided (dodge i-frames). */
  hurt(dmg: number, from: THREE.Vector3, knock?: number): boolean;
}

/**
 * Anything hostile the player fights: raiders (people) and beasts (hounds,
 * vultures). The HUD, minimap, music, sounds and the economy only use this.
 */
export interface Foe {
  readonly kind: string;
  readonly pos: THREE.Vector3;
  readonly dead: boolean;
  /** Fighting or hunting the player (not idle, not walking home). */
  readonly engaged: boolean;
  readonly hp: number;
  readonly maxHp: number;
  readonly title: string;
  readonly headY: number;
  readonly sinceHurt: number;
  readonly lastDamage: number;
  readonly telegraphing: boolean;
  readonly camp: string;
  readonly homePos: THREE.Vector3;
  readonly state: string;
  /** On foot and moving (footsteps), and whether fast. */
  readonly moving: boolean;
  readonly running: boolean;
  readonly flying: boolean;
  /** Projectile cylinder (see projectiles.ts). */
  readonly hitRadius: number;
  readonly hitLo: number;
  readonly hitHi: number;
  readonly root: THREE.Object3D;
  /** Night-only foes: away (dormant) by day. */
  readonly nightOnly: boolean;
  readonly dormant: boolean;
  setDormant(on: boolean): void;
  onKilled: (e: Foe) => void;
  damage(dmg: number, from: THREE.Vector3): HitResult;
  shot(dmg: number, from: THREE.Vector3, kind: 'arrow' | 'rock'): HitResult | null;
  reset(): void;
}
