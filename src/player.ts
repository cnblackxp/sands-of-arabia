import * as THREE from 'three';
import { CharacterFactory, CLIP_SPEED, PLAYER_LOOKS, type Look, type Rig } from './characters';
import type { Horse } from './animals';
import type { FollowCamera } from './camera';
import type { HitResult, PlayerView } from './combat';
import { Flash } from './fx';
import type { Frame } from './input';
import { Mover, type Physics } from './physics';
import { dampAngle } from './util';
import type { World } from './world';

export const WALK_SPEED = 1.9;
export const RUN_SPEED = 5.2;
const MAX_HP = 100;
const MAX_STAMINA = 100;

/** Stamina costs (Dark Souls style: actions need stamina > 0; regen pauses after use). */
const COST = { attack: 18, roll: 24, jump: 14, sprintPerSec: 13 };
const REGEN = { rate: 42, delay: 0.75, delayEmpty: 1.4 };

const ATTACKS = [
  { clip: 'Attack', hit: 0.4, chain: 0.5, end: 0.78 },
  { clip: 'Attack2', hit: 0.375, chain: 0.46, end: 0.7 },
];

const ROLL = { duration: 0.62, distance: 4.2, iStart: 0.06, iEnd: 0.42 };
const JUMP = { v0: 5.2, gravity: 18 };
/** Heavy blows knock the player down: fall, lie, get up (with wake-up i-frames). */
const KNOCKDOWN = { fall: 0.75, lie: 0.35, getUp: 1.25 / 1.35 };

/** Hooks the game uses for feedback; the player itself stays presentation-free. */
export interface PlayerEvents {
  hurt(dmg: number, heavy: boolean): void;
  death(): void;
  respawn(): void;
  swing(): void;
  roll(): void;
  jump(): void;
  land(): void;
  exhausted(): void;
  /** Resolve a sword blow against everything in the arc. */
  strike(origin: THREE.Vector3, yaw: number, range: number, halfAngle: number, dmg: number): HitResult[];
  hit(results: HitResult[]): void;
  /** Aim assist target in front of the player, if any. */
  aim(origin: THREE.Vector3, yaw: number): THREE.Vector3 | null;
}

export class Player implements PlayerView {
  rig: Rig;
  readonly mover: Mover;
  /** Facing yaw; derived only from the movement direction. */
  yaw: number;
  hp = MAX_HP;
  stamina = MAX_STAMINA;
  horse: Horse | null = null;
  talking = false;
  readonly moveDir = new THREE.Vector3(0, 0, 1);
  yawTarget: number;
  speed = 0;
  animSpeed = 0;
  lookIndex = 0;
  readonly flash = new Flash();
  private attackIdx = 1;
  private attackT = -1;
  private attackQueued = 0;
  private hitDone = true;
  private rollT = -1;
  private rollQueued = 0;
  private jumpQueued = 0;
  private jumpH = 0;
  private jumpV = 0;
  private airborne = false;
  private readonly rollDir = new THREE.Vector3();
  private staminaDelay = 0;
  private exhausted = false;
  private staggerT = 0;
  /** >0 while knocked down; counts the whole fall, lie and get-up sequence. */
  private downT = 0;
  private readonly knock = new THREE.Vector3();
  private invulnT = 0;
  private sinceHurt = 10;
  private deadTimer = 0;
  private _dead = false;
  private readonly spawn: THREE.Vector3;
  private readonly spawnYaw: number;

  constructor(
    private factory: CharacterFactory,
    physics: Physics,
    at: THREE.Vector3,
    yaw: number,
    private ev: PlayerEvents,
  ) {
    this.rig = this.buildRig(PLAYER_LOOKS[0]);
    this.mover = new Mover(physics, 0.32, 0.55, at);
    this.yaw = this.yawTarget = yaw;
    this.spawn = at.clone();
    this.spawnYaw = yaw;
  }

  private buildRig(look: Look): Rig {
    const rig = this.factory.createPerson(look.acc, look.colours);
    rig.anim.setBase('Idle', 1, 0);
    this.flash.attach(rig.root);
    return rig;
  }

  /** Swap the character model; returns the old root so the caller can remove it. */
  setLook(i: number, robe?: number): THREE.Object3D {
    this.lookIndex = ((i % PLAYER_LOOKS.length) + PLAYER_LOOKS.length) % PLAYER_LOOKS.length;
    const base = PLAYER_LOOKS[this.lookIndex];
    const look: Look = robe === undefined ? base : { ...base, colours: { ...base.colours, P_Robe: robe } };
    const old = this.rig.root;
    this.rig = this.buildRig(look);
    this.rig.anim.setBase(this.horse ? 'Ride' : 'Idle', 1, 0);
    this.rig.anim.update(0);
    this.syncRoot();
    return old;
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
  get maxStamina(): number {
    return MAX_STAMINA;
  }
  get rolling(): boolean {
    return this.rollT >= 0;
  }
  get jumping(): boolean {
    return this.airborne;
  }
  get attacking(): boolean {
    return this.attackT >= 0;
  }
  get invulnerable(): boolean {
    // No hitting a downed player: invulnerable from the fall until back on their feet.
    const gettingUp = this.downT > 0;
    return this.invulnT > 0 || gettingUp || (this.rollT >= ROLL.iStart && this.rollT <= ROLL.iEnd);
  }
  get isExhausted(): boolean {
    return this.exhausted;
  }

  hurt(dmg: number, from: THREE.Vector3, knock = 1.5): boolean {
    if (this._dead) return false;
    if (this.invulnerable) return false;
    this.invulnT = 0.45;
    this.sinceHurt = 0;
    this.hp = Math.max(0, this.hp - dmg);
    this.flash.hit(0.1);
    const heavy = dmg >= 25;
    this.ev.hurt(dmg, heavy);
    if (this.hp <= 0) {
      this.die();
      return true;
    }
    if (!this.horse) {
      // Flinch: interrupt the attack and slide back.
      this.knock.copy(this.mover.feet).sub(from).setY(0).normalize().multiplyScalar(knock * 2.2);
      this.attackT = -1;
      this.attackQueued = 0;
      this.rollT = -1;
      if (heavy && !this.airborne) {
        // Heavy blows knock you down.
        this.downT = KNOCKDOWN.fall + KNOCKDOWN.lie + KNOCKDOWN.getUp;
        this.staggerT = this.downT;
        this.yaw = this.yawTarget = Math.atan2(from.x - this.mover.feet.x, from.z - this.mover.feet.z);
        this.rig.anim.stopOverlay(0.05);
        this.rig.anim.setBase('Knockdown', 1, 0.05, true);
      } else {
        this.staggerT = 0.32;
        this.rig.anim.playOverlay('Hit', { fade: 0.04 });
      }
    }
    return true;
  }

  private die(): void {
    if (this.horse) this.dismount(null);
    this._dead = true;
    this.deadTimer = 4;
    this.attackT = -1;
    this.rollT = -1;
    this.airborne = false;
    this.jumpH = 0;
    this.downT = 0;
    this.staggerT = 0;
    this.rig.anim.stopOverlay(0.1);
    this.rig.anim.setBase('Death', 1, 0.12);
    this.ev.death();
  }

  private respawn(): void {
    this._dead = false;
    this.hp = MAX_HP;
    this.stamina = MAX_STAMINA;
    this.mover.teleport(this.spawn);
    this.yaw = this.yawTarget = this.spawnYaw;
    this.rig.anim.setBase('Idle', 1, 0.2);
    this.ev.respawn();
  }

  mount(h: Horse): void {
    this.horse = h;
    h.setRidden(true);
    this.mover.setEnabled(false);
    this.speed = 0;
    this.rollT = -1;
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

  private spend(n: number): boolean {
    if (this.stamina <= 0) {
      this.ev.exhausted();
      return false;
    }
    this.stamina = Math.max(0, this.stamina - n);
    this.staminaDelay = this.stamina <= 0 ? REGEN.delayEmpty : REGEN.delay;
    if (this.stamina <= 0) this.exhausted = true;
    return true;
  }

  update(dt: number, f: Frame, cam: FollowCamera): void {
    this.invulnT -= dt;
    this.sinceHurt += dt;
    this.flash.update(dt);
    if (this._dead) {
      this.deadTimer -= dt;
      if (this.deadTimer <= 0) this.respawn();
      this.rig.anim.update(dt);
      this.syncRoot();
      return;
    }
    if (this.sinceHurt > 5 && this.hp < MAX_HP) this.hp = Math.min(MAX_HP, this.hp + 3 * dt);

    // Camera-relative input → world direction. W = screen up.
    const dir = new THREE.Vector3().addScaledVector(cam.right, f.moveX).addScaledVector(cam.forward, f.moveY);
    let mag = Math.min(1, dir.length());
    if (this.talking) mag = 0;
    if (mag > 0.001) dir.normalize();

    if (this.horse) {
      this.updateAttack(dt, f);
      const h = this.horse;
      h.drive(dt, dir.x, dir.z, mag, f.run);
      h.update(dt);
      this.yaw = this.yawTarget = h.yaw;
      this.rig.anim.setBase('Ride', THREE.MathUtils.clamp(h.speed / CLIP_SPEED.horseGallop, 0.3, 1.3), 0.15);
      this.animSpeed = h.speed;
      this.regen(dt, false);
      this.rig.anim.update(dt);
      this.syncRoot();
      return;
    }

    // Buffered inputs (a short window so presses just before a recovery ends still count).
    this.attackQueued = Math.max(0, this.attackQueued - dt);
    this.rollQueued = Math.max(0, this.rollQueued - dt);
    if (f.attack && !this.talking) this.attackQueued = 0.35;
    if (f.dodge && !this.talking) this.rollQueued = 0.3;
    if (f.jump && !this.talking) this.jumpQueued = 0.2;
    this.jumpQueued = Math.max(0, this.jumpQueued - dt);

    let sprinting = false;
    let step = { x: 0, z: 0 };

    if (this.airborne) {
      // Ballistic arc; a little air steering, facing follows the travel direction.
      this.jumpV -= JUMP.gravity * dt;
      this.jumpH += this.jumpV * dt;
      if (mag > 0.001) {
        this.moveDir.lerp(dir, 1 - Math.exp(-dt * 4)).normalize();
        this.yawTarget = Math.atan2(this.moveDir.x, this.moveDir.z);
      }
      this.updateAttack(dt, f);
      if (this.jumpH <= 0 && this.jumpV < 0) {
        this.jumpH = 0;
        this.airborne = false;
        this.ev.land();
        this.rig.anim.setBase(this.speed > 3 ? 'Run' : this.speed > 0.15 ? 'Walk' : 'Idle', 1, 0.1);
      }
      step = this.mover.move(this.moveDir.x * this.speed * dt, this.moveDir.z * this.speed * dt, this.jumpH);
    } else if (this.staggerT > 0) {
      this.staggerT -= dt;
      if (this.downT > 0) {
        const before = this.downT;
        this.downT -= dt;
        // Lying still, then get up.
        if (before > KNOCKDOWN.getUp && this.downT <= KNOCKDOWN.getUp) this.rig.anim.setBase('GetUp', 1.35, 0.05, true);
        if (this.downT <= 0) {
          this.downT = 0;
          this.staggerT = 0;
          this.rig.anim.setBase('Idle', 1, 0.15);
        }
      }
      this.speed = 0;
      step = this.mover.move(this.knock.x * dt, this.knock.z * dt);
      this.knock.multiplyScalar(Math.max(0, 1 - dt * 8));
    } else if (this.rollT >= 0) {
      this.rollT += dt;
      // Fast out, eased landing.
      const u = this.rollT / ROLL.duration;
      const v = (ROLL.distance / ROLL.duration) * (u < 0.7 ? 1.25 : Math.max(0, 1.25 * (1 - (u - 0.7) / 0.3)));
      step = this.mover.move(this.rollDir.x * v * dt, this.rollDir.z * v * dt);
      if (this.rollT >= ROLL.duration) {
        this.rollT = -1;
        this.rig.anim.setBase(mag > 0.01 ? 'Walk' : 'Idle', 1, 0.12);
      }
    } else {
      const canRoll = this.attackT < 0 || this.attackT >= ATTACKS[this.attackIdx].hit + 0.12;
      if (this.jumpQueued > 0 && this.attackT < 0 && this.spend(COST.jump)) {
        this.jumpQueued = 0;
        this.airborne = true;
        this.jumpH = 0;
        this.jumpV = JUMP.v0;
        // Keep running momentum into the jump.
        if (mag > 0.001) this.moveDir.copy(dir);
        this.yawTarget = Math.atan2(this.moveDir.x, this.moveDir.z);
        this.rig.anim.setBase('Jump', 1, 0.05, true);
        this.ev.jump();
      } else if (this.rollQueued > 0 && canRoll && this.spend(COST.roll)) {
        this.rollQueued = 0;
        this.attackT = -1;
        this.attackQueued = 0;
        this.rollT = 0;
        // Roll toward the input, or forward if there is none. Facing = roll direction.
        this.rollDir.copy(mag > 0.01 ? dir : this.moveDir);
        this.moveDir.copy(this.rollDir);
        this.yaw = this.yawTarget = Math.atan2(this.rollDir.x, this.rollDir.z);
        this.rig.anim.stopOverlay(0.05);
        this.rig.anim.setBase('Roll', 1, 0.05, true);
        this.ev.roll();
      } else {
        if (this.rollQueued > 0 && canRoll) this.rollQueued = 0;
        this.updateAttack(dt, f);
        const committed = this.attackT >= 0 && this.attackT < ATTACKS[this.attackIdx].hit + 0.1;
        if (committed) {
          // Committed swing: a short lunge along the facing, no steering.
          const a = ATTACKS[this.attackIdx];
          const lunge = this.attackT > a.hit - 0.18 && this.attackT < a.hit ? 3.2 : 0.4;
          this.speed = 0;
          step = this.mover.move(this.moveDir.x * lunge * dt, this.moveDir.z * lunge * dt);
        } else {
          if (this.exhausted && this.stamina > 25) this.exhausted = false;
          sprinting = f.run && mag > 0.5 && !this.exhausted && this.stamina > 0 && this.attackT < 0;
          const slow = this.attackT >= 0 ? 0.35 : 1;
          const target = mag * (sprinting ? RUN_SPEED : WALK_SPEED) * slow;
          if (mag > 0.001) {
            // Movement and facing share one direction: the input vector itself.
            this.moveDir.copy(dir);
            this.yawTarget = Math.atan2(dir.x, dir.z);
          }
          const accel = target > this.speed ? 28 : 22;
          this.speed = target > this.speed ? Math.min(target, this.speed + accel * dt) : Math.max(target, this.speed - accel * dt);
          step = this.mover.move(this.moveDir.x * this.speed * dt, this.moveDir.z * this.speed * dt);
        }
      }
    }
    this.yaw = dampAngle(this.yaw, this.yawTarget, 22, dt);

    if (sprinting) {
      this.stamina = Math.max(0, this.stamina - COST.sprintPerSec * dt);
      this.staminaDelay = Math.max(this.staminaDelay, 0.3);
      if (this.stamina <= 0) {
        this.exhausted = true;
        this.staminaDelay = REGEN.delayEmpty;
      }
    }
    this.regen(dt, sprinting);

    // Foot speed follows the speed actually achieved (walls slow it down).
    const actual = dt > 0 ? Math.hypot(step.x, step.z) / dt : 0;
    this.animSpeed += (Math.min(actual, this.speed + 0.01) - this.animSpeed) * (1 - Math.exp(-dt * 15));
    if (this.rollT < 0 && !this.airborne && this.downT <= 0) {
      const a = this.rig.anim;
      const s = this.animSpeed;
      if (s < 0.15) a.setBase('Idle', 1, 0.2);
      else if (s < 3.0) a.setBase('Walk', Math.max(0.35, s / CLIP_SPEED.personWalk), 0.18);
      else a.setBase('Run', s / CLIP_SPEED.personRun, 0.15);
    }
    this.rig.anim.update(dt);
    this.syncRoot();
  }

  private regen(dt: number, sprinting: boolean): void {
    if (this.staminaDelay > 0) this.staminaDelay -= dt;
    else if (!sprinting && this.attackT < 0 && this.rollT < 0) this.stamina = Math.min(MAX_STAMINA, this.stamina + REGEN.rate * dt);
  }

  private updateAttack(dt: number, f: Frame): void {
    if (this.attackT >= 0) this.attackT += dt;
    if (this.horse && f.attack && !this.talking) this.attackQueued = 0.35;
    const cur = ATTACKS[this.attackIdx];
    const canStart = this.attackT < 0 || this.attackT >= cur.chain;
    if (this.attackQueued > 0 && canStart && !this.talking) {
      this.attackQueued = 0;
      if (this.spend(COST.attack)) {
        this.attackIdx = (this.attackIdx + 1) % ATTACKS.length;
        this.attackT = 0;
        this.hitDone = false;
        if (!this.horse) {
          // Aim assist: snap toward an enemy in front so the lunge connects.
          const target = this.ev.aim(this.pos, this.yaw);
          if (target) {
            const a = Math.atan2(target.x - this.pos.x, target.z - this.pos.z);
            this.yaw = this.yawTarget = a;
            this.moveDir.set(Math.sin(a), 0, Math.cos(a));
          }
        }
        this.rig.anim.playOverlay(ATTACKS[this.attackIdx].clip, { fade: 0.06 });
        this.ev.swing();
      }
    }
    const a = ATTACKS[this.attackIdx];
    if (this.attackT >= 0 && !this.hitDone && this.attackT >= a.hit) {
      this.hitDone = true;
      const range = this.horse ? 2.7 : 2.1;
      const hits = this.ev.strike(this.pos, this.yaw, range, THREE.MathUtils.degToRad(this.horse ? 80 : 65), 34);
      if (hits.length) this.ev.hit(hits);
    }
    if (this.attackT > a.end) this.attackT = -1;
  }

  private syncRoot(): void {
    const r = this.rig.root;
    if (this.horse) {
      this.horse.mountPoint(r.position);
      r.rotation.set(this.horse.pitch, this.yaw, this.horse.roll, 'YXZ');
    } else {
      r.position.copy(this.mover.feet);
      r.rotation.set(0, this.yaw, 0, 'YXZ');
    }
  }
}
