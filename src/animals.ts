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
  /** Winged horse: huge jumps and a mid-air second jump, glides down. */
  readonly winged: boolean;
  private mount: THREE.Bone;
  private groundAt: (x: number, z: number) => number;
  private readonly hasWings: boolean;
  private vy = 0;
  private airborne = false;
  private flapT = 0;
  private airJumps = 0;

  constructor(factory: CharacterFactory, private physics: Physics, spawn: Spawn, rnd: () => number, winged = false) {
    this.winged = winged;
    // The dedicated winged model (wings + Flap/Glide clips) when available,
    // else a white horse standing in for it.
    this.hasWings = winged && factory.hasWingedModel;
    this.rig = this.hasWings
      ? factory.createWingedHorse()
      : factory.createHorse(
          winged
            ? { H_Coat: 0xf2efe8, H_Mane: 0xd9c9a0, H_Blanket: 0x2c3e73 }
            : { H_Coat: pick(PAL.horseCoat, rnd), H_Mane: pick(PAL.horseMane, rnd), H_Blanket: pick(PAL.blanket, rnd) },
          true,
        );
    const feet = new THREE.Vector3(...spawn.pos);
    // Markers on platforms carry their height (the winged horse waits on a plateau).
    feet.y = physics.support(feet.x, feet.z, spawn.pos[1] + 0.3);
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

  get jumping(): boolean {
    return this.airborne;
  }

  /** Jump (ridden). Winged horses can jump again in mid-air. */
  jump(): void {
    if (!this.airborne) {
      this.airborne = true;
      this.vy = this.winged ? 13 : 7;
      this.airJumps = 0;
    } else if (this.winged && this.airJumps < 1) {
      this.airJumps++;
      this.vy = 12;
    }
    this.flapT = 0.6;
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
    let moved: { x: number; z: number; falling: boolean };
    if (this.airborne) {
      // Winged horses glide down slowly.
      const g = this.winged && this.vy < 0 ? 9 : 26;
      this.vy = Math.max(this.winged ? -6 : -28, this.vy - g * dt);
      const prevY = this.mover.feet.y;
      moved = this.mover.move(fx * this.speed * dt, fz * this.speed * dt, prevY + this.vy * dt);
      const f = this.mover.feet;
      const floor = this.physics.support(f.x, f.z, prevY + 0.05);
      if (this.vy <= 0 && f.y <= floor + 0.02) {
        this.airborne = false;
        this.vy = 0;
        this.mover.move(0, 0, floor);
      }
    } else {
      moved = this.mover.move(fx * this.speed * dt, fz * this.speed * dt);
      if (moved.falling) {
        this.airborne = true;
        this.vy = 0;
      }
    }
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
    if (this.hasWings && this.airborne) {
      // Beat the wings on the way up (and just after a jump), glide down.
      if (this.vy > 0 || this.flapT > 0) a.setBase('Flap', 1.3, 0.12);
      else a.setBase('Glide', 1, 0.25);
      return;
    }
    if (this.speed < 0.25) a.setBase('Idle', 1, 0.3);
    else if (this.speed < 5) a.setBase('Walk', Math.max(0.5, this.speed / CLIP_SPEED.horseWalk), 0.25);
    else a.setBase('Gallop', this.speed / CLIP_SPEED.horseGallop, 0.25);
  }

  update(dt: number): void {
    this.flapT -= dt;
    this.rig.anim.update(dt);
    this.sync();
  }

  private sync(): void {
    // Lean with the dunes so hooves stay on the sand.
    const f = this.mover.feet;
    const t = fitGround(this.groundAt, f.x, f.z, this.yaw, 1.1, 0.35);
    // On sand, lean with the dunes; on a box top or in the air, stay level.
    const onSand = !this.airborne && Math.abs(f.y - this.groundAt(f.x, f.z)) < 0.05;
    this.pitch += ((onSand ? t.pitch : this.airborne ? -Math.min(0.35, this.vy * 0.03) : 0) - this.pitch) * 0.25;
    this.roll += ((onSand ? t.roll * 0.6 : 0) - this.roll) * 0.25;
    this.rig.root.position.set(f.x, onSand ? t.y : f.y, f.z);
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
