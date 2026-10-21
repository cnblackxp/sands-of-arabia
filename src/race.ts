import * as THREE from 'three';
import { HORSE_GALLOP, type Horse } from './animals';
import { beam } from './markers';
import type { Npc } from './npc';

/**
 * The horse race at Ukaz: from the start marker around the oval past eight
 * checkpoints, in order, against the tribes' horsemen. Riders gallop the
 * `race` path and leap the brushwood hurdles; the player rides their own horse
 * (jumping the hurdles themselves). The first one back at the start wins.
 */

export interface RaceSetup {
  start: THREE.Vector3;
  checkpoints: THREE.Vector3[];
  /** Closed loop the horsemen follow (level.json `paths.race`). */
  path: THREE.Vector3[];
  hurdles: THREE.Vector3[];
  /** Each horseman and the horse they ride. */
  riders: { npc: Npc; horse: Horse }[];
  groundAt: (x: number, z: number) => number;
}

type RaceState = 'idle' | 'countdown' | 'running' | 'finished';

export interface RaceEvents {
  tick(n: number): void;
  go(): void;
  checkpoint(i: number, of: number): void;
  finish(place: number, of: number): void;
}

const CP_RADIUS = 13;
const COUNTDOWN = 3;
/** Give up after this long (the riders are long home). */
const TIMEOUT = 150;

export class Race {
  state: RaceState = 'idle';
  private t = 0;
  private next = 0;
  private finishers = 0;
  private lengths: number[] = [];
  private total = 0;
  private riders: { npc: Npc; horse: Horse; s: number; speed: number; done: boolean; home: THREE.Vector3; homeYaw: number }[] = [];
  private markers: THREE.Mesh[] = [];
  /** Distance along the path where the start line is. */
  private offset = 0;
  /** Player's place when they finished (0 = not yet). */
  place = 0;

  constructor(
    scene: THREE.Scene,
    private setup: RaceSetup,
    private ev: RaceEvents,
  ) {
    const p = setup.path;
    for (let i = 0; i < p.length; i++) {
      const a = p[i];
      const b = p[(i + 1) % p.length];
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      this.lengths.push(d);
      this.total += d;
    }
    // The path need not begin at the start line: ride it from the vertex nearest the line.
    let best = Infinity;
    let acc = 0;
    for (let i = 0; i < p.length; i++) {
      const d = Math.hypot(p[i].x - setup.start.x, p[i].z - setup.start.z);
      if (d < best) {
        best = d;
        this.offset = acc;
      }
      acc += this.lengths[i];
    }
    for (const r of setup.riders) this.riders.push({ npc: r.npc, horse: r.horse, s: 0, speed: 0, done: false, home: r.horse.pos.clone(), homeYaw: r.horse.yaw });
    for (const c of setup.checkpoints) {
      const m = beam(0xffd27a, 14, 1.4);
      m.position.copy(c);
      m.visible = false;
      this.markers.push(m);
      scene.add(m);
    }
  }

  get running(): boolean {
    return this.state === 'countdown' || this.state === 'running';
  }
  get checkpoint(): number {
    return this.next;
  }
  get of(): number {
    return this.setup.checkpoints.length;
  }
  get startPos(): THREE.Vector3 {
    return this.setup.start;
  }
  /** The player's current place (1 = leading), counting riders ahead along the course. */
  standing(player: THREE.Vector3): number {
    const mine = this.progressOf(player);
    let ahead = 0;
    for (const r of this.riders) if (r.done || r.s / this.total > mine) ahead++;
    return ahead + 1;
  }

  /** How far round the course a point is (0..1), judged by checkpoints passed. */
  private progressOf(p: THREE.Vector3): number {
    const n = this.setup.checkpoints.length;
    const c = this.setup.checkpoints[Math.min(this.next, n - 1)];
    const prev = this.next === 0 ? this.setup.start : this.setup.checkpoints[this.next - 1];
    const seg = Math.max(1, prev.distanceTo(c));
    const left = Math.min(seg, Math.hypot(p.x - c.x, p.z - c.z));
    return (this.next + (1 - left / seg)) / n;
  }

  /** Line everyone up and start the countdown. */
  start(): void {
    this.state = 'countdown';
    this.t = COUNTDOWN;
    this.next = 0;
    this.finishers = 0;
    this.place = 0;
    this.riders.forEach((r, i) => {
      r.s = 0;
      r.done = false;
      // A little spread: the best horseman is not always the same.
      // Just under a gallop the player can match (8.7–9.9 m/s when it was 10.5).
      r.speed = HORSE_GALLOP * (0.83 + Math.random() * 0.115) - i * 0.15;
      r.npc.racing = true;
      r.horse.setRidden(true);
    });
    this.place3d(-1);
    this.ev.tick(COUNTDOWN);
  }

  private place3d(lit: number): void {
    this.markers.forEach((m, i) => (m.visible = i === lit));
  }

  update(dt: number, player: THREE.Vector3, mounted: boolean): void {
    if (this.state === 'idle' || this.state === 'finished') return;
    if (this.state === 'countdown') {
      const before = Math.ceil(this.t);
      this.t -= dt;
      const now = Math.ceil(this.t);
      if (now !== before && now > 0) this.ev.tick(now);
      this.ridersIdle(dt);
      if (this.t <= 0) {
        this.state = 'running';
        this.t = 0;
        this.place3d(0);
        this.ev.go();
      }
      return;
    }
    this.t += dt;
    // The horsemen.
    for (const r of this.riders) {
      if (r.done) {
        r.horse.speed = Math.max(0, r.horse.speed - 6 * dt);
        r.horse.idle(dt);
        r.horse.update(dt);
        this.seat(r, dt);
        continue;
      }
      r.s += r.speed * dt;
      if (r.s >= this.total) {
        r.done = true;
        this.finishers++;
      }
      this.ride(r, Math.min(r.s, this.total - 0.01), r.speed, dt);
    }
    // The player, checkpoint by checkpoint (on horseback).
    const cps = this.setup.checkpoints;
    const c = cps[this.next];
    if (mounted && c && Math.hypot(player.x - c.x, player.z - c.z) < CP_RADIUS) {
      this.next++;
      if (this.next >= cps.length) {
        this.place = this.finishers + 1;
        this.finish();
        return;
      }
      this.place3d(this.next);
      this.ev.checkpoint(this.next, cps.length);
    }
    if (this.t > TIMEOUT) {
      this.place = this.riders.length + 1;
      this.finish();
    }
  }

  private finish(): void {
    this.state = 'finished';
    this.place3d(-1);
    this.ev.finish(this.place, this.riders.length + 1);
  }

  /** Back to the start line (after the race, or when leaving). */
  reset(): void {
    this.state = 'idle';
    this.place3d(-1);
    for (const r of this.riders) {
      r.done = false;
      r.s = 0;
      r.horse.speed = 0;
      r.horse.mover.teleport(r.home.clone().setY(this.setup.groundAt(r.home.x, r.home.z)));
      r.horse.yaw = r.homeYaw;
      r.horse.setRidden(false);
      r.horse.idle(0);
      r.horse.update(0);
      r.npc.racing = false;
      r.npc.rig.root.visible = true;
    }
  }

  private ridersIdle(dt: number): void {
    for (const r of this.riders) {
      r.horse.idle(dt);
      r.horse.update(dt);
      this.seat(r, dt);
    }
  }

  /** Gallop along the path at distance `s`, leaping the hurdles. */
  private ride(r: (typeof this.riders)[number], s: number, speed: number, dt: number): void {
    const p = this.setup.path;
    let i = 0;
    let rem = (s + this.offset) % this.total;
    while (i < this.lengths.length - 1 && rem > this.lengths[i]) rem -= this.lengths[i++];
    const a = p[i];
    const b = p[(i + 1) % p.length];
    const u = this.lengths[i] > 0 ? rem / this.lengths[i] : 0;
    // A little lateral offset per rider so they don't stack.
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const lane = (this.riders.indexOf(r) - 1) * 2.2;
    const x = a.x + dx * u + (-dz / len) * lane;
    const z = a.z + dz * u + (dx / len) * lane;
    // Hurdle leap: a hop as the horse clears the brushwood.
    let hop = 0;
    for (const h of this.setup.hurdles) {
      const d = Math.hypot(h.x - x, h.z - z);
      if (d < 3.2) hop = Math.max(hop, 1.25 * Math.cos((d / 3.2) * (Math.PI / 2)));
    }
    const h = r.horse;
    h.mover.teleport(new THREE.Vector3(x, this.setup.groundAt(x, z) + hop, z));
    h.yaw = Math.atan2(dx, dz);
    h.speed = speed;
    h.idle(0);
    h.speed = speed;
    h.update(dt);
    this.seat(r, dt);
  }

  /** The horseman sits in the saddle. */
  private seat(r: (typeof this.riders)[number], dt: number): void {
    const root = r.npc.rig.root;
    r.horse.mountPoint(root.position);
    root.rotation.set(r.horse.pitch, r.horse.yaw, r.horse.roll, 'YXZ');
    r.npc.rig.anim.setBase('Ride', THREE.MathUtils.clamp(r.horse.speed / 9, 0.3, 1.3), 0.15);
    r.npc.rig.anim.update(dt);
  }

  dispose(): void {
    for (const m of this.markers) m.removeFromParent();
  }
}
