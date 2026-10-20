import * as THREE from 'three';
import { CharacterFactory, CLIP_SPEED, type Rig } from './characters';
import type { Horse } from './animals';
import type { FollowCamera } from './camera';
import type { Frame } from './input';
import type { NpcSystem, PlayerView } from './npc';
import { Mover, type Physics } from './physics';
import { dampAngle } from './util';
import type { World } from './world';

export const WALK_SPEED = 1.9;
export const RUN_SPEED = 5.2;
const MAX_HP = 100;

const ATTACKS = [
  { clip: 'Attack', hit: 0.4, chain: 0.5 },
  { clip: 'Attack2', hit: 0.375, chain: 0.45 },
];

export class Player implements PlayerView {
  readonly rig: Rig;
  readonly mover: Mover;
  /** Facing yaw; derived only from the camera-relative input direction. */
  yaw: number;
  hp = MAX_HP;
  horse: Horse | null = null;
  talking = false;
  /** Last movement direction (unit, world XZ) and the facing target derived from it. */
  readonly moveDir = new THREE.Vector3(0, 0, 1);
  yawTarget: number;
  speed = 0;
  animSpeed = 0;
  private attackIdx = 1;
  private attackT = -1;
  private attackQueued = false;
  private hitDone = true;
  private hurtCooldown = 0;
  private sinceHurt = 10;
  private deadTimer = 0;
  private _dead = false;
  private readonly spawn: THREE.Vector3;
  private readonly spawnYaw: number;
  onHurt: (dmg: number) => void = () => {};
  onDeath: () => void = () => {};
  onRespawn: () => void = () => {};
  onHit: (killed: boolean) => void = () => {};

  constructor(factory: CharacterFactory, physics: Physics, at: THREE.Vector3, yaw: number) {
    this.rig = factory.createPerson(['Keffiyeh', 'Beard', 'Sword'], {
      P_Robe: 0xf1ece0,
      P_Sash: 0xb3312b,
      P_Wrap: 0xf3eee2,
      P_Skin: 0xb17a50,
      P_Pants: 0x5a3f2c,
    });
    this.mover = new Mover(physics, 0.32, 0.55, at);
    this.yaw = this.yawTarget = yaw;
    this.spawn = at.clone();
    this.spawnYaw = yaw;
    this.rig.anim.setBase('Idle', 1, 0);
  }

  get pos(): THREE.Vector3 {
    return this.horse ? this.horse.pos : this.mover.feet;
  }
  get dead(): boolean {
    return this._dead;
  }
  get mounted(): boolean {
    return !!this.horse;
  }
  get maxHp(): number {
    return MAX_HP;
  }

  hurt(dmg: number): void {
    if (this._dead || this.hurtCooldown > 0) return;
    this.hurtCooldown = 0.3;
    this.sinceHurt = 0;
    this.hp = Math.max(0, this.hp - dmg);
    this.onHurt(dmg);
    if (this.hp <= 0) {
      this.die();
      return;
    }
    if (this.attackT < 0) this.rig.anim.playOverlay('Hit', { fade: 0.05 });
  }

  private die(): void {
    if (this.horse) this.dismount(null);
    this._dead = true;
    this.deadTimer = 4;
    this.attackT = -1;
    this.rig.anim.stopOverlay(0.1);
    this.rig.anim.setBase('Death', 1, 0.12);
    this.onDeath();
  }

  private respawn(): void {
    this._dead = false;
    this.hp = MAX_HP;
    this.mover.teleport(this.spawn);
    this.yaw = this.yawTarget = this.spawnYaw;
    this.rig.anim.setBase('Idle', 1, 0.2);
    this.onRespawn();
  }

  mount(h: Horse): void {
    this.horse = h;
    h.setRidden(true);
    this.mover.setEnabled(false);
    this.speed = 0;
    this.rig.anim.setBase('Ride', 0.4, 0.15);
  }

  /** Get off beside the horse: right side, then left, then behind. */
  dismount(world: World | null): void {
    const h = this.horse;
    if (!h) return;
    // A +Z-facing model has its right-hand side at local -X.
    const right = new THREE.Vector3(-Math.cos(h.yaw), 0, Math.sin(h.yaw));
    const back = new THREE.Vector3(-Math.sin(h.yaw), 0, -Math.cos(h.yaw));
    const options = [right.clone().multiplyScalar(1.5), right.clone().multiplyScalar(-1.5), back.multiplyScalar(2.4)];
    let spot = h.pos.clone().add(options[0]);
    if (world) {
      for (const o of options) {
        const p = h.pos.clone().add(o);
        if (!world.obstacles.blocked(p.x, p.z, 0.4)) {
          spot = p;
          break;
        }
      }
      spot.y = world.ground(spot.x, spot.z);
    }
    h.setRidden(false);
    this.horse = null;
    this.mover.teleport(spot);
    this.mover.setEnabled(true);
    this.yaw = this.yawTarget = h.yaw;
    this.moveDir.set(Math.sin(h.yaw), 0, Math.cos(h.yaw));
    this.rig.anim.setBase('Idle', 1, 0.15);
  }

  update(dt: number, f: Frame, cam: FollowCamera, npcs: NpcSystem): void {
    this.hurtCooldown -= dt;
    this.sinceHurt += dt;
    if (this._dead) {
      this.deadTimer -= dt;
      if (this.deadTimer <= 0) this.respawn();
      this.rig.anim.update(dt);
      this.syncRoot();
      return;
    }
    if (this.sinceHurt > 5 && this.hp < MAX_HP) this.hp = Math.min(MAX_HP, this.hp + 4 * dt);

    // Camera-relative input → world direction. W = screen up.
    const dir = new THREE.Vector3()
      .addScaledVector(cam.right, f.moveX)
      .addScaledVector(cam.forward, f.moveY);
    let mag = Math.min(1, dir.length());
    if (this.talking) mag = 0;
    if (mag > 0.001) dir.normalize();

    this.updateAttack(dt, f, npcs);

    if (this.horse) {
      const h = this.horse;
      h.drive(dt, dir.x, dir.z, mag, f.run);
      h.update(dt);
      this.yaw = this.yawTarget = h.yaw;
      this.rig.anim.setBase('Ride', THREE.MathUtils.clamp(h.speed / CLIP_SPEED.horseGallop, 0.3, 1.3), 0.15);
      this.animSpeed = h.speed;
    } else {
      const target = mag * (f.run ? RUN_SPEED : WALK_SPEED);
      if (mag > 0.001) {
        // Movement and facing share one direction: the input vector itself.
        this.moveDir.copy(dir);
        this.yawTarget = Math.atan2(dir.x, dir.z);
      }
      const accel = target > this.speed ? 28 : 22;
      this.speed = target > this.speed ? Math.min(target, this.speed + accel * dt) : Math.max(target, this.speed - accel * dt);
      this.yaw = dampAngle(this.yaw, this.yawTarget, 22, dt);
      const step = this.mover.move(this.moveDir.x * this.speed * dt, this.moveDir.z * this.speed * dt);
      const actual = dt > 0 ? Math.hypot(step.x, step.z) / dt : 0;
      // Foot speed follows the speed actually achieved (walls slow it down).
      this.animSpeed += (Math.min(actual, this.speed + 0.01) - this.animSpeed) * (1 - Math.exp(-dt * 15));
      const a = this.rig.anim;
      const s = this.animSpeed;
      if (s < 0.15) a.setBase('Idle', 1, 0.2);
      else if (s < 3.0) a.setBase('Walk', Math.max(0.35, s / CLIP_SPEED.personWalk), 0.18);
      else a.setBase('Run', s / CLIP_SPEED.personRun, 0.15);
    }
    this.rig.anim.update(dt);
    this.syncRoot();
  }

  private updateAttack(dt: number, f: Frame, npcs: NpcSystem): void {
    if (this.attackT >= 0) this.attackT += dt;
    const cur = ATTACKS[this.attackIdx];
    if (f.attack && !this.talking) this.attackQueued = true;
    const canStart = this.attackT < 0 || this.attackT >= cur.chain;
    if (this.attackQueued && canStart) {
      this.attackQueued = false;
      this.attackIdx = (this.attackIdx + 1) % ATTACKS.length;
      this.attackT = 0;
      this.hitDone = false;
      this.rig.anim.playOverlay(ATTACKS[this.attackIdx].clip, { fade: 0.06 });
    }
    const a = ATTACKS[this.attackIdx];
    if (this.attackT >= 0 && !this.hitDone && this.attackT >= a.hit) {
      this.hitDone = true;
      const range = this.horse ? 2.7 : 2.0;
      const hits = npcs.hitArc(this.pos, this.yaw, range, THREE.MathUtils.degToRad(this.horse ? 80 : 65), 34);
      if (hits.length) this.onHit(hits.some((n) => n.dead));
    }
    if (this.attackT > 0.85) this.attackT = -1;
  }

  private syncRoot(): void {
    const r = this.rig.root;
    if (this.horse) {
      this.horse.mountPoint(r.position);
    } else {
      r.position.copy(this.mover.feet);
    }
    r.rotation.y = this.yaw;
  }

  get attacking(): boolean {
    return this.attackT >= 0;
  }
}
