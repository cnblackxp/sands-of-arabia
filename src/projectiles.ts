import * as THREE from 'three';
import type { HitResult } from './combat';
import { beam } from './markers';
import type { Physics } from './physics';

/**
 * Arrows (the player's bow) and thrown stones (slingers): ballistic flight under
 * gravity with collision against the level boxes, the ground and every living
 * target, plus the aim arc preview and arrow retrieval.
 *
 * An arrow that hits something stays there: in the ground, in a wall, or in a
 * body (it rides along with the body). Arrows in the ground, in walls and in
 * the fallen can be walked over to pick them up again.
 */

export const ARROW = { speed: 40, gravity: 12, life: 6, max: 10 };
export const ROCK = { speed: 17, gravity: 12 };

/** Something a projectile can hit: a vertical cylinder around `pos`. */
export interface ProjTarget {
  readonly pos: THREE.Vector3;
  readonly dead: boolean;
  /** Cylinder radius and its bottom / top relative to `pos.y`. */
  readonly hitRadius: number;
  readonly hitLo: number;
  readonly hitHi: number;
  /** Arrows that hit are parented here. */
  readonly root: THREE.Object3D;
  /** Returns null when the hit was dodged (roll i-frames). */
  shot(dmg: number, from: THREE.Vector3, kind: ShotKind): HitResult | null;
}

export type ShotKind = 'arrow' | 'rock';
export type Surface = 'flesh' | 'shield' | 'wall' | 'ground' | 'water';

interface Shot {
  kind: ShotKind;
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  from: THREE.Vector3;
  dmg: number;
  age: number;
  /** Who it may hit (the shooter's side is excluded). */
  side: 'player' | 'enemy';
  /** Targets that dodged it (it flies on past them). */
  ignore: Set<ProjTarget>;
}

interface Lying {
  mesh: THREE.Object3D;
  /** The body it is stuck in (collectable once it has fallen), or null. */
  in: ProjTarget | null;
  /** Pickup marker (a short light shaft and a glowing tip), once collectable. */
  marker?: THREE.Group;
}

/** Pale gold, like the other pickups' beams but shorter: "an arrow to take back". */
const MARK = { color: 0xffd98a, height: 2.4, radius: 0.16 };
const glowMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.9, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
const glowGeo = new THREE.SphereGeometry(0.07, 8, 6);

export interface ImpactEvent {
  kind: ShotKind;
  surface: Surface;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  target: ProjTarget | null;
  result: HitResult | null;
}

/** Low (flat) or high ballistic launch velocity from `a` to `b`, or null if out of range. */
export function solveBallistic(a: THREE.Vector3, b: THREE.Vector3, speed: number, g: number, high = false): THREE.Vector3 | null {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const dy = b.y - a.y;
  const h = Math.hypot(dx, dz);
  if (h < 1e-3) return new THREE.Vector3(0, Math.sign(dy) * speed, 0);
  const v2 = speed * speed;
  const disc = v2 * v2 - g * (g * h * h + 2 * dy * v2);
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  const ang = Math.atan2(v2 + (high ? root : -root), g * h);
  const c = Math.cos(ang);
  return new THREE.Vector3((dx / h) * speed * c, speed * Math.sin(ang), (dz / h) * speed * c);
}

/** Placeholder arrow: shaft along +Z, bronze tip at +Z, dark fletching at the back. */
function buildArrowGeometry(): THREE.BufferGeometry {
  const parts: [number, number, number, number, number, number, number][] = [
    // w, h, d, x, y, z, colour
    [0.018, 0.018, 0.68, 0, 0, 0, 0x8a6236],
    [0.034, 0.034, 0.07, 0, 0, 0.36, 0xb98a3e],
    [0.004, 0.06, 0.12, 0, 0, -0.29, 0x2a2420],
    [0.06, 0.004, 0.12, 0, 0, -0.29, 0x2a2420],
  ];
  const geos = parts.map(([w, h, d, x, y, z, c]) => {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    g.translate(x, y, z);
    const col = new THREE.Color(c);
    const n = g.getAttribute('position').count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set([col.r, col.g, col.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  });
  const out = new THREE.BufferGeometry();
  const cat = (k: string, size: number) => {
    const total = geos.reduce((s, g) => s + g.getAttribute(k).array.length, 0);
    const a = new Float32Array(total);
    let o = 0;
    for (const g of geos) {
      a.set(g.getAttribute(k).array as Float32Array, o);
      o += g.getAttribute(k).array.length;
    }
    out.setAttribute(k, new THREE.BufferAttribute(a, size));
  };
  cat('position', 3);
  cat('normal', 3);
  cat('color', 3);
  return out;
}

export class Projectiles {
  private shots: Shot[] = [];
  private lying: Lying[] = [];
  private readonly arrowGeo = buildArrowGeometry();
  private readonly arrowMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  private readonly rockGeo = new THREE.DodecahedronGeometry(0.085, 0);
  private readonly rockMat = new THREE.MeshStandardMaterial({ color: 0x8c7a62, roughness: 0.95, flatShading: true });
  /** Preview arc: dots along the path and a ring where it lands. */
  private readonly dots: THREE.InstancedMesh;
  private readonly ring: THREE.Mesh;
  private readonly tmpM = new THREE.Matrix4();
  private readonly tmpV = new THREE.Vector3();

  /** Everything that can be hit, per side. */
  targets: (side: 'player' | 'enemy') => ProjTarget[] = () => [];
  onImpact: (e: ImpactEvent) => void = () => {};
  onPickup: (n: number) => void = () => {};

  constructor(
    private scene: THREE.Scene,
    private physics: Physics,
    private ground: (x: number, z: number) => number,
    private arrowModel: THREE.Object3D | null,
    private rockModel: THREE.Object3D | null,
  ) {
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.85, depthTest: false, fog: false });
    this.dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 6, 4), dotMat, 90);
    this.dots.count = 0;
    this.dots.renderOrder = 20;
    this.dots.frustumCulled = false;
    scene.add(this.dots);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide, fog: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 24), ringMat);
    this.ring.renderOrder = 21;
    this.ring.visible = false;
    scene.add(this.ring);
  }

  private makeMesh(kind: ShotKind): THREE.Object3D {
    if (kind === 'arrow') {
      const m = this.arrowModel ? this.arrowModel.clone() : new THREE.Mesh(this.arrowGeo, this.arrowMat);
      m.traverse((o) => ((o as THREE.Mesh).castShadow = true));
      return m;
    }
    const m = this.rockModel ? this.rockModel.clone() : new THREE.Mesh(this.rockGeo, this.rockMat);
    m.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    return m;
  }

  fire(kind: ShotKind, from: THREE.Vector3, vel: THREE.Vector3, dmg: number, side: 'player' | 'enemy'): void {
    const mesh = this.makeMesh(kind);
    mesh.position.copy(from);
    this.orient(mesh, vel);
    this.scene.add(mesh);
    this.shots.push({ kind, mesh, pos: from.clone(), vel: vel.clone(), from: from.clone(), dmg, age: 0, side, ignore: new Set() });
  }

  private orient(mesh: THREE.Object3D, vel: THREE.Vector3): void {
    const d = this.tmpV.copy(vel).normalize();
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
  }

  /**
   * First thing hit on the segment a→b: a target, a level box, the ground.
   * Returns the fraction along the segment, or null.
   */
  private sweep(a: THREE.Vector3, b: THREE.Vector3, list: ProjTarget[], ignore?: Set<ProjTarget>): { t: number; surface: Surface; target: ProjTarget | null } | null {
    const seg = this.tmpV.copy(b).sub(a);
    const len = seg.length();
    if (len < 1e-5) return null;
    const dir = seg.clone().divideScalar(len);
    let best: { t: number; surface: Surface; target: ProjTarget | null } | null = null;
    // Level boxes.
    const toi = this.physics.rayStatic(a, dir, len);
    if (toi < len) best = { t: toi / len, surface: 'wall', target: null };
    // Ground: bisect the crossing.
    if (b.y < this.ground(b.x, b.z)) {
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 10; i++) {
        const m = (lo + hi) / 2;
        const x = a.x + seg.x * m;
        const z = a.z + seg.z * m;
        if (a.y + seg.y * m < this.ground(x, z)) hi = m;
        else lo = m;
      }
      if (!best || hi < best.t) best = { t: hi, surface: 'ground', target: null };
    }
    // Bodies: sample the segment finely enough not to skip a 0.3 m cylinder.
    const n = Math.max(1, Math.ceil(len / 0.15));
    const limit = best ? best.t : 1;
    for (const tg of list) {
      if (tg.dead || ignore?.has(tg)) continue;
      const r = tg.hitRadius;
      // Cheap reject: the segment's bounding box against the cylinder.
      if (Math.min(a.x, b.x) > tg.pos.x + r || Math.max(a.x, b.x) < tg.pos.x - r) continue;
      if (Math.min(a.z, b.z) > tg.pos.z + r || Math.max(a.z, b.z) < tg.pos.z - r) continue;
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        if (t > limit) break;
        const x = a.x + seg.x * t;
        const y = a.y + seg.y * t;
        const z = a.z + seg.z * t;
        if (Math.hypot(x - tg.pos.x, z - tg.pos.z) < r && y > tg.pos.y + tg.hitLo && y < tg.pos.y + tg.hitHi) {
          if (!best || t < best.t) best = { t, surface: 'flesh', target: tg };
          break;
        }
      }
    }
    return best;
  }

  update(dt: number, player: THREE.Vector3 | null): void {
    const a = new THREE.Vector3();
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.age += dt;
      const g = s.kind === 'arrow' ? ARROW.gravity : ROCK.gravity;
      a.copy(s.pos);
      s.vel.y -= g * dt;
      const b = s.pos.clone().addScaledVector(s.vel, dt);
      const list = this.targets(s.side);
      const hit = this.sweep(a, b, list, s.ignore);
      if (hit && this.impact(s, a.clone().lerp(b, hit.t), hit.surface, hit.target)) {
        this.shots.splice(i, 1);
        continue;
      }
      s.pos.copy(b);
      s.mesh.position.copy(b);
      if (s.kind === 'arrow') this.orient(s.mesh, s.vel);
      else s.mesh.rotation.x += dt * 9;
      if (s.age > ARROW.life || s.pos.y < -200) {
        s.mesh.removeFromParent();
        this.shots.splice(i, 1);
      }
    }
    if (player) this.collect(player);
  }

  /** Returns false when the shot carries on (the target dodged it). */
  private impact(s: Shot, p: THREE.Vector3, surface: Surface, target: ProjTarget | null): boolean {
    const dir = s.vel.clone().normalize();
    let result: HitResult | null = null;
    if (target) {
      result = target.shot(s.dmg, s.from, s.kind);
      if (!result) {
        // Rolled through it: it flies on.
        s.ignore.add(target);
        return false;
      }
      if (result.blocked) surface = 'shield';
    }
    this.onImpact({ kind: s.kind, surface, pos: p, dir, target, result });
    if (s.kind === 'rock' || surface === 'shield') {
      s.mesh.removeFromParent();
      if (s.kind === 'arrow') {
        // A deflected arrow drops at the foot of the shield-bearer.
        const at = p.clone();
        at.y = this.ground(at.x, at.z) + 0.03;
        this.layDown(s.mesh, at, dir);
      }
      return true;
    }
    // Arrows stay where they hit, tip buried a little.
    s.mesh.position.copy(p).addScaledVector(dir, surface === 'flesh' ? 0.12 : 0.18);
    this.orient(s.mesh, s.vel);
    // Arrows that hit the player are spent (they would otherwise ride along).
    if (target && result && !result.blocked && s.side === 'enemy') {
      s.mesh.removeFromParent();
      return true;
    }
    if (target && result && !result.blocked) {
      target.root.attach(s.mesh);
      this.lying.push({ mesh: s.mesh, in: target });
    } else {
      this.lying.push({ mesh: s.mesh, in: null });
    }
    return true;
  }

  private layDown(mesh: THREE.Object3D, at: THREE.Vector3, dir: THREE.Vector3): void {
    mesh.position.copy(at);
    const flat = new THREE.Vector3(dir.x, -0.15, dir.z).normalize();
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), flat);
    this.scene.add(mesh);
    this.lying.push({ mesh, in: null });
  }

  /** Walk over arrows to take them back (not out of a living body). */
  private collect(player: THREE.Vector3): void {
    let n = 0;
    this.markT += 1 / 60;
    for (let i = this.lying.length - 1; i >= 0; i--) {
      const l = this.lying[i];
      if (l.in && !l.in.dead) continue;
      const w = l.mesh.getWorldPosition(this.tmpV);
      this.mark(l, w);
      const dx = w.x - player.x;
      const dz = w.z - player.z;
      const dy = w.y - (player.y + 0.6);
      if (dx * dx + dz * dz < 1.3 * 1.3 && Math.abs(dy) < 1.6) {
        l.mesh.removeFromParent();
        l.marker?.removeFromParent();
        this.lying.splice(i, 1);
        n++;
      }
    }
    if (n) this.onPickup(n);
  }

  private markT = 0;

  /** Show (and keep in place) the pickup marker of a collectable arrow. */
  private mark(l: Lying, at: THREE.Vector3): void {
    if (!l.marker) {
      const g = new THREE.Group();
      g.add(beam(MARK.color, MARK.height, MARK.radius));
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.renderOrder = 16;
      g.add(glow);
      l.marker = g;
      this.scene.add(g);
    }
    const g = l.marker;
    // The shaft stands on the ground under the arrow; the glow sits on the arrow.
    const floor = Math.min(at.y, this.ground(at.x, at.z) + 0.02);
    g.position.set(at.x, floor, at.z);
    const glow = g.children[1];
    glow.position.y = at.y - floor;
    const pulse = 0.5 + 0.5 * Math.sin(this.markT * 4 + at.x);
    ((g.children[0] as THREE.Mesh).material as THREE.ShaderMaterial).uniforms.opacity.value = 0.32 + 0.18 * pulse;
    glow.scale.setScalar(0.8 + 0.5 * pulse);
  }

  /** Arrows still lying around (for the map / HUD). */
  get lyingCount(): number {
    return this.lying.length;
  }

  /** Remove arrows stuck in bodies that came back (bonfire rest resets enemies). */
  clearFromBodies(): void {
    this.lying = this.lying.filter((l) => {
      if (!l.in) return true;
      l.mesh.removeFromParent();
      l.marker?.removeFromParent();
      return false;
    });
  }

  /**
   * Draw the aim arc for a shot leaving `from` with `vel`. Returns where it lands
   * and what it would hit. Pass null to hide the preview.
   */
  preview(from: THREE.Vector3 | null, vel: THREE.Vector3 | null, side: 'player' | 'enemy' = 'player'): { pos: THREE.Vector3; target: ProjTarget | null } | null {
    if (!from || !vel) {
      this.dots.count = 0;
      this.ring.visible = false;
      return null;
    }
    const list = this.targets(side);
    const p = from.clone();
    const v = vel.clone();
    const step = 1 / 60;
    let travelled = 0;
    let nextDot = 0.4;
    let count = 0;
    let end: { pos: THREE.Vector3; target: ProjTarget | null; surface: Surface } | null = null;
    const b = new THREE.Vector3();
    for (let t = 0; t < 3.5 && count < 90; t += step) {
      v.y -= ARROW.gravity * step;
      b.copy(p).addScaledVector(v, step);
      const hit = this.sweep(p, b, list);
      if (hit) {
        end = { pos: p.clone().lerp(b, hit.t), target: hit.target, surface: hit.surface };
        break;
      }
      travelled += p.distanceTo(b);
      p.copy(b);
      while (travelled >= nextDot && count < 90) {
        // Dots shrink with distance along the arc.
        const k = Math.max(0.45, 1 - nextDot / 80);
        this.tmpM.makeScale(k, k, k).setPosition(p);
        this.dots.setMatrixAt(count++, this.tmpM);
        nextDot += 0.7;
      }
    }
    this.dots.count = count;
    this.dots.instanceMatrix.needsUpdate = true;
    if (end) {
      this.ring.visible = true;
      this.ring.position.copy(end.pos);
      if (end.surface === 'wall') {
        // Face back along the shot on walls.
        this.ring.lookAt(from);
      } else {
        this.ring.rotation.set(-Math.PI / 2, 0, 0);
        this.ring.position.y += 0.04;
      }
      (this.ring.material as THREE.MeshBasicMaterial).color.setHex(end.target ? 0xff5a3a : 0xffd27a);
      return { pos: end.pos, target: end.target };
    }
    this.ring.visible = false;
    return null;
  }

  dispose(): void {
    for (const s of this.shots) s.mesh.removeFromParent();
    for (const l of this.lying) {
      l.mesh.removeFromParent();
      l.marker?.removeFromParent();
    }
    this.shots = [];
    this.lying = [];
    this.dots.removeFromParent();
    this.ring.removeFromParent();
  }
}
