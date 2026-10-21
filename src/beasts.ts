import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Animator, ClipLibrary } from './animator';
import type { Foe, HitResult, PlayerView } from './combat';
import { FLASH, TELL, type Sfx } from './fx';
import { tOr } from './i18n';
import type { Spawn } from './level';
import { PathFollower } from './nav';
import { mulberry32, turnToward, wrapAngle } from './util';
import type { World } from './world';

/**
 * Beasts of the desert:
 * - **Desert hound** (saluki): runs you down, circles, then crouches (the tell)
 *   and lunges a few metres with a bite. Roll through the lunge, punish the
 *   landing.
 * - **Vulture**: circles overhead out of sword reach, screeches (the tell) and
 *   dives at you, then skims low for a moment, which is when a sword reaches it.
 *   Arrows reach it anywhere.
 *
 * - **Desert scorpion**: scuttles in close, raises its tail and claws (the
 *   tell), then stings at arm's length.
 * - **Horned viper**: lies coiled in the sand and never wanders. Come within a
 *   few metres and it rears and hisses (the tell), then strikes fast. It will
 *   not follow you far.
 *
 * Models come from characters/dog.glb, bird.glb, rat.glb, scorpion.glb and
 * viper.glb when they exist; until then each beast is a small procedural box
 * model in the same voxel style.
 */

export type BeastKind = 'hound' | 'vulture' | 'rat' | 'scorpion' | 'viper';
export const BEAST_KINDS: ReadonlySet<string> = new Set(['hound', 'vulture', 'rat', 'scorpion', 'viper']);

type Pose = 'idle' | 'walk' | 'run' | 'growl' | 'crouch' | 'lunge' | 'hit' | 'dead' | 'fly' | 'glide' | 'dive';

/** How a beast sounds from where the player stands. */
export type Ear = (p: THREE.Vector3) => { pan: number; gain: number };

// --- models ---------------------------------------------------------------------------

interface BeastModel {
  root: THREE.Object3D;
  /** Procedural placeholder (posed in code) or an authored GLB. */
  readonly proc: boolean;
  /** 0..1 wing-beat phase (downstroke at 0.25), when it flaps. */
  readonly beat?: number;
  pose(p: Pose, speed: number): void;
  update(dt: number): void;
  flash(kind: 'hit' | 'tell', secs: number): void;
}

const MATS = new Map<number, THREE.MeshStandardMaterial>();
function mat(c: number): THREE.MeshStandardMaterial {
  let m = MATS.get(c);
  if (!m) MATS.set(c, (m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true })));
  return m;
}
const BOXES = new Map<string, THREE.BoxGeometry>();
function boxGeo(w: number, h: number, d: number): THREE.BoxGeometry {
  const k = `${w},${h},${d}`;
  let g = BOXES.get(k);
  if (!g) BOXES.set(k, (g = new THREE.BoxGeometry(w, h, d)));
  return g;
}

/** Material-swap flash over every mesh of a model. */
class MeshFlash {
  private meshes: THREE.Mesh[] = [];
  private orig: (THREE.Material | THREE.Material[])[] = [];
  private t = 0;
  constructor(root: THREE.Object3D) {
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) this.meshes.push(o as THREE.Mesh);
    });
  }
  set(kind: 'hit' | 'tell', secs: number): void {
    if (this.t <= 0) this.orig = this.meshes.map((m) => m.material);
    const m = kind === 'hit' ? FLASH : TELL;
    for (const x of this.meshes) x.material = m;
    this.t = secs;
  }
  update(dt: number): void {
    if (this.t <= 0) return;
    this.t -= dt;
    if (this.t <= 0) this.meshes.forEach((m, i) => (m.material = this.orig[i]));
  }
}

function part(parent: THREE.Object3D, w: number, h: number, d: number, c: number, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(boxGeo(w, h, d), mat(c));
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function pivot(parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

/** Saluki-style sighthound in boxes: deep chest, thin waist, long legs and tail. */
class ProcHound implements BeastModel {
  root = new THREE.Group();
  readonly proc = true;
  private body: THREE.Group;
  private head: THREE.Group;
  private legs: THREE.Group[] = [];
  private tail: THREE.Group;
  private p: Pose = 'idle';
  private speed = 0;
  private t = Math.random() * 10;
  private fl: MeshFlash;
  constructor(coat: number) {
    const dark = 0x4a3426;
    this.body = pivot(this.root, 0, 0.56, 0);
    part(this.body, 0.26, 0.3, 0.42, coat, 0, 0.02, 0.12); // chest
    part(this.body, 0.2, 0.2, 0.38, coat, 0, 0.04, -0.24); // waist
    part(this.body, 0.27, 0.06, 0.08, 0x7b2a24, 0, 0.16, 0.36); // collar
    this.head = pivot(this.body, 0, 0.2, 0.36);
    part(this.head, 0.12, 0.16, 0.1, coat, 0, 0.06, 0.02); // neck
    part(this.head, 0.15, 0.13, 0.2, coat, 0, 0.16, 0.12);
    part(this.head, 0.08, 0.08, 0.16, dark, 0, 0.12, 0.28); // snout
    part(this.head, 0.05, 0.14, 0.05, dark, 0.06, 0.2, 0.06); // ears (feathered)
    part(this.head, 0.05, 0.14, 0.05, dark, -0.06, 0.2, 0.06);
    for (const [x, z] of [[0.09, 0.24], [-0.09, 0.24], [0.08, -0.36], [-0.08, -0.36]]) {
      const l = pivot(this.body, x, -0.08, z);
      part(l, 0.07, 0.5, 0.07, coat, 0, -0.24, 0);
      part(l, 0.08, 0.04, 0.1, dark, 0, -0.47, 0.02);
      this.legs.push(l);
    }
    this.tail = pivot(this.body, 0, 0.06, -0.42);
    part(this.tail, 0.05, 0.05, 0.4, coat, 0, -0.1, -0.16).rotation.x = 0.6;
    this.root.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    this.fl = new MeshFlash(this.root);
  }
  pose(p: Pose, speed: number): void {
    this.p = p;
    this.speed = speed;
  }
  flash(kind: 'hit' | 'tell', secs: number): void {
    this.fl.set(kind, secs);
  }
  update(dt: number): void {
    this.fl.update(dt);
    const p = this.p;
    const run = p === 'run' || p === 'walk';
    this.t += dt * (p === 'run' ? 2.2 + this.speed * 0.45 : p === 'walk' ? 5 : 2);
    const s = Math.sin(this.t);
    const c = Math.cos(this.t);
    const amp = p === 'run' ? 0.95 : p === 'walk' ? 0.45 : 0;
    // Gallop: front pair and hind pair in phase (a double-suspension gallop, simplified).
    this.legs[0].rotation.x = amp * s;
    this.legs[1].rotation.x = amp * Math.sin(this.t + 0.4);
    this.legs[2].rotation.x = -amp * Math.sin(this.t + 1.4);
    this.legs[3].rotation.x = -amp * Math.sin(this.t + 1.8);
    let y = 0.56;
    let pitch = 0;
    let headX = 0;
    if (run) {
      y += Math.abs(c) * (p === 'run' ? 0.08 : 0.02);
      pitch = p === 'run' ? s * 0.12 : 0;
    } else if (p === 'crouch' || p === 'growl') {
      y = p === 'crouch' ? 0.4 : 0.5;
      pitch = p === 'crouch' ? -0.12 : -0.06;
      headX = 0.25;
      for (const l of this.legs) l.rotation.x = 0;
      this.legs[2].rotation.x = this.legs[3].rotation.x = p === 'crouch' ? 0.7 : 0.2;
      this.legs[0].rotation.x = this.legs[1].rotation.x = p === 'crouch' ? -0.5 : 0;
    } else if (p === 'lunge') {
      pitch = 0.18;
      headX = -0.2;
      this.legs[0].rotation.x = this.legs[1].rotation.x = -1.1;
      this.legs[2].rotation.x = this.legs[3].rotation.x = 1.0;
    } else if (p === 'hit') {
      pitch = -0.25;
    } else if (p === 'dead') {
      y = 0.18;
      for (const l of this.legs) l.rotation.x = 0.2;
    }
    this.body.position.y += (y - this.body.position.y) * Math.min(1, dt * 14);
    this.body.rotation.x += (pitch - this.body.rotation.x) * Math.min(1, dt * 12);
    this.body.rotation.z += ((p === 'dead' ? Math.PI / 2 : 0) - this.body.rotation.z) * Math.min(1, dt * 6);
    this.head.rotation.x += (headX - this.head.rotation.x) * Math.min(1, dt * 12);
    this.tail.rotation.x = (run ? 0.3 : p === 'crouch' ? 0.5 : -0.1) + Math.sin(this.t * 0.7) * 0.15;
  }
}

/** Desert scorpion in boxes: a flat shell, pincers forward, the tail curled over its back. */
class ProcScorpion implements BeastModel {
  root = new THREE.Group();
  readonly proc = true;
  private body: THREE.Group;
  private claws: THREE.Group[] = [];
  private legs: THREE.Group[] = [];
  private tail: THREE.Group[] = [];
  private p: Pose = 'idle';
  private t = Math.random() * 10;
  private fl: MeshFlash;
  constructor() {
    const shell = 0x5a4026;
    const dark = 0x2e2014;
    const pale = 0x8a6a40;
    this.body = pivot(this.root, 0, 0.2, 0);
    part(this.body, 0.36, 0.12, 0.5, shell, 0, 0, 0);
    part(this.body, 0.26, 0.08, 0.16, dark, 0, 0.02, 0.3); // head
    for (const s of [-1, 1]) {
      const arm = pivot(this.body, 0.16 * s, 0, 0.3);
      part(arm, 0.07, 0.06, 0.26, shell, 0.04 * s, 0, 0.12);
      part(arm, 0.12, 0.08, 0.16, pale, 0.06 * s, 0, 0.3); // pincer
      this.claws.push(arm);
      for (let i = 0; i < 4; i++) {
        const l = pivot(this.body, 0.17 * s, -0.02, 0.14 - i * 0.12);
        part(l, 0.24, 0.04, 0.04, dark, 0.12 * s, -0.06, 0).rotation.z = -0.5 * s;
        this.legs.push(l);
      }
    }
    // Five tail segments, each hinged on the one before, then the sting.
    let prev: THREE.Object3D = this.body;
    for (let i = 0; i < 5; i++) {
      const seg = pivot(prev, 0, 0.02, i === 0 ? -0.25 : -0.14);
      part(seg, 0.12 - i * 0.01, 0.1, 0.14, i === 4 ? pale : shell, 0, 0, -0.07);
      this.tail.push(seg);
      prev = seg;
    }
    part(prev, 0.06, 0.06, 0.12, 0x1a120c, 0, -0.04, -0.17).rotation.x = 0.8;
    this.fl = new MeshFlash(this.root);
  }
  pose(p: Pose): void {
    this.p = p;
  }
  flash(kind: 'hit' | 'tell', secs: number): void {
    this.fl.set(kind, secs);
  }
  update(dt: number): void {
    this.fl.update(dt);
    const p = this.p;
    const moving = p === 'walk' || p === 'run';
    this.t += dt * (p === 'run' ? 16 : p === 'walk' ? 9 : 2);
    this.legs.forEach((l, i) => (l.rotation.y = moving ? Math.sin(this.t + i * 1.3 + (i >= 4 ? Math.PI : 0)) * 0.35 : 0));
    // The tail curls over the back, rises and trembles for the tell, and whips forward to sting.
    const ready = p === 'crouch' || p === 'growl';
    const curl = p === 'lunge' ? 0.95 : ready ? 0.72 + Math.sin(this.t * 9) * 0.04 : p === 'dead' ? 0.1 : 0.55 + Math.sin(this.t) * 0.03;
    for (const s of this.tail) s.rotation.x += (curl - s.rotation.x) * Math.min(1, dt * (p === 'lunge' ? 30 : 10));
    const open = ready || p === 'lunge' ? 0.7 : 0.35;
    this.claws.forEach((c, i) => (c.rotation.y += ((i === 0 ? open : -open) - c.rotation.y) * Math.min(1, dt * 10)));
    this.body.position.y = p === 'dead' ? 0.12 : 0.2 + (moving ? Math.abs(Math.sin(this.t * 2)) * 0.015 : 0);
    this.body.rotation.x = p === 'hit' ? -0.2 : p === 'crouch' ? 0.08 : 0;
    this.body.rotation.z += ((p === 'dead' ? Math.PI : 0) - this.body.rotation.z) * Math.min(1, dt * 6);
  }
}

/** Horned viper (Cerastes): sand-coloured, banded, a horn over each eye. */
class ProcViper implements BeastModel {
  root = new THREE.Group();
  readonly proc = true;
  private base: THREE.Group;
  private head: THREE.Group;
  private segs: THREE.Group[] = [];
  private p: Pose = 'idle';
  private t = Math.random() * 10;
  private fl: MeshFlash;
  constructor() {
    const sand = 0xc8a878;
    const band = 0x8a6a48;
    this.base = pivot(this.root, 0, 0.05, 0.3);
    this.head = pivot(this.base, 0, 0, 0);
    part(this.head, 0.11, 0.06, 0.14, sand, 0, 0.01, 0.07);
    for (const s of [-1, 1]) part(this.head, 0.02, 0.05, 0.02, band, 0.035 * s, 0.05, 0.09); // horns
    let prev: THREE.Object3D = this.base;
    for (let i = 0; i < 8; i++) {
      const seg = pivot(prev, 0, 0, i === 0 ? 0 : -0.12);
      part(seg, 0.09 - i * 0.006, 0.07 - i * 0.004, 0.13, i % 2 ? band : sand, 0, 0, -0.06);
      this.segs.push(seg);
      prev = seg;
    }
    this.fl = new MeshFlash(this.root);
  }
  pose(p: Pose): void {
    this.p = p;
  }
  flash(kind: 'hit' | 'tell', secs: number): void {
    this.fl.set(kind, secs);
  }
  update(dt: number): void {
    this.fl.update(dt);
    const p = this.p;
    const moving = p === 'walk' || p === 'run';
    this.t += dt * (p === 'run' ? 12 : p === 'walk' ? 7 : 1.5);
    const k = Math.min(1, dt * (p === 'lunge' ? 30 : 10));
    // Coiled at rest, an S-wave when it moves, reared for the tell, stretched for the strike.
    this.segs.forEach((s, i) => {
      const yaw = moving ? Math.sin(this.t - i * 0.9) * 0.4 : p === 'lunge' || p === 'dead' ? 0 : p === 'crouch' || p === 'growl' ? (i < 3 ? 0 : 0.6) : 0.62 + i * 0.07;
      s.rotation.y += (yaw - s.rotation.y) * k;
      const pitch = (p === 'crouch' || p === 'growl') && i < 2 ? (i === 0 ? -0.9 : 0.9) : 0;
      s.rotation.x += (pitch - s.rotation.x) * k;
    });
    const rear = p === 'crouch' || p === 'growl';
    const y = rear ? 0.24 + Math.sin(this.t * 6) * 0.01 : p === 'lunge' ? 0.12 : 0.05;
    const z = p === 'lunge' ? 0.62 : 0.3;
    this.base.position.y += (y - this.base.position.y) * k;
    this.base.position.z += (z - this.base.position.z) * k;
    this.head.rotation.z = p === 'dead' ? Math.PI / 2 : 0;
  }
}

/** Lappet-faced vulture: dark brown wings, a pale ruff, a bare pink head. */
class ProcVulture implements BeastModel {
  root = new THREE.Group();
  readonly proc = true;
  private body: THREE.Group;
  private wingL: THREE.Group;
  private wingR: THREE.Group;
  private tipL: THREE.Group;
  private tipR: THREE.Group;
  private legs: THREE.Group;
  private p: Pose = 'fly';
  private t = Math.random() * 10;
  private fl: MeshFlash;
  constructor() {
    const brown = 0x3b2a20;
    const dark = 0x231a15;
    this.body = pivot(this.root, 0, 0, 0);
    part(this.body, 0.3, 0.26, 0.62, brown, 0, 0, 0);
    part(this.body, 0.26, 0.12, 0.14, 0xe9dfc8, 0, 0.1, 0.3); // ruff
    part(this.body, 0.12, 0.12, 0.2, 0xc98a7a, 0, 0.14, 0.44); // bare head
    part(this.body, 0.06, 0.07, 0.1, 0xd9c9a0, 0, 0.11, 0.58); // beak
    part(this.body, 0.26, 0.04, 0.3, dark, 0, -0.02, -0.44); // tail
    this.wingL = pivot(this.body, 0.14, 0.06, 0.04);
    part(this.wingL, 0.56, 0.04, 0.42, brown, 0.28, 0, 0);
    this.tipL = pivot(this.wingL, 0.56, 0, 0);
    part(this.tipL, 0.42, 0.03, 0.32, dark, 0.2, 0, -0.04);
    this.wingR = pivot(this.body, -0.14, 0.06, 0.04);
    part(this.wingR, 0.56, 0.04, 0.42, brown, -0.28, 0, 0);
    this.tipR = pivot(this.wingR, -0.56, 0, 0);
    part(this.tipR, 0.42, 0.03, 0.32, dark, -0.2, 0, -0.04);
    this.legs = pivot(this.body, 0, -0.12, 0.05);
    part(this.legs, 0.05, 0.2, 0.05, 0xd9c9a0, 0.07, -0.08, 0);
    part(this.legs, 0.05, 0.2, 0.05, 0xd9c9a0, -0.07, -0.08, 0);
    this.fl = new MeshFlash(this.root);
  }
  pose(p: Pose): void {
    this.p = p;
  }
  flash(kind: 'hit' | 'tell', secs: number): void {
    this.fl.set(kind, secs);
  }
  /** 0..1 phase of the wing beat (downstroke at 0.25) for sound sync. */
  get beat(): number {
    return ((this.t / (Math.PI * 2)) % 1 + 1) % 1;
  }
  update(dt: number): void {
    this.fl.update(dt);
    const p = this.p;
    const flapping = p === 'fly' || p === 'hit';
    this.t += dt * (flapping ? 9 : p === 'dive' ? 2 : 1.2);
    let a: number;
    let tip = 0;
    if (p === 'dead') a = -0.2;
    else if (p === 'dive') a = 0.95; // wings folded up and back
    else if (p === 'glide') a = 0.05 + Math.sin(this.t) * 0.05;
    else {
      a = Math.sin(this.t) * 0.75;
      tip = Math.sin(this.t - 0.8) * 0.4;
    }
    this.wingL.rotation.z = a;
    this.wingR.rotation.z = -a;
    this.tipL.rotation.z = tip;
    this.tipR.rotation.z = -tip;
    this.wingL.rotation.y = p === 'dive' ? -0.7 : 0;
    this.wingR.rotation.y = p === 'dive' ? 0.7 : 0;
    // Talons forward on the dive.
    this.legs.rotation.x = p === 'dive' ? -1.1 : 0.4;
    const pitch = p === 'dive' ? 0.5 : p === 'dead' ? 0 : -0.05;
    this.body.rotation.x += (pitch - this.body.rotation.x) * Math.min(1, dt * 8);
  }
}

/** A beast loaded from dog.glb / bird.glb (clips mapped onto poses). */
class GlbBeast implements BeastModel {
  root: THREE.Object3D;
  readonly proc = false;
  private anim: Animator;
  private fl: MeshFlash;
  private names: Record<Pose, string>;
  constructor(src: GLTF, flying: boolean, coat?: number) {
    this.root = SkeletonUtils.clone(src.scene);
    // Coat variety: each hound gets its own copy of the coat material.
    if (coat !== undefined)
      this.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        const swap = mats.map((x) => {
          if (x.name !== 'D_Coat') return x;
          const c = (x as THREE.MeshStandardMaterial).clone();
          c.color.setHex(coat);
          return c;
        });
        m.material = Array.isArray(m.material) ? swap : swap[0];
      });
    const names = src.animations.map((c) => c.name);
    const once = ['Lunge', 'Bite', 'Hit', 'Death', 'Dive'].filter((n) => names.includes(n));
    this.anim = new Animator(this.root, new ClipLibrary(src.animations, [], null, once));
    const has = (n: string, alt: string) => (names.includes(n) ? n : alt);
    this.names = flying
      ? { idle: 'Glide', walk: 'Fly', run: 'Fly', growl: 'Fly', crouch: 'Fly', lunge: 'Dive', hit: has('Hit', 'Fly'), dead: has('Death', 'Glide'), fly: 'Fly', glide: has('Glide', 'Fly'), dive: has('Dive', 'Fly') }
      : { idle: 'Idle', walk: has('Walk', 'Idle'), run: has('Run', 'Walk'), growl: has('Growl', 'Idle'), crouch: has('Growl', 'Idle'), lunge: has('Lunge', 'Run'), hit: has('Hit', 'Idle'), dead: has('Death', 'Idle'), fly: 'Run', glide: 'Run', dive: 'Run' };
    this.root.traverse((o) => {
      (o as THREE.Mesh).castShadow = true;
      // Skinned bounds are the bind pose: don't let a gallop or a dive pop out of view.
      o.frustumCulled = false;
    });
    this.fl = new MeshFlash(this.root);
    this.anim.setBase(this.names[flying ? 'fly' : 'idle'], 1, 0);
  }
  get beat(): number {
    return this.anim.base === 'Fly' ? (this.anim.baseTime() % 0.5) / 0.5 : 0;
  }
  pose(p: Pose, speed: number): void {
    const n = this.names[p];
    const restart = p === 'lunge' || p === 'hit' || p === 'dive';
    // Lunge: the 0.71 s clip squeezed into the 0.42 s leap plus landing.
    const ts = p === 'run' ? Math.max(0.6, speed / 7) : p === 'walk' ? Math.max(0.5, speed / 1.6) : p === 'lunge' ? 1.35 : 1;
    if (this.anim.base !== n || restart) this.anim.setBase(n, ts, 0.1, restart && this.anim.base === n);
    else this.anim.setBase(n, ts, 0.1);
  }
  flash(kind: 'hit' | 'tell', secs: number): void {
    this.fl.set(kind, secs);
  }
  update(dt: number): void {
    this.fl.update(dt);
    this.anim.update(dt);
  }
}

// --- the beast itself ----------------------------------------------------------------------

interface BeastDef {
  title: string;
  hp: number;
  sight: number;
  walk: number;
  run: number;
  dmg: number;
  knock: number;
  /** Telegraph before the lunge / dive (s). */
  tell: number;
  cooldown: [number, number];
  /** Body size relative to the hound (model scale, lunge reach). */
  size?: number;
  /** Coat colour (hound-model beasts). */
  coat?: number;
  /** Its own strike instead of the hound's leap (scaled by size): speed, hop, range, reach and the closest it strikes from. */
  lunge?: { speed: number; hop: number; range: number; reach: number; min: number };
  /** How far from home it hunts (m). */
  leash?: number;
  /** Circling distance while it waits for an opening (m). */
  circle?: number;
  /** Lies in wait: never wanders from its spot. */
  ambush?: boolean;
  /** Low to the ground: a shorter target, and its bar sits lower. */
  low?: boolean;
}

const DEFS: Record<BeastKind, BeastDef> = {
  hound: { title: 'Desert Hound', hp: 55, sight: 18, walk: 1.6, run: 7.2, dmg: 14, knock: 1.8, tell: 0.45, cooldown: [1.4, 2.8] },
  rat: { title: 'Rat', hp: 12, sight: 10, walk: 1.2, run: 6.5, dmg: 5, knock: 0.4, tell: 0.25, cooldown: [0.9, 1.8], size: 0.36, coat: 0x6b625a },
  vulture: { title: 'Vulture', hp: 40, sight: 16, walk: 4, run: 7, dmg: 11, knock: 1.2, tell: 0.6, cooldown: [2.4, 4.2] },
  scorpion: {
    title: 'Desert Scorpion',
    hp: 34,
    sight: 9,
    walk: 0.9,
    run: 3.4,
    dmg: 16,
    knock: 0.6,
    tell: 0.45,
    cooldown: [1.2, 2.2],
    lunge: { speed: 7, hop: 0, range: 3, reach: 1.25, min: 0.5 },
    leash: 22,
    circle: 2.2,
    low: true,
  },
  viper: {
    title: 'Horned Viper',
    hp: 18,
    sight: 5.5,
    walk: 0.8,
    run: 2.6,
    dmg: 20,
    knock: 0.5,
    tell: 0.32,
    cooldown: [1.4, 2.4],
    lunge: { speed: 12, hop: 0.12, range: 3.2, reach: 1.05, min: 0.4 },
    leash: 9,
    circle: 2.4,
    ambush: true,
    low: true,
  },
};

const LUNGE = { speed: 11, time: 0.42, hop: 0.55, range: 6.2, reach: 1.15 };

/** Hound variants from level.json (`variant`). */
const VARIANTS: Record<string, BeastDef> = {
  jackal: { title: 'Jackal', hp: 40, sight: 16, walk: 1.6, run: 7.6, dmg: 10, knock: 1.4, tell: 0.4, cooldown: [1.2, 2.4], size: 0.82, coat: 0xb89a6a },
  hyena: { title: 'Striped Hyena', hp: 85, sight: 14, walk: 1.4, run: 6.4, dmg: 18, knock: 2.2, tell: 0.5, cooldown: [1.6, 3], size: 1.12, coat: 0x8a7a5a },
};
const ORBIT = { radius: 7.5, alt: 5.2, homeAlt: 9, speed: 0.75 };
const DIVE = { speed: 13, turn: 1.6, reach: 1.15, maxT: 1.5, low: 0.8 };
const LEASH = 45;

type BState = 'idle' | 'alert' | 'chase' | 'circle' | 'tell' | 'lunge' | 'recover' | 'dive' | 'skim' | 'climb' | 'stagger' | 'return' | 'falling' | 'dead';

export class Beast implements Foe {
  readonly pos = new THREE.Vector3();
  readonly def: BeastDef;
  readonly model: BeastModel;
  yaw: number;
  hp: number;
  state: BState = 'idle';
  sinceHurt = 99;
  lastDamage = 0;
  onKilled: (e: Foe) => void = () => {};
  private home: THREE.Vector3;
  private homeYaw: number;
  private timer = 0;
  private cooldown = 0;
  private struck = false;
  private dir = new THREE.Vector3();
  private vy = 0;
  private speed = 0;
  private orbitA = 0;
  private orbitSide = 1;
  private follow: PathFollower;
  private rnd: () => number;
  private knock = new THREE.Vector3();
  private nextBark = 2;
  private lastBeat = 0;
  private groundY = 0;
  private wanderT = 2;
  private wander: THREE.Vector3 | null = null;
  /** Its leap or strike (the def's own, or the hound's scaled by size). */
  private lg: { speed: number; hop: number; range: number; reach: number; min: number };
  private leash: number;

  constructor(
    readonly kind: BeastKind,
    spawn: Spawn,
    readonly camp: string,
    private world: World,
    private sfx: Sfx,
    private ear: Ear,
    model: GLTF | null,
    seed: number,
    /** The model is already the right size (rat.glb): no scaling, no coat change. */
    nativeModel = false,
  ) {
    this.variant = kind === 'hound' && spawn.variant && VARIANTS[spawn.variant] ? spawn.variant : null;
    this.def = this.variant ? VARIANTS[this.variant] : DEFS[kind];
    this.size = nativeModel ? 1 : this.def.size ?? 1;
    this.nightOnly = !!spawn.night_only;
    this.hp = this.def.hp;
    this.rnd = mulberry32(seed);
    this.pos.set(...spawn.pos);
    this.groundY = world.floor(this.pos.x, this.pos.z, spawn.pos[1]);
    if (kind === 'vulture') this.pos.y = spawn.airborne ? Math.max(spawn.pos[1], this.groundY + 4) : this.groundY + ORBIT.homeAlt;
    else this.pos.y = this.groundY;
    this.yaw = spawn.yaw;
    this.home = this.pos.clone();
    this.homeYaw = spawn.yaw;
    this.follow = new PathFollower(world.nav);
    this.orbitA = this.rnd() * Math.PI * 2;
    this.orbitSide = this.rnd() < 0.5 ? -1 : 1;
    const coats = [0xc9a56b, 0xd9c09a, 0x8a5a33, 0xe8dcc8];
    const coat = this.def.coat ?? coats[Math.floor(this.rnd() * coats.length)];
    const fourLegged = kind !== 'vulture';
    this.model = model
      ? new GlbBeast(model, !fourLegged, fourLegged && !nativeModel ? coat : undefined)
      : kind === 'scorpion'
        ? new ProcScorpion()
        : kind === 'viper'
          ? new ProcViper()
          : fourLegged
            ? new ProcHound(coat)
            : new ProcVulture();
    if (this.size !== 1) this.model.root.scale.setScalar(this.size);
    const k = this.size;
    this.lg = this.def.lunge ?? { speed: LUNGE.speed * Math.max(0.55, k), hop: LUNGE.hop * k, range: LUNGE.range * Math.max(0.5, k), reach: LUNGE.reach * Math.max(0.7, k), min: 2 * Math.min(1, k + 0.2) };
    this.leash = this.def.leash ?? LEASH;
    this.model.pose(kind === 'vulture' ? 'glide' : 'idle', 0);
    this.sync();
  }

  get dead(): boolean {
    return this.dormant || this.state === 'dead' || this.state === 'falling';
  }
  /** Jackal / hyena (hounds), or null. */
  readonly variant: string | null;
  readonly size: number;
  readonly nightOnly: boolean;
  dormant = false;
  setDormant(on: boolean): void {
    if (on === this.dormant) return;
    if (!on) this.reset();
    this.dormant = on;
    this.model.root.visible = !on;
  }
  get engaged(): boolean {
    return !this.dead && this.state !== 'idle' && this.state !== 'return';
  }
  get maxHp(): number {
    return this.def.hp;
  }
  get title(): string {
    return tOr(`enemies.${this.variant ?? this.kind}`, this.def.title);
  }
  get headY(): number {
    return this.pos.y + (this.flying ? 0.6 : this.def.low ? 0.55 : 1.0);
  }
  get telegraphing(): boolean {
    return this.state === 'tell';
  }
  get homePos(): THREE.Vector3 {
    return this.home;
  }
  get flying(): boolean {
    return this.kind === 'vulture';
  }
  get moving(): boolean {
    return !this.flying && !this.dead && this.speed > 0.3;
  }
  get running(): boolean {
    return this.speed > 3;
  }
  get hitRadius(): number {
    return this.flying ? 0.75 : 0.42 * Math.max(0.6, this.size);
  }
  get hitLo(): number {
    return this.flying ? -0.3 : 0.15 * this.size;
  }
  get hitHi(): number {
    return this.flying ? 0.35 : (this.def.low ? 0.6 : 0.95) * this.size;
  }
  get root(): THREE.Object3D {
    return this.model.root;
  }
  get bodyRadius(): number {
    return 0.45;
  }

  reset(): void {
    this.hp = this.def.hp;
    this.pos.copy(this.home);
    this.yaw = this.homeYaw;
    this.state = 'idle';
    this.sinceHurt = 99;
    this.knock.set(0, 0, 0);
    this.vy = 0;
    this.speed = 0;
    this.model.pose(this.flying ? 'glide' : 'idle', 0);
    this.model.root.rotation.set(0, this.yaw, 0);
    this.model.pose(this.flying ? 'glide' : 'idle', 0);
    this.follow.clear();
    this.sync();
  }

  private sound(fn: (pan: number, gain: number) => void): void {
    const e = this.ear(this.pos);
    if (e.gain > 0.02) fn(e.pan, e.gain);
  }

  /** A four-legged beast's voice: hounds growl and bark, scorpions click, vipers hiss. */
  private say(what: 'growl' | 'bark' | 'snarl' | 'yelp' | 'die' | 'bite', loud = 1): void {
    this.sound((p, g) => {
      g *= loud;
      if (this.kind === 'scorpion') {
        if (what === 'bite') this.sfx.sting(p, g);
        else if (what !== 'bark') this.sfx.scorpionClick(p, what === 'die' ? g * 1.3 : g);
      } else if (this.kind === 'viper') {
        if (what === 'bite') this.sfx.sting(p, g * 0.7);
        else if (what !== 'bark') this.sfx.hiss(p, g, what === 'growl' || what === 'die');
      } else if (what === 'growl') this.sfx.houndGrowl(p, g);
      else if (what === 'bark') this.sfx.houndBark(p, g);
      else if (what === 'snarl') this.sfx.houndSnarl(p, g);
      else if (what === 'bite') this.sfx.bite(p, g);
      else this.sfx.houndYelp(p, g, what === 'die');
    });
  }

  private setState(s: BState, timer = 0): void {
    this.state = s;
    this.timer = timer;
  }

  damage(dmg: number, from: THREE.Vector3): HitResult {
    const res: HitResult = { pos: this.pos.clone().setY(this.pos.y + (this.flying ? 0 : 0.6)), killed: false, staggered: true };
    if (this.dead) return res;
    this.hp -= dmg;
    this.lastDamage = this.sinceHurt < 1.5 ? this.lastDamage + dmg : dmg;
    this.sinceHurt = 0;
    this.model.flash('hit', 0.09);
    const away = this.pos.clone().sub(from).setY(0);
    if (away.lengthSq() < 1e-4) away.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    away.normalize();
    if (this.hp <= 0) {
      this.hp = 0;
      this.knock.copy(away).multiplyScalar(this.flying ? 2 : 4);
      if (this.flying) {
        this.vy = 1;
        this.setState('falling');
        this.model.pose('dead', 0);
        this.sound((p, g) => this.sfx.vultureCry(p, g, true));
      } else {
        this.setState('dead');
        this.model.pose('dead', 0);
        this.say('die');
      }
      res.killed = true;
      this.onKilled(this);
      return res;
    }
    this.knock.copy(away).multiplyScalar(this.flying ? 2.5 : 3.5);
    if (this.flying) this.sound((p, g) => this.sfx.vultureCry(p, g, false));
    else this.say('yelp');
    // A blow knocks it out of its lunge or dive.
    this.setState('stagger', this.flying ? 0.55 : 0.4);
    this.model.pose('hit', 0);
    this.cooldown = Math.max(this.cooldown, 0.8);
    return res;
  }

  shot(dmg: number, from: THREE.Vector3): HitResult | null {
    return this.damage(dmg, from);
  }

  update(dt: number, player: PlayerView, distToPlayer: number): void {
    this.sinceHurt += dt;
    this.cooldown -= dt;
    if (this.flying) this.updateVulture(dt, player, distToPlayer);
    else this.updateHound(dt, player, distToPlayer);
    // Knockback.
    if (this.knock.lengthSq() > 1e-4 && this.state !== 'dead') {
      this.step(this.knock.x * dt, this.knock.z * dt);
      this.knock.multiplyScalar(Math.max(0, 1 - dt * 6));
    }
    this.sync();
    // Far beasts animate less often.
    if (distToPlayer < 60 || Math.random() < 0.2) this.model.update(dt);
  }

  private playerHere(player: PlayerView): boolean {
    return !player.dead && Math.hypot(player.pos.x - this.home.x, player.pos.z - this.home.z) < this.leash;
  }

  // --- hound ---------------------------------------------------------------------------

  private updateHound(dt: number, player: PlayerView, dist: number): void {
    const d = this.def;
    const pp = player.pos;
    const toPlayer = Math.atan2(pp.x - this.pos.x, pp.z - this.pos.z);
    const fromHome = Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z);
    switch (this.state) {
      case 'idle': {
        this.wanderT -= dt;
        if (this.wander) {
          if (this.moveToward(this.wander.x, this.wander.z, d.walk, dt) < 0.4) {
            this.wander = null;
            this.speed = 0;
            this.model.pose('idle', 0);
          } else this.model.pose('walk', d.walk);
        } else if (this.wanderT <= 0 && !d.ambush) {
          this.wanderT = 3 + this.rnd() * 5;
          const a = this.rnd() * Math.PI * 2;
          const tx = this.home.x + Math.sin(a) * 3;
          const tz = this.home.z + Math.cos(a) * 3;
          if (!this.world.nav.isBlocked(tx, tz)) this.wander = new THREE.Vector3(tx, 0, tz);
        }
        if (dist < d.sight && this.playerHere(player)) {
          this.wander = null;
          this.setState('alert', 0.5 + this.rnd() * 0.3);
          this.speed = 0;
          this.model.pose('growl', 0);
          this.say('growl');
        }
        break;
      }
      case 'alert':
        this.timer -= dt;
        this.yaw = turnToward(this.yaw, toPlayer, 6, dt);
        if (this.timer <= 0) {
          this.setState('chase');
          this.say('bark');
        }
        break;
      case 'chase':
      case 'circle': {
        if (!this.playerHere(player) || fromHome > this.leash) {
          this.setState('return');
          this.follow.clear();
          break;
        }
        this.nextBark -= dt;
        if (this.nextBark <= 0) {
          this.nextBark = 2.5 + this.rnd() * 4;
          this.say('bark', 0.8);
        }
        const clear = this.world.nav.lineClear(this.pos.x, this.pos.z, pp.x, pp.z);
        if (this.cooldown <= 0 && dist < this.lg.range && dist > this.lg.min && clear) {
          this.setState('tell', d.tell);
          this.speed = 0;
          this.model.pose('crouch', 0);
          this.model.flash('tell', 0.16);
          this.say('growl', 1.2);
          break;
        }
        const cr = d.circle ?? 4.6;
        if (dist > cr + 2.9) {
          this.state = 'chase';
          this.moveToward(pp.x, pp.z, d.run, dt, 4);
          this.model.pose('run', d.run);
        } else {
          // Circle at a few metres, waiting for the opening.
          this.state = 'circle';
          this.orbitA += this.orbitSide * dt * 0.9;
          const r = cr;
          const tx = pp.x + Math.sin(this.orbitA) * r;
          const tz = pp.z + Math.cos(this.orbitA) * r;
          const left = this.moveToward(tx, tz, d.run * 0.55, dt, 0, false);
          this.yaw = turnToward(this.yaw, toPlayer, 7, dt);
          this.model.pose(left > 0.5 ? 'run' : 'growl', d.run * 0.55);
          // Re-sync the orbit angle with where it actually is.
          this.orbitA += wrapAngle(Math.atan2(this.pos.x - pp.x, this.pos.z - pp.z) - this.orbitA) * 0.05;
        }
        break;
      }
      case 'tell':
        this.timer -= dt;
        this.yaw = turnToward(this.yaw, toPlayer, 8, dt);
        if (this.timer <= 0) {
          // Leap at where the player is now; it does not steer in the air.
          this.dir.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
          this.setState('lunge', LUNGE.time);
          this.struck = false;
          this.model.pose('lunge', LUNGE.speed);
          this.say('snarl');
        }
        break;
      case 'lunge': {
        this.timer -= dt;
        const u = 1 - this.timer / LUNGE.time;
        const ls = this.lg.speed;
        this.speed = ls;
        this.step(this.dir.x * ls * dt, this.dir.z * ls * dt);
        this.pos.y = this.world.floor(this.pos.x, this.pos.z, this.pos.y) + Math.sin(Math.PI * Math.min(1, u)) * this.lg.hop;
        if (!this.struck && dist < this.lg.reach && !player.dead) {
          this.struck = true;
          player.hurt(d.dmg, this.pos, d.knock);
          this.say('bite');
        }
        if (this.timer <= 0) {
          this.pos.y = this.world.floor(this.pos.x, this.pos.z, this.pos.y);
          this.setState('recover', 0.75 + this.rnd() * 0.3);
          this.speed = 0;
          this.model.pose('idle', 0);
          this.cooldown = d.cooldown[0] + this.rnd() * (d.cooldown[1] - d.cooldown[0]);
          this.orbitSide = this.rnd() < 0.5 ? -1 : 1;
        }
        break;
      }
      case 'recover':
      case 'stagger':
        this.timer -= dt;
        this.speed = 0;
        if (this.timer <= 0) {
          this.setState('chase');
          this.model.pose('run', d.run);
        }
        break;
      case 'return': {
        if (dist < d.sight * 0.6 && this.playerHere(player) && fromHome < this.leash - 8) {
          this.setState('chase');
          break;
        }
        this.hp = Math.min(d.hp, this.hp + d.hp * 0.25 * dt);
        this.model.pose('run', d.run * 0.6);
        if (this.moveToward(this.home.x, this.home.z, d.run * 0.6, dt) < 0.6) {
          this.hp = d.hp;
          this.speed = 0;
          this.setState('idle');
          this.model.pose('idle', 0);
        }
        break;
      }
      case 'dead':
      case 'falling':
        this.speed = 0;
        break;
    }
  }

  // --- vulture -------------------------------------------------------------------------

  private updateVulture(dt: number, player: PlayerView, dist: number): void {
    const d = this.def;
    const pp = player.pos;
    const floorUnder = (x: number, z: number) => this.world.floor(x, z, this.pos.y);
    const flyTo = (tx: number, ty: number, tz: number, speed: number) => {
      const dx = tx - this.pos.x;
      const dy = ty - this.pos.y;
      const dz = tz - this.pos.z;
      const len = Math.hypot(dx, dy, dz);
      if (len < 1e-3) return 0;
      const s = Math.min(len, speed * dt);
      this.pos.x += (dx / len) * s;
      this.pos.y += (dy / len) * s;
      this.pos.z += (dz / len) * s;
      if (Math.hypot(dx, dz) > 0.05) this.yaw = turnToward(this.yaw, Math.atan2(dx, dz), 4, dt);
      return len;
    };
    // Wing-beat sound in time with the flap.
    const m = this.model;
    if (m.beat !== undefined) {
      const b = m.beat;
      if (this.lastBeat < 0.25 && b >= 0.25 && (this.state === 'climb' || this.state === 'stagger' || this.state === 'alert')) this.sound((p, g) => this.sfx.wing(p, g * 0.7));
      this.lastBeat = b;
    }
    switch (this.state) {
      case 'idle': {
        // Lazy circles high over its roost.
        this.orbitA += dt * 0.25 * this.orbitSide;
        const r = 9;
        flyTo(this.home.x + Math.sin(this.orbitA) * r, this.home.y + Math.sin(this.orbitA * 2) * 0.6, this.home.z + Math.cos(this.orbitA) * r, d.walk);
        this.model.pose('glide', 0);
        if (dist < d.sight && this.playerHere(player)) {
          this.setState('alert', 0.6);
          this.sound((p, g) => this.sfx.vultureCry(p, g, false));
        }
        break;
      }
      case 'alert':
        this.timer -= dt;
        this.model.pose('fly', 0);
        flyTo(pp.x, floorUnder(pp.x, pp.z) + ORBIT.alt + 1, pp.z, d.run);
        if (this.timer <= 0) {
          this.setState('circle');
          this.cooldown = 1.2 + this.rnd() * 1.5;
        }
        break;
      case 'circle': {
        if (!this.playerHere(player)) {
          this.setState('return');
          break;
        }
        this.orbitA += this.orbitSide * ORBIT.speed * dt;
        const tx = pp.x + Math.sin(this.orbitA) * ORBIT.radius;
        const tz = pp.z + Math.cos(this.orbitA) * ORBIT.radius;
        const ty = Math.max(floorUnder(tx, tz), pp.y) + ORBIT.alt + Math.sin(this.orbitA * 3) * 0.4;
        flyTo(tx, ty, tz, d.run);
        this.model.pose(Math.sin(this.orbitA * 2) > 0.3 ? 'fly' : 'glide', 0);
        if (this.cooldown <= 0 && dist < ORBIT.radius + 4) {
          this.setState('tell', d.tell);
          this.model.flash('tell', 0.18);
          this.sound((p, g) => this.sfx.vultureCry(p, g * 1.2, false));
        }
        break;
      }
      case 'tell': {
        // Hover, wings up, turning to face its prey.
        this.timer -= dt;
        this.model.pose('fly', 0);
        this.yaw = turnToward(this.yaw, Math.atan2(pp.x - this.pos.x, pp.z - this.pos.z), 6, dt);
        this.pos.y += dt * 0.6;
        if (this.timer <= 0) {
          this.dir.set(pp.x - this.pos.x, pp.y + 1.1 - this.pos.y, pp.z - this.pos.z).normalize();
          this.setState('dive', DIVE.maxT);
          this.struck = false;
          this.model.pose('dive', 0);
          this.sound((p, g) => this.sfx.diveWhoosh(p, g));
        }
        break;
      }
      case 'dive': {
        this.timer -= dt;
        // Slight homing: rolling sideways at the last moment beats it.
        const want = new THREE.Vector3(pp.x - this.pos.x, pp.y + 1.1 - this.pos.y, pp.z - this.pos.z);
        const close = want.length();
        want.normalize();
        const k = Math.min(1, DIVE.turn * dt);
        if (close > 2.5) this.dir.lerp(want, k).normalize();
        this.pos.addScaledVector(this.dir, DIVE.speed * dt);
        this.yaw = Math.atan2(this.dir.x, this.dir.z);
        const floor = floorUnder(this.pos.x, this.pos.z);
        if (this.pos.y < floor + DIVE.low) this.pos.y = floor + DIVE.low;
        const d3 = Math.hypot(pp.x - this.pos.x, pp.y + 1.1 - this.pos.y, pp.z - this.pos.z);
        if (!this.struck && d3 < DIVE.reach && !player.dead) {
          this.struck = true;
          player.hurt(d.dmg, this.pos, d.knock);
          this.sound((p, g) => this.sfx.talonRake(p, g));
        }
        if (this.struck || this.timer <= 0 || (close < 1.6 && this.dir.dot(want) < 0)) {
          // Skim low past the player for a moment: the sword's chance.
          this.setState('skim', 0.75);
          this.dir.y = 0;
          this.dir.normalize();
          this.model.pose('glide', 0);
        }
        break;
      }
      case 'skim': {
        this.timer -= dt;
        this.pos.addScaledVector(this.dir, 5 * dt);
        const floor = floorUnder(this.pos.x, this.pos.z);
        this.pos.y += (floor + 1.25 - this.pos.y) * Math.min(1, dt * 5);
        if (this.timer <= 0) this.setState('climb', 1.2);
        break;
      }
      case 'climb': {
        this.timer -= dt;
        this.model.pose('fly', 0);
        this.pos.addScaledVector(this.dir, 4 * dt);
        this.pos.y += 4 * dt;
        if (this.timer <= 0) {
          this.setState('circle');
          this.orbitA = Math.atan2(this.pos.x - pp.x, this.pos.z - pp.z);
          this.cooldown = d.cooldown[0] + this.rnd() * (d.cooldown[1] - d.cooldown[0]);
        }
        break;
      }
      case 'stagger': {
        this.timer -= dt;
        this.pos.y -= 1.5 * dt;
        const floor = floorUnder(this.pos.x, this.pos.z);
        if (this.pos.y < floor + 0.9) this.pos.y = floor + 0.9;
        if (this.timer <= 0) {
          this.setState('climb', 1.0);
          this.dir.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
        }
        break;
      }
      case 'return': {
        this.model.pose('glide', 0);
        if (flyTo(this.home.x, this.home.y, this.home.z, d.run) < 1) {
          this.hp = d.hp;
          this.setState('idle');
        }
        if (dist < d.sight * 0.6 && this.playerHere(player)) this.setState('circle');
        break;
      }
      case 'falling': {
        // Tumbles out of the sky.
        this.vy -= 18 * dt;
        this.pos.y += this.vy * dt;
        // The authored Death clip tumbles on its own; the placeholder spins.
        if (this.model.proc) this.model.root.rotation.z += dt * 6;
        const floor = floorUnder(this.pos.x, this.pos.z);
        if (this.pos.y <= floor + 0.15) {
          this.pos.y = floor + 0.15;
          this.state = 'dead';
          if (this.model.proc) this.model.root.rotation.z = Math.PI * 0.9;
          this.sound((p, g) => this.sfx.thud(p, g));
        }
        break;
      }
      case 'dead':
        break;
      default:
        this.setState('circle');
    }
  }

  // --- movement ------------------------------------------------------------------------

  private moveToward(x: number, z: number, speed: number, dt: number, stopAt = 0, face = true): number {
    const dx = x - this.pos.x;
    const dz = z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d <= stopAt) {
      this.speed = 0;
      return d;
    }
    let dir: [number, number] | null;
    if (this.world.nav.lineClear(this.pos.x, this.pos.z, x, z)) dir = [dx / d, dz / d];
    else dir = this.follow.steer(this.pos.x, this.pos.z, x, z, dt);
    if (!dir) {
      this.speed = 0;
      return d;
    }
    const s = Math.min(speed * dt, d - stopAt);
    this.step(dir[0] * s, dir[1] * s);
    this.speed = speed;
    if (face) this.yaw = turnToward(this.yaw, Math.atan2(dir[0], dir[1]), 9, dt);
    return d;
  }

  private step(dx: number, dz: number): void {
    const nx = this.pos.x + dx;
    const nz = this.pos.z + dz;
    if (!this.flying && this.world.nav.isBlocked(nx, nz)) return;
    const b = this.world.physics.bounds;
    if (nx < b.x[0] || nx > b.x[1] || nz < b.z[0] || nz > b.z[1]) return;
    this.pos.x = nx;
    this.pos.z = nz;
    if (!this.flying) this.pos.y = this.world.floor(nx, nz, this.pos.y);
  }

  /** Separation pass (EnemySystem): ignored if it would enter a wall. */
  nudge(dx: number, dz: number): void {
    if (this.flying || this.dead) return;
    this.step(dx, dz);
  }

  sync(): void {
    const r = this.model.root;
    r.position.copy(this.pos);
    r.rotation.y = this.yaw;
  }
}

export type BeastModels = { dog: GLTF | null; bird: GLTF | null; rat?: GLTF | null; scorpion?: GLTF | null; viper?: GLTF | null };

/** Build the beast for a spawn of a beast kind. */
export function createBeast(kind: BeastKind, s: Spawn, world: World, sfx: Sfx, ear: Ear, models: BeastModels, seed: number): Beast {
  // Rats, scorpions and vipers use their own model when it exists; without it a
  // shrunken hound stands in for the rat, and the others are built in boxes.
  const own = (kind === 'rat' || kind === 'scorpion' || kind === 'viper' ? models[kind] : null) ?? null;
  if ((kind === 'scorpion' || kind === 'viper') && !own) return new Beast(kind, s, s.camp ?? '', world, sfx, ear, null, seed, true);
  return new Beast(kind, s, s.camp ?? '', world, sfx, ear, kind === 'vulture' ? models.bird : own ?? models.dog, seed, !!own);
}
