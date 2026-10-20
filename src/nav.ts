import type { BoxCollider } from './level';

/**
 * 1 m navigation grid over the playable bounds, rasterised from the level
 * boxes, with A* (8-connected) and line-of-sight path smoothing. Used by
 * guards, enemies and NPCs walking home so they route around walls and stalls
 * instead of grinding into them.
 */
export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  private blocked: Uint8Array;
  // A* scratch, reused between searches.
  private g: Float32Array;
  private parent: Int32Array;
  private stamp: Uint32Array;
  private closed: Uint32Array;
  private search = 0;
  private heap: Int32Array;
  private heapF: Float32Array;

  constructor(
    colliders: BoxCollider[],
    readonly x0: number,
    readonly z0: number,
    x1: number,
    z1: number,
    readonly cell = 1,
    pad = 0.45,
  ) {
    this.cols = Math.ceil((x1 - x0) / cell);
    this.rows = Math.ceil((z1 - z0) / cell);
    const n = this.cols * this.rows;
    this.blocked = new Uint8Array(n);
    this.g = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.heap = new Int32Array(n);
    this.heapF = new Float32Array(n);
    for (const b of colliders) this.rasterise(b, pad);
  }

  private rasterise(b: BoxCollider, pad: number): void {
    const c = Math.cos(b.yaw);
    const s = Math.sin(b.yaw);
    const hx = b.half[0] + pad;
    const hz = b.half[2] + pad;
    // World-space AABB of the rotated box.
    const ex = Math.abs(c) * hx + Math.abs(s) * hz;
    const ez = Math.abs(s) * hx + Math.abs(c) * hz;
    const c0 = Math.max(0, Math.floor((b.pos[0] - ex - this.x0) / this.cell));
    const c1 = Math.min(this.cols - 1, Math.floor((b.pos[0] + ex - this.x0) / this.cell));
    const r0 = Math.max(0, Math.floor((b.pos[2] - ez - this.z0) / this.cell));
    const r1 = Math.min(this.rows - 1, Math.floor((b.pos[2] + ez - this.z0) / this.cell));
    for (let r = r0; r <= r1; r++) {
      for (let col = c0; col <= c1; col++) {
        const dx = this.x0 + (col + 0.5) * this.cell - b.pos[0];
        const dz = this.z0 + (r + 0.5) * this.cell - b.pos[2];
        const lx = dx * c - dz * s;
        const lz = dx * s + dz * c;
        if (Math.abs(lx) <= hx && Math.abs(lz) <= hz) this.blocked[r * this.cols + col] = 1;
      }
    }
  }

  private idx(x: number, z: number): number {
    const c = Math.floor((x - this.x0) / this.cell);
    const r = Math.floor((z - this.z0) / this.cell);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }

  isBlocked(x: number, z: number): boolean {
    const i = this.idx(x, z);
    return i < 0 || this.blocked[i] === 1;
  }

  /** Grid line of sight (supercover walk). */
  lineClear(ax: number, az: number, bx: number, bz: number): boolean {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(d / (this.cell * 0.5));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      if (this.isBlocked(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }

  /** Nearest open cell centre to (x, z) within a few metres, or null. */
  nearestOpen(x: number, z: number): [number, number] | null {
    if (!this.isBlocked(x, z)) return [x, z];
    for (let r = 1; r <= 6; r++) {
      for (let a = 0; a < 16; a++) {
        const px = x + Math.cos((a / 16) * Math.PI * 2) * r * this.cell;
        const pz = z + Math.sin((a / 16) * Math.PI * 2) * r * this.cell;
        if (!this.isBlocked(px, pz)) return [px, pz];
      }
    }
    return null;
  }

  /**
   * A* from a to b. Returns smoothed waypoints (excluding the start), or null if
   * no route was found within `maxExpand` node expansions.
   */
  findPath(ax: number, az: number, bx: number, bz: number, maxExpand = 12000): [number, number][] | null {
    if (this.lineClear(ax, az, bx, bz)) return [[bx, bz]];
    const sOpen = this.nearestOpen(ax, az);
    const gOpen = this.nearestOpen(bx, bz);
    if (!sOpen || !gOpen) return null;
    const start = this.idx(sOpen[0], sOpen[1]);
    const goal = this.idx(gOpen[0], gOpen[1]);
    if (start < 0 || goal < 0) return null;
    const cols = this.cols;
    const gc = goal % cols;
    const gr = (goal / cols) | 0;
    const id = ++this.search;
    const h = (i: number) => {
      const dx = Math.abs((i % cols) - gc);
      const dz = Math.abs(((i / cols) | 0) - gr);
      return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz);
    };
    let heapN = 0;
    const push = (i: number, f: number) => {
      let k = heapN++;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (this.heapF[p] <= f) break;
        this.heap[k] = this.heap[p];
        this.heapF[k] = this.heapF[p];
        k = p;
      }
      this.heap[k] = i;
      this.heapF[k] = f;
    };
    const pop = (): number => {
      const top = this.heap[0];
      const li = this.heap[--heapN];
      const lf = this.heapF[heapN];
      let k = 0;
      for (;;) {
        let c = 2 * k + 1;
        if (c >= heapN) break;
        if (c + 1 < heapN && this.heapF[c + 1] < this.heapF[c]) c++;
        if (this.heapF[c] >= lf) break;
        this.heap[k] = this.heap[c];
        this.heapF[k] = this.heapF[c];
        k = c;
      }
      this.heap[k] = li;
      this.heapF[k] = lf;
      return top;
    };
    this.stamp[start] = id;
    this.g[start] = 0;
    this.parent[start] = -1;
    push(start, h(start));
    let expanded = 0;
    let found = false;
    while (heapN > 0) {
      const cur = pop();
      if (this.closed[cur] === id) continue;
      this.closed[cur] = id;
      if (cur === goal) {
        found = true;
        break;
      }
      if (++expanded > maxExpand) break;
      const cc = cur % cols;
      const cr = (cur / cols) | 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nc = cc + dx;
          const nr = cr + dz;
          if (nc < 0 || nr < 0 || nc >= cols || nr >= this.rows) continue;
          const ni = nr * cols + nc;
          if (this.blocked[ni] || this.closed[ni] === id) continue;
          // No corner cutting.
          if (dx && dz && (this.blocked[cr * cols + nc] || this.blocked[nr * cols + cc])) continue;
          const ng = this.g[cur] + (dx && dz ? Math.SQRT2 : 1);
          if (this.stamp[ni] !== id || ng < this.g[ni]) {
            this.stamp[ni] = id;
            this.g[ni] = ng;
            this.parent[ni] = cur;
            push(ni, ng + h(ni));
          }
        }
      }
    }
    if (!found) return null;
    const cellPts: [number, number][] = [];
    for (let i = goal; i !== -1; i = this.parent[i]) {
      cellPts.push([this.x0 + ((i % cols) + 0.5) * this.cell, this.z0 + (((i / cols) | 0) + 0.5) * this.cell]);
    }
    cellPts.reverse();
    cellPts[cellPts.length - 1] = [bx, bz];
    // String-pull: keep only the waypoints needed for line of sight.
    const out: [number, number][] = [];
    let ox = ax;
    let oz = az;
    let i = 0;
    while (i < cellPts.length) {
      let j = cellPts.length - 1;
      while (j > i && !this.lineClear(ox, oz, cellPts[j][0], cellPts[j][1])) j--;
      out.push(cellPts[j]);
      ox = cellPts[j][0];
      oz = cellPts[j][1];
      i = j + 1;
    }
    return out;
  }
}

/** Follows a NavGrid path toward a (possibly moving) goal, re-planning as needed. */
export class PathFollower {
  private pts: [number, number][] = [];
  private gx = Infinity;
  private gz = Infinity;
  private replan = 0;

  constructor(private nav: NavGrid) {}

  clear(): void {
    this.pts = [];
    this.gx = Infinity;
  }

  /**
   * Returns the unit direction to steer this frame toward (gx, gz), or null if
   * there is no route.
   */
  steer(x: number, z: number, gx: number, gz: number, dt: number): [number, number] | null {
    this.replan -= dt;
    const moved = Math.hypot(gx - this.gx, gz - this.gz);
    if (this.replan <= 0 || moved > 1.5 || this.pts.length === 0) {
      this.replan = 0.6 + Math.random() * 0.3;
      this.gx = gx;
      this.gz = gz;
      this.pts = this.nav.findPath(x, z, gx, gz) ?? [];
    }
    while (this.pts.length > 1 && Math.hypot(this.pts[0][0] - x, this.pts[0][1] - z) < 0.6) this.pts.shift();
    // Skip ahead when a later waypoint is directly visible.
    if (this.pts.length > 1 && this.nav.lineClear(x, z, this.pts[1][0], this.pts[1][1])) this.pts.shift();
    const p = this.pts[0];
    if (!p) return null;
    const dx = p[0] - x;
    const dz = p[1] - z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-3) return null;
    return [dx / d, dz / d];
  }
}
