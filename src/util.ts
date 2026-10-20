import type * as THREE from 'three';

/** Wrap an angle to (-PI, PI]. */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

/** Exponential shortest-angle approach of `a` toward `b`. */
export function dampAngle(a: number, b: number, rate: number, dt: number): number {
  const d = wrapAngle(b - a);
  return wrapAngle(a + d * (1 - Math.exp(-rate * dt)));
}

/** Shortest-angle approach with a maximum turn speed (rad/s). */
export function turnToward(a: number, b: number, maxRate: number, dt: number): number {
  const d = wrapAngle(b - a);
  const s = maxRate * dt;
  return wrapAngle(a + Math.max(-s, Math.min(s, d)));
}

/** Yaw that makes a +Z-facing model look from `from` toward `to`. */
export function angleTo(from: THREE.Vector3, to: THREE.Vector3): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fit a long body (camel, horse) to the ground: samples under its front/back
 * and left/right and returns the height plus pitch/roll for an Euler in 'YXZ'
 * order (yaw, then pitch about local X, then roll about local Z).
 */
export function fitGround(
  groundAt: (x: number, z: number) => number,
  x: number,
  z: number,
  yaw: number,
  halfLen: number,
  halfWidth: number,
): { y: number; pitch: number; roll: number } {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const lx = fz; // model's left (+X local) in world space
  const lz = -fx;
  const hf = groundAt(x + fx * halfLen, z + fz * halfLen);
  const hb = groundAt(x - fx * halfLen, z - fz * halfLen);
  const hl = groundAt(x + lx * halfWidth, z + lz * halfWidth);
  const hr = groundAt(x - lx * halfWidth, z - lz * halfWidth);
  return {
    y: Math.max(groundAt(x, z), (hf + hb) / 2, (hl + hr) / 2),
    pitch: -Math.atan2(hf - hb, 2 * halfLen),
    roll: Math.atan2(hl - hr, 2 * halfWidth),
  };
}
