import * as THREE from 'three';
import type { Camel } from './animals';
import type { Npc } from './npc';

/**
 * An escort (Dumat al-Jandal: the gods' cart; Qaryat al-Faw: the Sabaean
 * caravan). The keeper walks ahead along a path and the camels follow in a
 * line, but only while the player keeps close: wander off and they wait.
 * Reaching the end of the road completes it.
 */
export class Convoy {
  /** Walking speed (m/s) and how close the player must stay. */
  static readonly SPEED = 1.7;
  static readonly REACH = 26;
  /** Over the first metres everyone eases from where they stood onto the road. */
  static readonly JOIN = 14;
  running = false;
  done = false;
  private s = 0;
  /** Where along the road the keeper stood (the walk starts there, not at the road's far end). */
  private s0 = 0;
  private total = 0;
  private lengths: number[] = [];
  private homes: { o: THREE.Object3D; p: THREE.Vector3; yaw: number }[] = [];
  /** Each member's offset from its place in the line when the walk began. */
  private join: THREE.Vector3[] = [];

  constructor(
    private path: THREE.Vector3[],
    private keeper: Npc,
    private camels: Camel[],
    private groundAt: (x: number, z: number) => number,
    private onArrive: () => void,
  ) {
    for (let i = 0; i < path.length - 1; i++) {
      const d = Math.hypot(path[i + 1].x - path[i].x, path[i + 1].z - path[i].z);
      this.lengths.push(d);
      this.total += d;
    }
    for (const o of this.members) this.homes.push({ o, p: o.position.clone(), yaw: o.rotation.y });
    this.s = this.s0 = this.nearest(keeper.rig.root.position);
  }

  private get members(): THREE.Object3D[] {
    return [this.keeper.rig.root, ...this.camels.map((c) => c.rig.root)];
  }

  /** 0..1 along the road. */
  get progress(): number {
    const left = this.total - this.s0;
    return left > 0 ? (this.s - this.s0) / left : 0;
  }

  /** Where the head of the convoy is (for markers). */
  get head(): THREE.Vector3 {
    return this.at(this.s).p;
  }

  start(): void {
    if (this.done) return;
    this.running = true;
    this.keeper.racing = true;
    for (const c of this.camels) c.setStatic(false);
    this.join = this.members.map((o, i) => {
      const q = this.at(this.s - 4 * i).p;
      return new THREE.Vector3(o.position.x - q.x, 0, o.position.z - q.z);
    });
  }

  /** Distance along the road of the point nearest to `p`. */
  private nearest(p: THREE.Vector3): number {
    let best = 0;
    let bd = Infinity;
    let acc = 0;
    for (let i = 0; i < this.lengths.length; i++) {
      const a = this.path[i];
      const b = this.path[i + 1];
      const len = this.lengths[i];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const u = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (len * len))) : 0;
      const d = Math.hypot(a.x + dx * u - p.x, a.z + dz * u - p.z);
      if (d < bd) {
        bd = d;
        best = acc + u * len;
      }
      acc += len;
    }
    return best;
  }

  private at(s: number): { p: THREE.Vector3; yaw: number } {
    let i = 0;
    let rem = Math.max(0, Math.min(this.total - 0.01, s));
    while (i < this.lengths.length - 1 && rem > this.lengths[i]) rem -= this.lengths[i++];
    const a = this.path[i];
    const b = this.path[i + 1] ?? a;
    const u = this.lengths[i] ? rem / this.lengths[i] : 0;
    const x = a.x + (b.x - a.x) * u;
    const z = a.z + (b.z - a.z) * u;
    return { p: new THREE.Vector3(x, this.groundAt(x, z), z), yaw: Math.atan2(b.x - a.x, b.z - a.z) };
  }

  /** Member `i`'s place: 4 m apart along the road, eased in from where it stood. */
  private place(i: number): { p: THREE.Vector3; yaw: number } {
    const q = this.at(this.s - 4 * i);
    const off = this.join[i];
    const k = Math.max(0, 1 - (this.s - this.s0) / Convoy.JOIN);
    if (off && k > 0) {
      q.p.x += off.x * k;
      q.p.z += off.z * k;
      q.p.y = this.groundAt(q.p.x, q.p.z);
    }
    return q;
  }

  update(dt: number, player: THREE.Vector3): void {
    if (!this.running || this.done) return;
    const head = this.at(this.s).p;
    const near = Math.hypot(player.x - head.x, player.z - head.z) < Convoy.REACH;
    const v = near ? Convoy.SPEED : 0;
    this.s += v * dt;
    // The keeper leads; each camel follows 4 m behind the one before.
    const k = this.place(0);
    const root = this.keeper.rig.root;
    root.position.copy(k.p);
    root.rotation.y = k.yaw;
    this.keeper.rig.anim.setBase(v > 0 ? 'Walk' : 'Idle', v > 0 ? v / 1.5 : 1, 0.25);
    this.keeper.rig.anim.update(dt);
    this.camels.forEach((c, i) => {
      const q = this.place(i + 1);
      c.rig.root.position.copy(q.p);
      c.rig.root.rotation.set(0, q.yaw, 0);
      c.rig.anim.setBase(v > 0 ? 'Walk' : 'Idle', v > 0 ? v / 1.8 : 1, 0.3);
      c.update(dt);
    });
    if (this.s >= this.total - 0.05) {
      this.done = true;
      this.running = false;
      this.keeper.rig.anim.setBase('Idle', 1, 0.3);
      for (const c of this.camels) c.rig.anim.setBase('Idle', 1, 0.3);
      this.onArrive();
    }
  }

  /** Put everyone back (left the map mid-escort). */
  reset(): void {
    this.running = false;
    this.s = this.s0;
    for (const h of this.homes) {
      h.o.position.copy(h.p);
      h.o.rotation.y = h.yaw;
    }
    this.keeper.racing = false;
  }
}
