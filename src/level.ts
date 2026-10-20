// Types and helpers for assets/level/level.json and heights.bin.
// Every position in level.json is already in three.js space (+Y up).

export type Vec3 = [number, number, number];

export interface BoxCollider {
  pos: Vec3;
  half: Vec3;
  yaw: number;
  tag: string;
}

export type SpawnRole =
  | 'player'
  | 'wanderer'
  | 'merchant'
  | 'sitter'
  | 'water_carrier'
  | 'guard'
  | 'priest'
  | 'camel'
  | 'horse'
  | 'enemy';

export interface Spawn {
  role: SpawnRole;
  pos: Vec3;
  yaw: number;
  sitting?: boolean;
  /** Enemy spawns: raider | brute | skirmisher, grouped by camp. */
  kind?: string;
  camp?: string;
}

export interface LevelData {
  bounds: { x: [number, number]; z: [number, number] };
  heights: { file: string; cols: number; rows: number; step: number; x0: number; z0: number };
  sun: { direction_to_sun: Vec3; color: string; elevation_deg: number };
  fog: { color: string; near: number; far: number };
  colliders: BoxCollider[];
  spawns: Spawn[];
  lights: { type: 'lamp' | 'fire'; pos: Vec3 }[];
  paths: Record<string, Vec3[]>;
  landmarks: Record<string, Vec3>;
}

/** Bilinear sampler over the float32 heightfield (row = z, col = x). */
export class HeightField {
  constructor(
    private data: Float32Array,
    private meta: LevelData['heights'],
  ) {}

  height(x: number, z: number): number {
    const { cols, rows, step, x0, z0 } = this.meta;
    const fx = Math.min(Math.max((x - x0) / step, 0), cols - 1.001);
    const fz = Math.min(Math.max((z - z0) / step, 0), rows - 1.001);
    const c = Math.floor(fx);
    const r = Math.floor(fz);
    const tx = fx - c;
    const tz = fz - r;
    const d = this.data;
    const i = r * cols + c;
    const h00 = d[i];
    const h10 = d[i + 1];
    const h01 = d[i + cols];
    const h11 = d[i + cols + 1];
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  }
}

/** 2D oriented boxes from level.json, used for cheap NPC path checks. */
export class Obstacles {
  private boxes: { x: number; z: number; hx: number; hz: number; c: number; s: number }[];

  constructor(colliders: BoxCollider[]) {
    this.boxes = colliders.map((b) => ({
      x: b.pos[0],
      z: b.pos[2],
      hx: b.half[0],
      hz: b.half[2],
      c: Math.cos(b.yaw),
      s: Math.sin(b.yaw),
    }));
  }

  /** True if (x, z) lies inside any box grown by `pad`. */
  blocked(x: number, z: number, pad = 0.4): boolean {
    for (const b of this.boxes) {
      const dx = x - b.x;
      const dz = z - b.z;
      // Rotate into box space (inverse of a yaw about +Y).
      const lx = dx * b.c - dz * b.s;
      const lz = dx * b.s + dz * b.c;
      if (Math.abs(lx) < b.hx + pad && Math.abs(lz) < b.hz + pad) return true;
    }
    return false;
  }

  clear(ax: number, az: number, bx: number, bz: number, pad = 0.4): boolean {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len / 0.5));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      if (this.blocked(ax + (bx - ax) * t, az + (bz - az) * t, pad)) return false;
    }
    return true;
  }
}
