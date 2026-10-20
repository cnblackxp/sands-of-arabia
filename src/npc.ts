import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { CharacterFactory, CLIP_SPEED, PAL, pick, type Accessory, type Rig } from './characters';
import { conversation, randomName, ROLE_TITLE, type NpcRole } from './dialogue';
import type { Spawn, Vec3 } from './level';
import type { World } from './world';
import { angleTo, dampAngle, mulberry32 } from './util';

type State = 'idle' | 'walk' | 'sit' | 'talk' | 'stagger' | 'flee' | 'return' | 'chase' | 'strike' | 'dead';

const WALK = 1.4;
const RUN = 4.6;
const RADIUS = 0.3;
const HALF = 0.55;

export interface PlayerView {
  pos: THREE.Vector3;
  dead: boolean;
  mounted: boolean;
  hurt(dmg: number, from: THREE.Vector3): void;
}

export class Npc {
  readonly pos = new THREE.Vector3();
  yaw: number;
  hp = 100;
  state: State = 'idle';
  hostile = false;
  readonly name: string;
  readonly title: string;
  private home: THREE.Vector3;
  private homeYaw: number;
  private target = new THREE.Vector3();
  private timer = 0;
  private overlayTimer = 0;
  private resume: State = 'idle';
  private struck = false;
  private animAcc = 0;
  private frame = Math.floor(Math.random() * 4);
  private leg = 0; // water carrier: 0 → to pool, 1 → to market
  private danger = new THREE.Vector3();

  constructor(
    readonly role: NpcRole,
    readonly rig: Rig,
    spawn: Spawn,
    readonly female: boolean,
    private collider: RAPIER.Collider,
    private sys: NpcSystem,
  ) {
    this.pos.set(...spawn.pos);
    this.yaw = spawn.yaw;
    this.home = this.pos.clone();
    this.homeYaw = spawn.yaw;
    this.name = sys.uniqueName(female);
    this.title = ROLE_TITLE[role];
    this.timer = sys.rnd() * 4;
    this.overlayTimer = 2 + sys.rnd() * 8;
    if (role === 'sitter') this.enter('sit');
    else this.enter('idle');
    this.syncTransform();
  }

  get dead(): boolean {
    return this.state === 'dead';
  }

  get talkable(): boolean {
    return !this.dead && !this.hostile && this.state !== 'flee' && this.state !== 'stagger';
  }

  private enter(s: State): void {
    this.state = s;
    const a = this.rig.anim;
    switch (s) {
      case 'idle':
      case 'talk':
      case 'strike':
      case 'stagger':
        a.setBase('Idle', 1, 0.1);
        break;
      case 'sit':
        a.setBase('Sit', 1, 0.4);
        break;
      case 'walk':
      case 'return':
        a.setBase('Walk', WALK / CLIP_SPEED.personWalk);
        break;
      case 'flee':
      case 'chase':
        a.setBase('Run', RUN / CLIP_SPEED.personRun, 0.15);
        break;
      case 'dead':
        a.stopOverlay(0.1);
        a.setBase('Death', 1, 0.12);
        break;
    }
  }

  /** Begin a conversation; returns the lines to show. */
  startTalk(): string[] {
    this.resume = this.state === 'sit' ? 'sit' : this.role === 'wanderer' || this.role === 'water_carrier' ? 'idle' : this.state;
    if (this.state !== 'sit') this.enter('talk');
    else this.state = 'talk';
    this.rig.anim.playOverlay('Talk', { loop: true, fade: 0.25 });
    return conversation(this.role, this.sys.rnd);
  }

  endTalk(): void {
    if (this.state !== 'talk') return;
    this.rig.anim.stopOverlay(0.3);
    this.timer = 1 + this.sys.rnd() * 2;
    this.enter(this.resume);
  }

  damage(dmg: number, from: THREE.Vector3): void {
    if (this.dead) return;
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.hp = 0;
      this.enter('dead');
      this.collider.setEnabled(false);
      this.sys.onDeath(this);
      return;
    }
    this.rig.anim.playOverlay('Hit', { fade: 0.05 });
    if (this.role === 'guard') this.hostile = true;
    // Reel from the blow briefly, then react.
    this.danger.copy(from);
    this.timer = 0.7;
    this.yaw = angleTo(this.pos, from);
    this.enter('stagger');
    this.sys.alarm(this.pos, from, this);
  }

  flee(from: THREE.Vector3): void {
    if (this.dead || this.role === 'guard') return;
    this.target.copy(this.pos).sub(from).setY(0);
    if (this.target.lengthSq() < 1e-4) this.target.set(1, 0, 0);
    this.target.normalize();
    this.timer = 3 + this.sys.rnd() * 2;
    this.enter('flee');
  }

  provoke(): void {
    if (this.dead || this.role !== 'guard') return;
    this.hostile = true;
    if (this.state !== 'strike' && this.state !== 'stagger') this.enter('chase');
  }

  update(dt: number, player: PlayerView, focusDist: number): void {
    const rnd = this.sys.rnd;
    let moving = false;
    const toPlayer = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);

    switch (this.state) {
      case 'idle': {
        this.timer -= dt;
        if (this.role === 'guard') {
          this.yaw = dampAngle(this.yaw, toPlayer < 9 ? angleTo(this.pos, player.pos) : this.homeYaw, 4, dt);
        }
        if ((this.role === 'merchant' || this.role === 'priest') && !this.hostile) {
          this.overlayTimer -= dt;
          if (this.overlayTimer <= 0) {
            this.rig.anim.playOverlay('Talk', { loop: true, fade: 0.3 });
            this.overlayTimer = 6 + rnd() * 10;
            this.timer = 2.5 + rnd() * 2;
          } else if (this.rig.anim.overlay === 'Talk' && this.timer <= 0) {
            this.rig.anim.stopOverlay(0.4);
          }
          if (this.role === 'merchant') this.yaw = dampAngle(this.yaw, this.homeYaw, 3, dt);
        }
        if (this.timer <= 0 && (this.role === 'wanderer' || this.role === 'water_carrier')) {
          if (this.pickTarget()) this.enter('walk');
          else this.timer = 1 + rnd() * 2;
        }
        break;
      }
      case 'walk':
      case 'return': {
        const dx = this.target.x - this.pos.x;
        const dz = this.target.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.3) {
          if (this.state === 'return') {
            this.yaw = this.homeYaw;
            this.enter(this.role === 'sitter' ? 'sit' : 'idle');
          } else {
            this.enter('idle');
          }
          this.timer = this.role === 'water_carrier' ? 3 + rnd() * 2 : 2 + rnd() * 6;
          break;
        }
        // Give way to the player.
        if (toPlayer < 1.3 && Math.cos(angleTo(this.pos, player.pos) - Math.atan2(dx, dz)) > 0.3) {
          this.enter('idle');
          this.timer = 0.8 + rnd();
          break;
        }
        moving = this.step(dx / d, dz / d, Math.min(WALK * dt, d), dt);
        if (!moving) {
          this.enter('idle');
          this.timer = 0.5 + rnd();
        }
        break;
      }
      case 'stagger': {
        this.timer -= dt;
        if (this.timer <= 0) {
          if (this.role === 'guard') this.enter('chase');
          else this.flee(this.danger);
        }
        break;
      }
      case 'flee': {
        this.timer -= dt;
        moving = this.step(this.target.x, this.target.z, RUN * dt, dt, true);
        if (this.timer <= 0) this.goHome();
        break;
      }
      case 'chase': {
        if (!this.hostile || player.dead || toPlayer > 45) {
          this.hostile = false;
          this.goHome();
          break;
        }
        const reach = player.mounted ? 2.4 : 1.6;
        if (toPlayer < reach) {
          this.enter('strike');
          this.rig.anim.playOverlay(rnd() < 0.5 ? 'Attack' : 'Attack2');
          this.struck = false;
          this.timer = 1.3;
          break;
        }
        const a = angleTo(this.pos, player.pos);
        moving = this.step(Math.sin(a), Math.cos(a), RUN * dt, dt, true);
        break;
      }
      case 'strike': {
        this.timer -= dt;
        const a = angleTo(this.pos, player.pos);
        this.yaw = dampAngle(this.yaw, a, 8, dt);
        const t = this.rig.anim.overlayTime();
        if (!this.struck && t >= 0.4) {
          this.struck = true;
          const facing = Math.cos(a - this.yaw) > 0.4;
          if (facing && toPlayer < (player.mounted ? 2.8 : 2.1) && !player.dead) player.hurt(12, this.pos);
        }
        if (this.timer <= 0) this.enter(this.hostile ? 'chase' : 'idle');
        break;
      }
      case 'talk': {
        this.yaw = dampAngle(this.yaw, angleTo(this.pos, player.pos), 6, dt);
        break;
      }
      case 'sit':
      case 'dead':
        break;
    }

    if (moving) this.syncCollider();
    this.syncTransform();

    // Animation LOD: far NPCs tick less often.
    this.animAcc += dt;
    this.frame++;
    const every = focusDist > 70 ? 6 : focusDist > 35 ? 2 : 1;
    if (this.frame % every === 0) {
      this.rig.anim.update(this.animAcc);
      this.animAcc = 0;
    }
  }

  private goHome(): void {
    if (this.role === 'wanderer') {
      this.enter('idle');
      this.timer = 1 + this.sys.rnd() * 2;
      return;
    }
    this.target.copy(this.home);
    this.enter('return');
  }

  /** Move along (dx, dz); tries detours around obstacles. Returns false if stuck. */
  private step(dx: number, dz: number, dist: number, dt: number, detour = false): boolean {
    const w = this.sys.world;
    const base = Math.atan2(dx, dz);
    const tries = detour ? [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8] : [0, 0.5, -0.5];
    for (const off of tries) {
      const a = base + off;
      const nx = this.pos.x + Math.sin(a) * dist;
      const nz = this.pos.z + Math.cos(a) * dist;
      if (w.obstacles.blocked(nx, nz, RADIUS + 0.05)) continue;
      const b = w.physics.bounds;
      if (nx < b.x[0] || nx > b.x[1] || nz < b.z[0] || nz > b.z[1]) continue;
      this.pos.x = nx;
      this.pos.z = nz;
      this.pos.y = w.ground(nx, nz);
      this.yaw = dampAngle(this.yaw, a, 12, dt);
      return true;
    }
    return false;
  }

  private pickTarget(): boolean {
    const rnd = this.sys.rnd;
    const w = this.sys.world;
    for (let i = 0; i < 8; i++) {
      let x: number;
      let z: number;
      if (this.role === 'water_carrier') {
        if (this.leg === 0) {
          // Edge of the pool, east side.
          x = this.sys.pool[0] + 8.2 + rnd() * 0.8;
          z = this.sys.pool[2] - 3 + rnd() * 6;
        } else {
          const p = this.sys.lanePoint(rnd);
          x = p.x;
          z = p.z;
        }
      } else if (rnd() < 0.65) {
        const p = this.sys.lanePoint(rnd);
        x = p.x;
        z = p.z;
      } else {
        const a = rnd() * Math.PI * 2;
        const r = 3 + rnd() * 9;
        x = this.home.x + Math.sin(a) * r;
        z = this.home.z + Math.cos(a) * r;
      }
      if (w.obstacles.blocked(x, z, 0.6)) continue;
      if (!w.obstacles.clear(this.pos.x, this.pos.z, x, z, RADIUS + 0.1)) continue;
      this.target.set(x, w.ground(x, z), z);
      if (this.role === 'water_carrier') this.leg ^= 1;
      return true;
    }
    return false;
  }

  syncCollider(): void {
    this.collider.setTranslation({ x: this.pos.x, y: this.pos.y + HALF + RADIUS, z: this.pos.z });
  }

  private syncTransform(): void {
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.yaw;
  }
}

export class NpcSystem {
  readonly npcs: Npc[] = [];
  readonly rnd = mulberry32(7);
  readonly pool: Vec3;
  private lane: THREE.Vector3[];
  onDeathCb: (n: Npc) => void = () => {};

  constructor(
    readonly world: World,
    factory: CharacterFactory,
    scene: THREE.Scene,
  ) {
    const level = world.assets.level;
    this.pool = level.landmarks.pool;
    // Market lane minus the gate ramp.
    this.lane = level.paths.market_lane.map((p) => new THREE.Vector3(...p)).filter((p) => p.z > -15);
    for (const s of level.spawns) {
      if (!(s.role in ROLE_TITLE)) continue;
      const role = s.role as NpcRole;
      const { acc, colours, female } = this.dress(role);
      const rig = factory.createPerson(acc, colours);
      const at = new THREE.Vector3(...s.pos);
      at.y = world.ground(at.x, at.z);
      s.pos[1] = at.y;
      const col = world.physics.addActor(RADIUS, HALF, at);
      const npc = new Npc(role, rig, s, female, col, this);
      scene.add(rig.root);
      this.npcs.push(npc);
    }
  }

  private dress(role: NpcRole): { acc: Accessory[]; colours: Record<string, number>; female: boolean } {
    const r = this.rnd;
    const acc: Accessory[] = [];
    const canBeFemale = role === 'wanderer' || role === 'water_carrier' || role === 'sitter' || role === 'merchant';
    const female = canBeFemale && r() < (role === 'water_carrier' ? 0.6 : 0.3);
    if (female) {
      acc.push('Veil');
    } else {
      const h = r();
      if (role === 'priest') acc.push('Turban');
      else if (role === 'guard') acc.push(h < 0.5 ? 'Turban' : 'Keffiyeh');
      else acc.push(h < 0.45 ? 'Keffiyeh' : h < 0.75 ? 'Turban' : 'Hair');
      if (role === 'guard' || role === 'priest' || r() < 0.65) acc.push('Beard');
    }
    if (role === 'water_carrier') acc.push('Jar');
    if (role === 'guard') acc.push('Sword');
    let robe = pick(PAL.robe, r);
    if (role === 'priest') robe = 0xf4f0e6;
    if (role === 'guard') robe = pick([0x2c3e73, 0x7b2a24, 0x3b3530], r);
    if (female && r() < 0.5) robe = pick([0x2c3e73, 0x7b2a24, 0x5b2d6e, 0x3b3530, 0x9a3d22], r);
    const colours = {
      P_Robe: robe,
      P_Sash: pick(PAL.sash, r),
      P_Pants: pick(PAL.pants, r),
      P_Skin: pick(PAL.skin, r),
      P_Wrap: role === 'priest' ? 0xf4f0e6 : female ? pick([0x2b2622, 0x2c3e73, 0x6d2f5e, 0x7b2a24, 0xe5dcc8], r) : pick(PAL.wrap, r),
      P_Hair: pick(PAL.hair, r),
    };
    return { acc, colours, female };
  }

  private usedNames = new Set<string>();
  uniqueName(female: boolean): string {
    let name = randomName(female, this.rnd);
    for (let i = 0; i < 12 && this.usedNames.has(name); i++) name = randomName(female, this.rnd);
    this.usedNames.add(name);
    return name;
  }

  lanePoint(rnd: () => number): THREE.Vector3 {
    const i = Math.floor(rnd() * (this.lane.length - 1));
    const t = rnd();
    const p = this.lane[i].clone().lerp(this.lane[i + 1], t);
    p.x += (rnd() * 2 - 1) * 4;
    return p;
  }

  update(dt: number, player: PlayerView, focus: THREE.Vector3): void {
    for (const n of this.npcs) {
      const d = Math.hypot(n.pos.x - focus.x, n.pos.z - focus.z);
      n.update(dt, player, d);
    }
  }

  /** Closest NPC the player can talk to. */
  nearestTalkable(p: THREE.Vector3, maxDist: number): Npc | null {
    let best: Npc | null = null;
    let bd = maxDist;
    for (const n of this.npcs) {
      if (!n.talkable) continue;
      // Merchants are reached across their counters.
      const d = Math.hypot(n.pos.x - p.x, n.pos.z - p.z) - (n.role === 'merchant' ? 1.8 : 0);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  /** Sword sweep: NPCs within `range` and `halfAngle` of the facing direction. */
  hitArc(origin: THREE.Vector3, yaw: number, range: number, halfAngle: number, dmg: number): Npc[] {
    const hits: Npc[] = [];
    const cosMax = Math.cos(halfAngle);
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    for (const n of this.npcs) {
      if (n.dead) continue;
      const dx = n.pos.x - origin.x;
      const dz = n.pos.z - origin.z;
      const d = Math.hypot(dx, dz);
      if (d > range + RADIUS || Math.abs(n.pos.y - origin.y) > 2.5) continue;
      if (d > 0.4 && (dx * fx + dz * fz) / d < cosMax) continue;
      n.damage(dmg, origin);
      hits.push(n);
    }
    return hits;
  }

  /** Someone was attacked at `where` by an attacker at `from`. */
  alarm(where: THREE.Vector3, from: THREE.Vector3, victim?: Npc): void {
    for (const n of this.npcs) {
      if (n.dead || n === victim) continue;
      const d = n.pos.distanceTo(where);
      if (n.role === 'guard' && d < 30) n.provoke();
      else if (d < 9 && n.state !== 'flee' && n.state !== 'talk' && n.state !== 'stagger') n.flee(from);
    }
  }

  onDeath(n: Npc): void {
    this.alarm(n.pos, n.pos);
    this.onDeathCb(n);
  }

  calmGuards(): void {
    for (const n of this.npcs) n.hostile = false;
  }
}
