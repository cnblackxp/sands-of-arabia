import type * as THREE from 'three';

/** What a sword blow did, for game-feel feedback. */
export interface HitResult {
  pos: THREE.Vector3;
  killed: boolean;
  /** True if the blow broke poise (the target flinched). */
  staggered: boolean;
}

/** The player as seen by NPCs and enemies. */
export interface PlayerView {
  pos: THREE.Vector3;
  yaw: number;
  dead: boolean;
  mounted: boolean;
  /** Returns false when the blow was avoided (dodge i-frames). */
  hurt(dmg: number, from: THREE.Vector3, knock?: number): boolean;
}
