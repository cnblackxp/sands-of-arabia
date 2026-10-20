import type { HeightField, LevelData } from './level';

export interface MapMarker {
  x: number;
  z: number;
  kind: 'npc' | 'enemy' | 'hostile' | 'guard' | 'horse' | 'camel' | 'dead' | 'exit';
}

const PX_PER_M = 2;

const TAG_COLOUR: Record<string, string> = {
  building: '#8a5c3b',
  wall: '#5e3c25',
  stall: '#b5513f',
  palm: '#3f7a46',
  water: '#3d77b8',
  tent: '#3a2a26',
  rock: '#94603d',
};

const MARKER: Record<MapMarker['kind'], [string, number]> = {
  npc: ['#f3e6c8', 1.6],
  guard: ['#6ea0ff', 2.0],
  hostile: ['#ff5a3a', 2.2],
  enemy: ['#ff3a2a', 2.4],
  horse: ['#c58a4a', 2.2],
  camel: ['#d8b483', 2.2],
  dead: ['#6a5a50', 1.4],
  exit: ['#ffd04a', 3.6],
};

/** Corner minimap: pre-rendered terrain + colliders, rotated to the camera. */
export class Minimap {
  private base: HTMLCanvasElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private x0: number;
  private z0: number;
  mode: 0 | 1 | 2 = 0; // small, large, hidden
  private landmarks: [string, number, number][];

  constructor(root: HTMLElement, level: LevelData, heights: HeightField) {
    this.x0 = level.bounds.x[0];
    this.z0 = level.bounds.z[0];
    const w = (level.bounds.x[1] - level.bounds.x[0]) * PX_PER_M;
    const h = (level.bounds.z[1] - level.bounds.z[0]) * PX_PER_M;
    this.base = document.createElement('canvas');
    this.base.width = w;
    this.base.height = h;
    const b = this.base.getContext('2d')!;
    // Hill-shaded sand from the heightfield.
    const img = b.createImageData(w, h);
    const step = 1 / PX_PER_M;
    for (let py = 0; py < h; py++) {
      const z = this.z0 + py * step;
      for (let px = 0; px < w; px++) {
        const x = this.x0 + px * step;
        const hh = heights.height(x, z);
        const dx = heights.height(x + 1, z) - heights.height(x - 1, z);
        const dz = heights.height(x, z + 1) - heights.height(x, z - 1);
        const shade = Math.max(-0.35, Math.min(0.35, (-dx - dz) * 0.18));
        const k = 1 + shade + Math.min(0.12, hh * 0.004);
        const i = (py * w + px) * 4;
        img.data[i] = Math.min(255, 196 * k);
        img.data[i + 1] = Math.min(255, 150 * k);
        img.data[i + 2] = Math.min(255, 98 * k);
        img.data[i + 3] = 255;
      }
    }
    b.putImageData(img, 0, 0);
    // Level boxes as rotated rectangles.
    for (const c of level.colliders) {
      const cs = Math.cos(c.yaw);
      const sn = Math.sin(c.yaw);
      const corners = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([sx, sz]) => {
        const lx = sx * c.half[0];
        const lz = sz * c.half[2];
        // Rotation about +Y (three.js yaw).
        const wx = c.pos[0] + lx * cs + lz * sn;
        const wz = c.pos[2] - lx * sn + lz * cs;
        return [(wx - this.x0) * PX_PER_M, (wz - this.z0) * PX_PER_M];
      });
      b.fillStyle = TAG_COLOUR[c.tag] ?? '#7a5a40';
      b.beginPath();
      if (c.tag === 'palm') {
        b.arc((c.pos[0] - this.x0) * PX_PER_M, (c.pos[2] - this.z0) * PX_PER_M, 3.2, 0, Math.PI * 2);
      } else {
        corners.forEach(([x, y], i) => (i ? b.lineTo(x, y) : b.moveTo(x, y)));
        b.closePath();
      }
      b.fill();
    }
    this.landmarks = Object.entries(level.landmarks).map(([k, v]) => [k, v[0], v[2]]);

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minimap';
    root.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.applyMode();
  }

  dispose(): void {
    this.canvas.remove();
  }

  cycle(): void {
    this.mode = ((this.mode + 1) % 3) as 0 | 1 | 2;
    this.applyMode();
  }

  setVisible(on: boolean): void {
    this.canvas.style.visibility = on ? 'visible' : 'hidden';
  }

  private applyMode(): void {
    const size = this.mode === 1 ? 320 : 180;
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.canvas.width = size * dpr;
    this.canvas.height = size * dpr;
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    this.canvas.style.display = this.mode === 2 ? 'none' : '';
    this.canvas.classList.toggle('large', this.mode === 1);
  }

  draw(px: number, pz: number, playerYaw: number, camYaw: number, markers: MapMarker[]): void {
    if (this.mode === 2) return;
    const c = this.ctx;
    const W = this.canvas.width;
    const r = W / 2;
    const dpr = W / (this.mode === 1 ? 320 : 180);
    // Metres visible across the radius.
    const scale = (r / (this.mode === 1 ? 110 : 55)) / PX_PER_M;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, W, W);
    c.save();
    c.beginPath();
    c.arc(r, r, r - 2 * dpr, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = '#5a3f2a';
    c.fillRect(0, 0, W, W);
    // World → map: centre on the player, camera forward points up.
    c.translate(r, r);
    c.rotate(camYaw);
    c.scale(scale, scale);
    c.translate(-(px - this.x0) * PX_PER_M, -(pz - this.z0) * PX_PER_M);
    c.drawImage(this.base, 0, 0);
    const toMap = (x: number, z: number): [number, number] => [(x - this.x0) * PX_PER_M, (z - this.z0) * PX_PER_M];
    const unit = dpr / scale;
    for (const m of markers) {
      const [mx, my] = toMap(m.x, m.z);
      const [col, size] = MARKER[m.kind];
      c.fillStyle = col;
      c.beginPath();
      c.arc(mx, my, size * unit, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();

    // Landmark labels (kept upright).
    if (this.mode === 1) {
      c.font = `${11 * dpr}px Georgia, serif`;
      c.textAlign = 'center';
      for (const [name, lx, lz] of this.landmarks) {
        const dx = (lx - px) * PX_PER_M * scale;
        const dz = (lz - pz) * PX_PER_M * scale;
        const sx = r + dx * Math.cos(camYaw) - dz * Math.sin(camYaw);
        const sy = r + dx * Math.sin(camYaw) + dz * Math.cos(camYaw);
        if (Math.hypot(sx - r, sy - r) > r - 14 * dpr) continue;
        c.fillStyle = 'rgba(20,10,5,0.7)';
        c.fillText(name, sx + dpr, sy + dpr);
        c.fillStyle = '#ffe2b0';
        c.fillText(name, sx, sy);
      }
    }

    // Player arrow at the centre.
    const a = camYaw - playerYaw + Math.PI;
    c.save();
    c.translate(r, r);
    c.rotate(a);
    c.fillStyle = '#ffffff';
    c.strokeStyle = '#2a1a10';
    c.lineWidth = 1.5 * dpr;
    c.beginPath();
    c.moveTo(0, -7 * dpr);
    c.lineTo(5 * dpr, 6 * dpr);
    c.lineTo(0, 3 * dpr);
    c.lineTo(-5 * dpr, 6 * dpr);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
    // Rim + north marker.
    c.strokeStyle = '#8a5a2b';
    c.lineWidth = 3 * dpr;
    c.beginPath();
    c.arc(r, r, r - 2 * dpr, 0, Math.PI * 2);
    c.stroke();
    const na = camYaw; // world -Z (north) after rotation
    const nx = r + Math.sin(na) * (r - 11 * dpr);
    const ny = r - Math.cos(na) * (r - 11 * dpr);
    c.fillStyle = '#e3a443';
    c.font = `bold ${11 * dpr}px Georgia, serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('N', nx, ny);
    c.textBaseline = 'alphabetic';
  }
}
