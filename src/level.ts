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
  | 'enemy'
  | 'farmer'
  | 'prisoner';

export interface Spawn {
  role: SpawnRole;
  pos: Vec3;
  yaw: number;
  sitting?: boolean;
  /** Enemy spawns: raider | brute | skirmisher, grouped by camp. */
  kind?: string;
  camp?: string;
  /** Player arrival spawn: the map the player came from. */
  from?: string;
  /** Named enemy (e.g. "chief"). */
  title?: string;
  /** Marker id (bonfire, shopkeeper, quest_giver, pickup, chest, winged_horse). */
  id?: string;
  /** Chest: hidden off the beaten path. */
  secret?: boolean;
  /** Chest: buried in the sand (dig it up). */
  buried?: boolean;
  /** Enemy: only abroad at night. */
  night_only?: boolean;
  /** Enemy look/kind variant (hound: jackal | hyena; raider: himyar). */
  variant?: string;
  /** A named person (the poets of Ukaz), in English and Arabic. */
  name?: string;
  name_ar?: string;
  tribe?: string;
  /** A horse ridden by this horseman in the race. */
  racer?: string;
  /** A boss: a big health bar while fighting it. */
  boss?: boolean;
  /** Camel of the escort convoy. */
  convoy?: boolean;
  people?: string;
  /** Flying enemies (vultures): `pos` is already at flight height. */
  airborne?: boolean;
}

export interface Exit {
  /** Arabic label from the export. */
  label_ar?: string;
  to: string;
  pos: Vec3;
  radius: number;
  label: string;
}

export interface LevelData {
  name?: string;
  title?: string;
  terrain: string;
  town: string;
  backdrop?: string;
  backdrop_ground?: string;
  dressing?: string;
  exits?: Exit[];
  /** Flat water surfaces (Marib's reservoir): `level` is the surface height. */
  water?: { level: number; x: [number, number]; z: [number, number] }[];
  /** People of the map (lore.ts); optional. */
  culture?: string;
  /** This map is another state of `variant_of` (Marib after the flood). */
  variant_of?: string;
  /** Ukaz: inside this circle no one draws a weapon (the truce of the sacred months). */
  truce?: { center: Vec3; radius: number };
  bounds: { x: [number, number]; z: [number, number] };
  heights: { file: string; cols: number; rows: number; step: number; x0: number; z0: number };
  sun: { direction_to_sun: Vec3; color: string; elevation_deg: number };
  fog: { color: string; near: number; far: number };
  colliders: BoxCollider[];
  spawns: Spawn[];
  lights: { type: 'lamp' | 'fire'; pos: Vec3 }[];
  paths: Record<string, Vec3[]>;
  landmarks: Record<string, Vec3>;
  /** Landmark names in English and Arabic (minimap and full map). */
  landmark_names?: Record<string, { en: string; ar: string }>;
}

/** Bilinear sampler over the float32 heightfield (row = z, col = x). */
export class HeightField {
  constructor(
    private data: Float32Array,
    private meta: LevelData['heights'],
  ) {}

  /** Lowest sample in the field. */
  get min(): number {
    let m = Infinity;
    for (let i = 0; i < this.data.length; i++) if (this.data[i] < m) m = this.data[i];
    return m;
  }

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
