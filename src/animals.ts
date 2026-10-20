import * as THREE from 'three';
import { CharacterFactory, CLIP_SPEED, PAL, pick, type Rig } from './characters';
import type { Spawn } from './level';
import { GROUP_ACTOR, GROUP_PLAYER, Mover, type Physics } from './physics';
import { fitGround, turnToward } from './util';

export const HORSE_WALK = 2.8;
export const HORSE_GALLOP = 10.5;

/** A rideable horse. While ridden it is moved by its own character-controller capsule. */
export class Horse {
  readonly rig: Rig;
  readonly mover: Mover;
  yaw: number;
  speed = 0;
  ridden = false;
  pitch = 0;
  roll = 0;
  private mount: THREE.Bone;
  private groundAt: (x: number, z: number) => number;

  constructor(factory: CharacterFactory, physics: Physics, spawn: Spawn, rnd: () => number) {
    this.rig = factory.createHorse(
      { H_Coat: pick(PAL.horseCoat, rnd), H_Mane: pick(PAL.horseMane, rnd), H_Blanket: pick(PAL.blanket, rnd) },
      true,
    );
    const feet = new THREE.Vector3(...spawn.pos);
    feet.y = physics.groundAt(feet.x, feet.z);
    this.mover = new Mover(physics, 0.7, 0.35, feet);
    this.groundAt = physics.groundAt;
    this.mover.collider.setCollisionGroups(GROUP_ACTOR);
    this.yaw = spawn.yaw;
    this.mount = this.rig.bones.get('mount')!;
    this.rig.anim.setBase('Idle', 1, 0);
    this.sync();
  }

  get pos(): THREE.Vector3 {
    return this.mover.feet;
  }

  setRidden(on: boolean): void {
    this.ridden = on;
    this.mover.collider.setCollisionGroups(on ? GROUP_PLAYER : GROUP_ACTOR);
    if (!on) this.speed = 0;
  }

  /**
   * Ridden update. `dirX/dirZ` is the camera-relative input direction (world),
   * `mag` 0..1. The horse turns toward the input and moves along its heading.
   */
  drive(dt: number, dirX: number, dirZ: number, mag: number, gallop: boolean): void {
    let want = 0;
    if (mag > 0.01) {
      const target = Math.atan2(dirX, dirZ);
      const diff = Math.abs(Math.atan2(Math.sin(target - this.yaw), Math.cos(target - this.yaw)));
      // Tighter turns at walk, wider at gallop; slow down for sharp turns.
      const rate = gallop ? 3.2 : 4.5;
      this.yaw = turnToward(this.yaw, target, rate, dt);
      want = (gallop ? HORSE_GALLOP : HORSE_WALK) * mag * (diff > 1.6 ? 0.35 : diff > 0.8 ? 0.7 : 1);
    }
    const accel = want > this.speed ? (gallop ? 9 : 6) : 14;
    this.speed = want > this.speed ? Math.min(want, this.speed + accel * dt) : Math.max(want, this.speed - accel * dt);
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const moved = this.mover.move(fx * this.speed * dt, fz * this.speed * dt);
    // If a wall stopped us, bleed speed so the gallop animation doesn't run in place.
    if (dt > 0 && this.speed > 0.5) {
      const actual = Math.hypot(moved.x, moved.z) / dt;
      if (actual < this.speed * 0.4) this.speed = Math.max(actual, this.speed - 30 * dt);
    }
    this.animate();
  }

  idle(dt: number): void {
    // Stray horses settle; they are not simulated otherwise.
    this.speed = Math.max(0, this.speed - 10 * dt);
    this.animate();
  }

  private animate(): void {
    const a = this.rig.anim;
    if (this.speed < 0.25) a.setBase('Idle', 1, 0.3);
    else if (this.speed < 5) a.setBase('Walk', Math.max(0.5, this.speed / CLIP_SPEED.horseWalk), 0.25);
    else a.setBase('Gallop', this.speed / CLIP_SPEED.horseGallop, 0.25);
  }

  update(dt: number): void {
    this.rig.anim.update(dt);
    this.sync();
  }

  private sync(): void {
    // Lean with the dunes so hooves stay on the sand.
    const f = this.mover.feet;
    const t = fitGround(this.groundAt, f.x, f.z, this.yaw, 1.1, 0.35);
    this.pitch += (t.pitch - this.pitch) * 0.25;
    this.roll += (t.roll * 0.6 - this.roll) * 0.25;
    this.rig.root.position.set(f.x, t.y, f.z);
    this.rig.root.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
    this.rig.root.updateMatrixWorld(true);
  }

  /** World position of the saddle (`mount` bone) after this frame's pose. */
  mountPoint(out: THREE.Vector3): THREE.Vector3 {
    return this.mount.getWorldPosition(out);
  }
}

export class Camel {
  readonly rig: Rig;
  constructor(factory: CharacterFactory, physics: Physics, spawn: Spawn, rnd: () => number) {
    const cargo = rnd() < 0.6;
    this.rig = factory.createCamel({}, true, cargo);
    const p = new THREE.Vector3(...spawn.pos);
    // Fit the body to the slope so a lying camel doesn't sink into the sand.
    const t = fitGround(physics.groundAt, p.x, p.z, spawn.yaw, spawn.sitting ? 1.3 : 1.0, spawn.sitting ? 0.6 : 0.3);
    p.y = t.y;
    this.rig.root.position.copy(p);
    this.rig.root.rotation.set(t.pitch, spawn.yaw, t.roll, 'YXZ');
    this.rig.anim.setBase(spawn.sitting ? 'Sit' : 'Idle', 0.8 + rnd() * 0.4, 0);
    // A short capsule at the body; camels are ~3 m long so use two.
    const fx = Math.sin(spawn.yaw);
    const fz = Math.cos(spawn.yaw);
    const r = spawn.sitting ? 0.6 : 0.55;
    const hh = spawn.sitting ? 0.1 : 0.6;
    for (const o of [-0.7, 0.7]) physics.addActor(r, hh, new THREE.Vector3(p.x + fx * o, p.y, p.z + fz * o));
    this.rig.anim.update(rnd() * 2);
  }

  update(dt: number): void {
    this.rig.anim.update(dt);
  }
}
