import * as THREE from 'three';
import type { Camel } from './animals';
import type { Npc } from './npc';

/**
 * An escort (Dumat al-Jandal: the gods' cart). The keeper walks ahead along the
 * `convoy` path and the camels follow in a line, but only while the player keeps
 * close: wander off and they wait. Reaching the end of the road completes it.
 */
export class Convoy {
  /** Walking speed (m/s) and how close the player must stay. */
  static readonly SPEED = 1.7;
  static readonly REACH = 26;
  running = false;
  done = false;
  private s = 0;
  private total = 0;
  private lengths: number[] = [];
  private homes: { o: THREE.Object3D; p: THREE.Vector3; yaw: number }[] = [];

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
    for (const o of [keeper.rig.root, ...camels.map((c) => c.rig.root)]) this.homes.push({ o, p: o.position.clone(), yaw: o.rotation.y });
  }

  /** 0..1 along the road. */
  get progress(): number {
    return this.total ? this.s / this.total : 0;
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

  update(dt: number, player: THREE.Vector3): void {
    if (!this.running || this.done) return;
    const head = this.at(this.s).p;
    const near = Math.hypot(player.x - head.x, player.z - head.z) < Convoy.REACH;
    const v = near ? Convoy.SPEED : 0;
    this.s += v * dt;
    // The keeper leads; each camel follows 4 m behind the one before.
    const k = this.at(this.s);
    const root = this.keeper.rig.root;
    root.position.copy(k.p);
    root.rotation.y = k.yaw;
    this.keeper.rig.anim.setBase(v > 0 ? 'Walk' : 'Idle', v > 0 ? v / 1.5 : 1, 0.25);
    this.keeper.rig.anim.update(dt);
    this.camels.forEach((c, i) => {
      const q = this.at(this.s - 4 * (i + 1));
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
    this.s = 0;
    for (const h of this.homes) {
      h.o.position.copy(h.p);
      h.o.rotation.y = h.yaw;
    }
    this.keeper.racing = false;
  }
}
