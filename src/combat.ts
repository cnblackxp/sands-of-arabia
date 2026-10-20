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
