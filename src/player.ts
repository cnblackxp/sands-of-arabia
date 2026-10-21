import * as THREE from 'three';
import { CharacterFactory, CLIP_SPEED, PLAYER_LOOKS, type Accessory, type Look, type Rig } from './characters';
import type { Horse } from './animals';
import type { FollowCamera } from './camera';
import type { HitResult, PlayerView } from './combat';
import { Flash } from './fx';
import type { Frame } from './input';
import { weapon, type WeaponDef } from './items';
import { Mover, type Physics } from './physics';
import type { Progress } from './progress';
import { dampAngle, wrapAngle } from './util';
import type { ClipMeta, World } from './world';

export const WALK_SPEED = 3.0;
export const RUN_SPEED = 6.2;
/** A light push on the stick walks slowly (a real walk), a full push moves at WALK_SPEED. */
const SLOW_WALK = { below: 0.6, min: 0.8, max: 1.5 };

/** Stamina costs (Dark Souls style: actions need stamina > 0; regen pauses after use). */
const COST = { roll: 24, jump: 10, sprintPerSec: 13 };
const REGEN = { rate: 42, delay: 0.75, delayEmpty: 1.4 };

const ROLL = { duration: 0.62, distance: 4.2, iStart: 0.06, iEnd: 0.42 };
/** Leaping off a moving horse: above walking pace it's a leap, above a canter it ends in a roll. */
const LEAP = { minSpeed: 3, rollSpeed: 7, saddle: 1.2, side: 1.1, vy: 6.5, carry: 0.6, maxCarry: 7.5 };
/**
 * Platformer jump: fast rise, held jump floats higher (≈1.8 m), release cuts it
 * short, faster fall, coyote time after walking off a ledge, and an optional
 * double jump (≈+1.6 m). Held, it reaches about 2.1 m.
 */
const JUMP = { v0: 9.9, v2: 8.6, gHeld: 23, gRise: 46, gFall: 36, maxFall: 28, coyote: 0.12, air: 7 };
/** Heavy blows knock the player down: fall, lie, get up (no hits while down). */
const KNOCKDOWN = { fall: 0.75, lie: 0.35, getUp: 1.25 / 1.35 };
const HEAL = { duration: 0.9, at: 0.55, fraction: 0.45 };
/** Bow: walk slowly while drawn; a released shot needs a fresh nock and draw. */
const BOW = { moveK: 0.45, relaxFade: 0.18 };

/** Where the game says the bow points this frame (camera, cursor or stick). */
export interface BowAim {
  yaw: number;
  /** Elevation of the shot, radians (+ = up). */
  pitch: number;
  from: THREE.Vector3;
  vel: THREE.Vector3;
}

/** Procedural held bow (until the BowHeld accessory exists): grip, two recurved limbs, string. */
function buildBowMesh(): THREE.Group {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.7 });
  const horn = new THREE.MeshStandardMaterial({ color: 0xd9c9a0, roughness: 0.5 });
  const string = new THREE.MeshBasicMaterial({ color: 0xe8dcc0 });
  const box = (w: number, h: number, d: number, m: THREE.Material, y: number, z: number, rx: number) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(0, y, z);
    b.rotation.x = rx;
    b.castShadow = true;
    g.add(b);
    return b;
  };
  // Limbs along local +Y / -Y, bending back toward -Z (the archer), tips flicking forward.
  box(0.045, 0.16, 0.05, wood, 0, 0, 0);
  box(0.035, 0.36, 0.035, wood, 0.25, -0.04, 0.25);
  box(0.035, 0.36, 0.035, wood, -0.25, -0.04, -0.25);
  box(0.03, 0.12, 0.03, horn, 0.47, -0.06, -0.45);
  box(0.03, 0.12, 0.03, horn, -0.47, -0.06, 0.45);
  g.userData.string = box(0.008, 1.0, 0.008, string, 0, 0, -0.1);
  return g;
}

interface Swing {
  clip: string;
  hit: number;
  chain: number;
  end: number;
}

/** Hooks the game uses for feedback and world queries. */
export interface PlayerEvents {
  hurt(dmg: number, heavy: boolean): void;
  blocked(): void;
  death(): void;
  /** Called when the death screen is over; the game decides where to wake. */
  respawn(): void;
  swing(): void;
  roll(): void;
  jump(double: boolean): void;
  land(fall: number): void;
  heal(): void;
  exhausted(): void;
  /** Heavy blow: knocked off your feet; then back up. */
  knockdown(): void;
  getUp(): void;
  /** Shield raised; or broken by a blow with no stamina left. */
  shieldUp(): void;
  guardBreak(): void;
  horseJump(winged: boolean): void;
  /** Tried to drink with no waterskins left. */
  noFlask(): void;
  /** Bow: where it points now (the game knows the camera, cursor and targets). */
  bowAim(quick: boolean): BowAim;
  /** Bow: started nocking/drawing, let the string down, loosed an arrow, quiver empty. */
  bowDraw(): void;
  bowRelax(): void;
  shoot(aim: BowAim): void;
  noArrows(): void;
  /** Tried to attack inside the truce. */
  truce(): void;
  /** Resolve a weapon blow against everything in the arc. */
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
  hp: number;
  stamina: number;
  horse: Horse | null = null;
  talking = false;
  /** Set by the game: enemies engaged or a camp nearby. Sprinting is free otherwise. */
  inCombat = false;
  /** Debug: no damage / no stamina use. */
  god = false;
  readonly moveDir = new THREE.Vector3(0, 0, 1);
  yawTarget: number;
  speed = 0;
  animSpeed = 0;
  lookIndex = 0;
  robe: number | undefined;
  readonly flash = new Flash();
  private wpn: WeaponDef;
  private swings: Swing[] = [];
  private attackIdx = 0;
  private attackT = -1;
  private attackQueued = 0;
  private hitDone = true;
  private rollT = -1;
  private rollQueued = 0;
  private jumpQueued = 0;
  private vy = 0;
  private airborne = false;
  private airJumps = 0;
  private coyote = 0;
  private fallFrom = 0;
  /** Landing from a leap off a galloping horse rolls forward. */
  private landRoll = false;
  /** In the air after leaping off a horse: the horse's momentum carries on undamped. */
  private leaping = false;
  private landT = 0;
  private readonly rollDir = new THREE.Vector3();
  private staminaDelay = 0;
  private exhausted = false;
  private staggerT = 0;
  private downT = 0;
  private blocking = false;
  private healT = -1;
  private healed = false;
  private readonly knock = new THREE.Vector3();
  private invulnT = 0;
  private sinceHurt = 10;
  private deadTimer = 0;
  private _dead = false;
  /** Bow state: aim held, draw progress (s), a quick shot (attack without aiming) pending. */
  private aimHeld = false;
  private drawT = -1;
  private quickShot = false;
  private shotQueued = false;
  /** Authored release clip playing; the next draw starts after it. */
  private releaseT = 0;
  private aimW = 0;
  private bowMesh: THREE.Group | null = null;
  /** Last aim from the game (used for facing and the arm pose). */
  aim: BowAim | null = null;
  /** Gamepad + overhead camera: the stick turns the aim instead of walking. */
  aimLocksMove = false;
  /** Inside a truce (Ukaz): attacks are refused. */
  peaceful = false;
  /** Arrow model shown on the string while drawn (set by the game). */
  nockModel: THREE.Object3D | null = null;
  private nock: THREE.Object3D | null = null;

  constructor(
    private factory: CharacterFactory,
    private physics: Physics,
    at: THREE.Vector3,
    yaw: number,
    private ev: PlayerEvents,
    private progress: Progress,
    private clips: Record<string, ClipMeta>,
  ) {
    this.wpn = weapon(progress.data.equipped);
    this.rig = this.buildRig();
    this.mover = new Mover(physics, 0.32, 0.55, at);
    this.yaw = this.yawTarget = yaw;
    this.hp = progress.maxHp;
    this.stamina = progress.maxStamina;
    this.buildSwings();
  }

  private buildSwings(): void {
    const s = this.wpn.speed;
    this.swings = this.wpn.clips.map((clip) => {
      const m = this.clips[clip];
      const hit = (m?.hit_time ?? 0.375) / s;
      const dur = (m?.duration ?? 0.75) / s;
      return { clip, hit, chain: hit + 0.12, end: dur * 0.92 };
    });
    this.attackIdx = this.swings.length - 1;
  }

  private gear(look: Look): Accessory[] {
    const acc: Accessory[] = look.acc.filter((a) => a !== 'Sword' && a !== 'Spear' && a !== 'Shield');
    if (this.wpn.kind === 'bow') {
      // Two hands on the bow: no shield. The held bow is BowHeld when the model has it.
      acc.push('BowHeld', 'Quiver');
      return acc;
    }
    if (this.wpn.mesh) acc.push(this.wpn.mesh);
    if (this.progress.shield) acc.push('Shield');
    return acc;
  }

  get hasBow(): boolean {
    return this.wpn.kind === 'bow';
  }
  /** Bow drawn and aimed (camera shoulder view, aim arc). */
  get aiming(): boolean {
    return this.hasBow && (this.aimHeld || this.quickShot) && !this._dead;
  }
  /** 0..1 how far the string is drawn. */
  get drawK(): number {
    return this.drawT < 0 ? 0 : Math.min(1, this.drawT / (this.wpn.draw ?? 0.6));
  }
  get drawn(): boolean {
    return this.drawK >= 1;
  }

  private buildRig(): Rig {
    const base = PLAYER_LOOKS[this.lookIndex];
    const colours = this.robe === undefined ? base.colours : { ...base.colours, P_Robe: this.robe };
    const rig = this.factory.createPerson(this.gear(base), colours);
    rig.anim.setBase('Idle', 1, 0);
    this.flash.attach(rig.root);
    this.bowMesh = null;
    if (this.wpn.kind === 'bow' && !this.factory.hasPart('BowHeld')) {
      const hand = rig.bones.get('hand_L');
      if (hand) {
        this.bowMesh = buildBowMesh();
        hand.add(this.bowMesh);
      }
    }
    return rig;
  }

  /** Rebuild the model (look, robe, weapon or shield changed); returns the old root to remove. */
  rebuild(): THREE.Object3D {
    this.wpn = weapon(this.progress.data.equipped);
    this.buildSwings();
    const old = this.rig.root;
    this.rig = this.buildRig();
    this.rig.anim.setBase(this.horse ? 'Ride' : 'Idle', 1, 0);
    this.rig.anim.update(0);
    this.syncRoot();
    return old;
  }

  setLook(i: number, robe?: number): THREE.Object3D {
    this.lookIndex = ((i % PLAYER_LOOKS.length) + PLAYER_LOOKS.length) % PLAYER_LOOKS.length;
    this.robe = robe;
    return this.rebuild();
  }

  get weapon(): WeaponDef {
    return this.wpn;
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
    return this.progress.maxHp;
  }
  get maxStamina(): number {
    return this.progress.maxStamina;
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
  get busy(): boolean {
    return this.attackT >= 0 || this.rollT >= 0 || this.airborne || this.staggerT > 0 || this.healT >= 0;
  }
  get invulnerable(): boolean {
    return this.god || this.invulnT > 0 || this.downT > 0 || (this.rollT >= ROLL.iStart && this.rollT <= ROLL.iEnd);
  }
  get isExhausted(): boolean {
    return this.exhausted;
  }
  get isBlocking(): boolean {
    return this.blocking;
  }

  hurt(dmg: number, from: THREE.Vector3, knock = 1.5): boolean {
    if (this._dead) return false;
    if (this.invulnerable) return false;
    // Shield up and facing the blow: stamina takes it instead.
    if (this.blocking) {
      const toward = Math.atan2(from.x - this.mover.feet.x, from.z - this.mover.feet.z);
      if (Math.cos(wrapAngle(toward - this.yaw)) > 0.35) {
        this.stamina -= dmg * 1.6;
        this.staminaDelay = REGEN.delay;
        this.invulnT = 0.25;
        this.knock.copy(this.mover.feet).sub(from).setY(0).normalize().multiplyScalar(knock * 1.2);
        this.ev.blocked();
        if (this.stamina > 0) {
          this.rig.anim.playOverlay('BlockHit', { fade: 0.03 });
          return false;
        }
        // Guard broken: stamina gone, part of the blow gets through.
        this.stamina = 0;
        this.exhausted = true;
        this.blocking = false;
        this.ev.guardBreak();
        dmg *= 0.35;
      }
    }
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
      this.knock.copy(this.mover.feet).sub(from).setY(0).normalize().multiplyScalar(knock * 2.2);
      this.attackT = -1;
      this.attackQueued = 0;
      this.rollT = -1;
      this.healT = -1;
      this.blocking = false;
      if (heavy && !this.airborne) {
        this.downT = KNOCKDOWN.fall + KNOCKDOWN.lie + KNOCKDOWN.getUp;
        this.staggerT = this.downT;
        this.yaw = this.yawTarget = Math.atan2(from.x - this.mover.feet.x, from.z - this.mover.feet.z);
        this.rig.anim.stopOverlay(0.05);
        this.rig.anim.setBase('Knockdown', 1, 0.05, true);
        this.ev.knockdown();
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
    this.healT = -1;
    this.airborne = false;
    this.downT = 0;
    this.staggerT = 0;
    this.blocking = false;
    this.rig.anim.stopOverlay(0.1);
    this.rig.anim.setBase('Death', 1, 0.12);
    this.ev.death();
  }

  /** Wake up at a checkpoint (the game picks it). */
  revive(at: THREE.Vector3, yaw: number): void {
    this._dead = false;
    this.hp = this.maxHp;
    this.stamina = this.maxStamina;
    this.mover.teleport(at);
    this.yaw = this.yawTarget = yaw;
    this.vy = 0;
    this.rig.anim.setBase('Idle', 1, 0.2);
  }

  /** Bonfire rest: full health, stamina and waterskins. */
  restore(): void {
    this.hp = this.maxHp;
    this.stamina = this.maxStamina;
    this.progress.data.flasks = this.progress.maxFlasks;
    this.progress.save();
  }

  mount(h: Horse): void {
    this.horse = h;
    h.setRidden(true);
    this.mover.setEnabled(false);
    this.speed = 0;
    this.rollT = -1;
    this.blocking = false;
    this.rig.anim.stopOverlay(0.1);
    this.rig.anim.setBase('Ride', 0.4, 0.15);
  }

  /** Get off beside the horse: right side, then left, then behind. */
  dismount(world: World | null): void {
    const h = this.horse;
    if (!h) return;
    if (h.speed > LEAP.minSpeed && world && this.leapOff(h, world)) return;
    // A +Z-facing model has its right-hand side at local -X.
    const right = new THREE.Vector3(-Math.cos(h.yaw), 0, Math.sin(h.yaw));
    const back = new THREE.Vector3(-Math.sin(h.yaw), 0, -Math.cos(h.yaw));
    const options = [right.clone().multiplyScalar(1.5), right.clone().multiplyScalar(-1.5), back.multiplyScalar(2.4)];
    let spot = h.pos.clone().add(options[0]);
    if (world) {
      for (const o of options) {
        const p = h.pos.clone().add(o);
        if (!world.nav.isBlocked(p.x, p.z)) {
          spot = p;
          break;
        }
      }
      spot.y = this.physics.support(spot.x, spot.z, h.pos.y + 0.3);
    }
    h.setRidden(false);
    this.horse = null;
    this.mover.teleport(spot);
    this.mover.setEnabled(true);
    this.yaw = this.yawTarget = h.yaw;
    this.moveDir.set(Math.sin(h.yaw), 0, Math.cos(h.yaw));
    this.rig.anim.setBase('Idle', 1, 0.15);
  }

  /**
   * Dismounting a moving horse (Elden Ring style): spring up out of the saddle and
   * off to one side, carry the horse's momentum through the air, and land into a
   * forward roll if it was galloping. The horse runs on and slows to a stop.
   */
  private leapOff(h: Horse, world: World): boolean {
    const right = new THREE.Vector3(-Math.cos(h.yaw), 0, Math.sin(h.yaw));
    const fwd = new THREE.Vector3(Math.sin(h.yaw), 0, Math.cos(h.yaw));
    let side = 0;
    for (const s of [1, -1]) {
      const p = h.pos.clone().addScaledVector(right, s * LEAP.side);
      if (!world.nav.isBlocked(p.x, p.z)) {
        side = s;
        break;
      }
    }
    if (!side) return false;
    // Letting go resets a horse's speed: keep it, so the horse runs on.
    const v = h.speed;
    const from = h.pos.clone().addScaledVector(right, side * LEAP.side);
    from.y = Math.max(h.pos.y + LEAP.saddle, this.physics.support(from.x, from.z, h.pos.y + LEAP.saddle) + 0.1);
    h.setRidden(false);
    h.speed = v;
    this.horse = null;
    this.mover.teleport(from);
    this.mover.setEnabled(true);
    // Forward with the horse, a little outward, up out of the saddle.
    this.moveDir.copy(fwd).addScaledVector(right, side * 0.2).normalize();
    this.speed = Math.min(LEAP.maxCarry, v * LEAP.carry);
    this.yaw = this.yawTarget = Math.atan2(this.moveDir.x, this.moveDir.z);
    this.airborne = true;
    this.vy = LEAP.vy;
    this.coyote = 0;
    this.airJumps = 1;
    this.fallFrom = from.y;
    this.landRoll = v > LEAP.rollSpeed;
    this.leaping = true;
    this.rig.anim.stopOverlay(0.05);
    this.rig.anim.setBase('Jump', 1.4, 0.04, true);
    this.ev.jump(false);
    return true;
  }

  private spend(n: number): boolean {
    if (this.god) return true;
    if (this.stamina <= 0) {
      this.ev.exhausted();
      return false;
    }
    this.stamina = Math.max(0, this.stamina - n);
    this.staminaDelay = this.stamina <= 0 ? REGEN.delayEmpty : REGEN.delay;
    if (this.stamina <= 0) this.exhausted = true;
    return true;
  }

  private startJump(dir: THREE.Vector3, mag: number, double: boolean): void {
    this.airborne = true;
    this.vy = double ? JUMP.v2 : JUMP.v0;
    this.coyote = 0;
    if (double) this.airJumps++;
    if (mag > 0.001) this.moveDir.copy(dir);
    this.yawTarget = Math.atan2(this.moveDir.x, this.moveDir.z);
    this.attackT = -1;
    this.blocking = false;
    this.cancelBow();
    this.rig.anim.stopOverlay(0.05);
    // Jump clip: crouch → push off → tuck; held at the tuck while airborne.
    this.rig.anim.setBase('Jump', 1.4, 0.04, true);
    this.ev.jump(double);
  }

  update(dt: number, f: Frame, cam: FollowCamera): void {
    // Inside the truce of the sacred months no one strikes a blow.
    if (this.peaceful && f.attack) {
      f.attack = false;
      this.ev.truce();
    }
    this.invulnT -= dt;
    this.sinceHurt += dt;
    this.flash.update(dt);
    if (this._dead) {
      this.deadTimer -= dt;
      if (this.deadTimer <= 0 && this.deadTimer + dt > 0) this.ev.respawn();
      this.rig.anim.update(dt);
      this.syncRoot();
      return;
    }
    if (this.sinceHurt > 5 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + 2 * dt);

    // Camera-relative input → world direction. W = screen up.
    const dir = new THREE.Vector3().addScaledVector(cam.right, f.moveX).addScaledVector(cam.forward, f.moveY);
    let mag = Math.min(1, dir.length());
    if (this.talking) mag = 0;
    if (mag > 0.001) dir.normalize();

    if (this.horse) {
      if (this.hasBow) this.updateBow(dt, f, false);
      else this.updateAttack(dt, f);
      const h = this.horse;
      if (f.jump && h.jump()) this.ev.horseJump(h.winged);
      h.drive(dt, dir.x, dir.z, mag, f.run);
      h.update(dt);
      this.yaw = this.yawTarget = h.yaw;
      this.rig.anim.setBase('Ride', THREE.MathUtils.clamp(h.speed / CLIP_SPEED.horseGallop, 0.3, 1.3), 0.15);
      this.animSpeed = h.speed;
      this.regen(dt, false);
      this.rig.anim.update(dt);
      this.poseBow(dt);
      this.syncRoot();
      return;
    }

    // Buffered inputs (a short window so presses just before a recovery ends still count).
    this.attackQueued = Math.max(0, this.attackQueued - dt);
    this.rollQueued = Math.max(0, this.rollQueued - dt);
    this.jumpQueued = Math.max(0, this.jumpQueued - dt);
    if (f.attack && !this.talking) this.attackQueued = 0.35;
    if (f.dodge && !this.talking) this.rollQueued = 0.3;
    if (f.jump && !this.talking) this.jumpQueued = 0.15;
    this.coyote = Math.max(0, this.coyote - dt);

    let sprinting = false;
    let step = { x: 0, z: 0 };
    const feet = this.mover.feet;

    if (this.airborne) {
      // Variable height: holding jump floats the rise, releasing cuts it.
      const g = this.vy > 0 ? (f.jumpHeld ? JUMP.gHeld : JUMP.gRise) : JUMP.gFall;
      this.vy = Math.max(-JUMP.maxFall, this.vy - g * dt);
      if (this.jumpQueued > 0 && this.coyote > 0 && this.airJumps === 0 && this.vy <= 0) {
        // Coyote time: just walked off a ledge, still allowed a full jump.
        this.jumpQueued = 0;
        this.startJump(dir, mag, false);
      } else if (this.jumpQueued > 0 && this.progress.doubleJump && this.airJumps < 1 && this.spend(this.inCombat ? COST.jump : 0)) {
        this.jumpQueued = 0;
        this.startJump(dir, mag, true);
      }
      // Air control: steer toward the input, keep momentum.
      if (mag > 0.001) {
        this.moveDir.lerp(dir, 1 - Math.exp(-dt * 6)).normalize();
        this.yawTarget = Math.atan2(this.moveDir.x, this.moveDir.z);
        this.speed = Math.max(this.speed, mag * WALK_SPEED * 1.4);
      } else if (!this.leaping) {
        this.speed = Math.max(0, this.speed - JUMP.air * dt);
      }
      if (this.hasBow) this.updateBow(dt, f, false);
      else this.updateAttack(dt, f);
      // Hold the tuck pose until we come down.
      const a = this.rig.anim;
      if (a.base === 'Jump' && a.baseTime() > 0.27) a.setBase('Jump', 0, 0);
      const prevY = feet.y;
      const y = prevY + this.vy * dt;
      step = this.mover.move(this.moveDir.x * this.speed * dt, this.moveDir.z * this.speed * dt, y);
      // Floor under the new position, judged from the height we came from so a
      // fast fall can't tunnel through a box top.
      const floor = this.physics.support(feet.x, feet.z, prevY + 0.05);
      if (this.vy <= 0 && feet.y <= floor + 0.02) {
        const fall = this.fallFrom - floor;
        this.airborne = false;
        this.vy = 0;
        this.airJumps = 0;
        this.mover.move(0, 0, floor);
        this.landT = 0.12;
        // Play out the landing crouch, then locomotion takes over.
        this.rig.anim.setBase('Jump', 1.8, 0.04);
        this.ev.land(fall);
        this.leaping = false;
        if (this.landRoll) {
          // Off a galloping horse: tumble forward with the momentum.
          this.landRoll = false;
          this.landT = 0;
          this.rollT = 0;
          this.rollDir.copy(this.moveDir);
          this.rig.anim.setBase('Roll', 1, 0.05, true);
          this.ev.roll();
        }
      }
      if (this.vy > 0) this.fallFrom = Math.max(this.fallFrom, feet.y);
    } else if (this.staggerT > 0) {
      this.staggerT -= dt;
      if (this.downT > 0) {
        const before = this.downT;
        this.downT -= dt;
        if (before > KNOCKDOWN.getUp && this.downT <= KNOCKDOWN.getUp) {
          this.rig.anim.setBase('GetUp', 1.35, 0.05, true);
          this.ev.getUp();
        }
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
      const u = this.rollT / ROLL.duration;
      const v = (ROLL.distance / ROLL.duration) * (u < 0.7 ? 1.25 : Math.max(0, 1.25 * (1 - (u - 0.7) / 0.3)));
      const r = this.mover.move(this.rollDir.x * v * dt, this.rollDir.z * v * dt);
      step = r;
      if (r.falling) this.beginFall();
      if (this.rollT >= ROLL.duration) {
        this.rollT = -1;
        this.rig.anim.setBase(mag > 0.01 ? 'Walk' : 'Idle', 1, 0.12);
      }
    } else {
      const cur = this.swings[this.attackIdx];
      const canRoll = this.attackT < 0 || this.attackT >= cur.hit + 0.12;
      const canJump = this.attackT < 0 && this.healT < 0;
      if (this.jumpQueued > 0 && canJump && this.spend(this.inCombat ? COST.jump : 0)) {
        this.jumpQueued = 0;
        this.fallFrom = feet.y;
        this.startJump(dir, mag, false);
      } else if (this.rollQueued > 0 && canRoll && this.healT < 0 && this.spend(COST.roll)) {
        this.rollQueued = 0;
        this.attackT = -1;
        this.attackQueued = 0;
        this.blocking = false;
        this.rollT = 0;
        this.cancelBow();
        this.rollDir.copy(mag > 0.01 ? dir : this.moveDir);
        this.moveDir.copy(this.rollDir);
        this.yaw = this.yawTarget = Math.atan2(this.rollDir.x, this.rollDir.z);
        this.rig.anim.stopOverlay(0.05);
        this.rig.anim.setBase('Roll', 1, 0.05, true);
        this.ev.roll();
      } else {
        if (this.rollQueued > 0 && canRoll) this.rollQueued = 0;
        // Healing draught.
        if (f.heal && this.healT < 0 && this.attackT < 0 && this.progress.data.flasks <= 0) this.ev.noFlask();
        if (f.heal && this.healT < 0 && this.attackT < 0 && this.progress.data.flasks > 0) {
          this.healT = 0;
          this.healed = false;
          this.blocking = false;
          this.rig.anim.playOverlay('Talk', { fade: 0.1 });
        }
        if (this.healT >= 0) {
          this.healT += dt;
          if (!this.healed && this.healT >= HEAL.at) {
            this.healed = true;
            this.progress.data.flasks--;
            this.progress.save();
            this.hp = Math.min(this.maxHp, this.hp + this.maxHp * HEAL.fraction);
            this.ev.heal();
          }
          if (this.healT >= HEAL.duration) {
            this.healT = -1;
            this.rig.anim.stopOverlay(0.15);
          }
        }
        // Shield: hold to block (not while swinging or drinking).
        const wantBlock = f.block && !this.hasBow && this.progress.shield && this.attackT < 0 && this.healT < 0 && this.stamina > 0;
        if (wantBlock !== this.blocking) {
          this.blocking = wantBlock;
          if (wantBlock) {
            this.rig.anim.playOverlay('Block', { loop: true, fade: 0.08 });
            this.ev.shieldUp();
          }
          else this.rig.anim.stopOverlay(0.12);
        }
        if (this.hasBow) this.updateBow(dt, f, this.healT >= 0);
        else if (this.healT < 0) this.updateAttack(dt, f);
        const a = this.swings[this.attackIdx];
        const committed = !this.hasBow && this.attackT >= 0 && this.attackT < a.hit + 0.1;
        if (committed) {
          const lunge = this.attackT > a.hit - 0.18 && this.attackT < a.hit ? 3.2 : 0.4;
          this.speed = 0;
          const r = this.mover.move(this.moveDir.x * lunge * dt, this.moveDir.z * lunge * dt);
          step = r;
          if (r.falling) this.beginFall();
        } else {
          if (this.exhausted && this.stamina > 25) this.exhausted = false;
          const canSprint = !this.exhausted && (this.stamina > 0 || !this.inCombat);
          const aiming = this.aiming;
          sprinting = f.run && mag > 0.5 && canSprint && this.attackT < 0 && !this.blocking && this.healT < 0 && !aiming;
          const slow = this.attackT >= 0 ? 0.35 : this.blocking ? 0.5 : this.healT >= 0 ? 0.4 : aiming ? BOW.moveK : 1;
          // Stick: a light push is a slow walk, a full push the normal pace (keys always push fully).
          const pace = sprinting
            ? RUN_SPEED * mag
            : mag < SLOW_WALK.below
              ? SLOW_WALK.min + (SLOW_WALK.max - SLOW_WALK.min) * (mag / SLOW_WALK.below)
              : WALK_SPEED;
          const target = (aiming && this.aimLocksMove ? 0 : mag > 0.001 ? pace : 0) * slow;
          if (aiming && this.aim) {
            // Drawn: strafe while facing the shot.
            if (mag > 0.001 && !this.aimLocksMove) this.moveDir.copy(dir);
            this.yawTarget = this.aim.yaw;
          } else if (mag > 0.001) {
            // Movement and facing share one direction: the input vector itself.
            this.moveDir.copy(dir);
            this.yawTarget = Math.atan2(dir.x, dir.z);
          }
          const accel = target > this.speed ? 28 : 22;
          this.speed = target > this.speed ? Math.min(target, this.speed + accel * dt) : Math.max(target, this.speed - accel * dt);
          const r = this.mover.move(this.moveDir.x * this.speed * dt, this.moveDir.z * this.speed * dt);
          step = r;
          if (r.falling) this.beginFall();
        }
      }
    }
    this.yaw = dampAngle(this.yaw, this.yawTarget, 22, dt);

    // Sprinting only costs stamina when fighting is near.
    if (sprinting && this.inCombat && !this.god) {
      this.stamina = Math.max(0, this.stamina - COST.sprintPerSec * dt);
      this.staminaDelay = Math.max(this.staminaDelay, 0.3);
      if (this.stamina <= 0) {
        this.exhausted = true;
        this.staminaDelay = REGEN.delayEmpty;
      }
    }
    this.regen(dt, sprinting && this.inCombat);

    // Foot speed follows the speed actually achieved (walls slow it down).
    const actual = dt > 0 ? Math.hypot(step.x, step.z) / dt : 0;
    this.animSpeed += (Math.min(actual, this.speed + 0.01) - this.animSpeed) * (1 - Math.exp(-dt * 15));
    this.landT -= dt;
    if (this.rollT < 0 && !this.airborne && this.downT <= 0 && this.landT <= 0) {
      const a = this.rig.anim;
      const s = this.animSpeed;
      if (s < 0.15) a.setBase('Idle', 1, 0.2);
      // Walk up to a brisk pace; the normal 3 m/s pace is a jog on the Run clip.
      else if (s < 2.4) a.setBase('Walk', Math.max(0.35, s / CLIP_SPEED.personWalk), 0.18);
      else a.setBase('Run', s / CLIP_SPEED.personRun, 0.15);
    }
    this.rig.anim.update(dt);
    this.poseBow(dt);
    this.syncRoot();
  }

  /** BowDraw spans the weapon's draw time. */
  private playDrawClip(): void {
    if (!this.bowClips) return;
    const dur = this.clips.BowDraw?.duration ?? 0.542;
    // Freeze on the full-draw frame; BowAim takes over from the same pose.
    this.rig.anim.playOverlay('BowDraw', { fade: 0.06, timeScale: dur / (this.wpn.draw ?? 0.6), hold: true });
  }

  /** The model has the authored archer clips (else a procedural pose is used). */
  private get bowClips(): boolean {
    return this.rig.anim.hasOverlay('BowDraw') && this.rig.anim.hasOverlay('BowAim');
  }

  private cancelBow(): void {
    if (this.drawT >= 0) this.ev.bowRelax();
    if (this.drawT >= 0 && this.bowClips) this.rig.anim.stopOverlay(0.1);
    this.drawT = -1;
    this.quickShot = false;
    this.shotQueued = false;
    this.aimHeld = false;
  }

  /**
   * Bow: hold block to draw and aim, attack to loose once fully drawn. Attack
   * without aiming draws and looses on its own (a quick shot with aim assist).
   * Each arrow needs its own nock-and-draw time.
   */
  private updateBow(dt: number, f: Frame, busy: boolean): void {
    if (this.releaseT > 0) this.releaseT -= dt;
    const arrows = this.progress.data.arrows;
    const held = f.block && !busy && !this.talking;
    if (f.attack && !this.talking && !busy) {
      if (arrows <= 0) this.ev.noArrows();
      else if (this.drawn && (this.aimHeld || this.quickShot)) this.loose();
      else if (!held) this.quickShot = true;
      // Pressed mid-draw: loose the moment the draw is full.
      else this.shotQueued = true;
    }
    if (held !== this.aimHeld) {
      this.aimHeld = held;
      if (!held && !this.quickShot && this.drawT >= 0) {
        this.drawT = -1;
        this.ev.bowRelax();
        if (this.bowClips) this.rig.anim.stopOverlay(0.15);
      }
    }
    const want = (this.aimHeld || this.quickShot) && this.progress.data.arrows > 0;
    if (want) {
      // The next nock waits for the release follow-through to finish.
      if (this.releaseT > 0) {
        // (still aiming: keep facing the shot)
      } else if (this.drawT < 0) {
        this.drawT = 0;
        this.ev.bowDraw();
        this.playDrawClip();
      } else this.drawT += dt;
      // Authored clips: once drawn, hold the aim loop.
      const anim = this.rig.anim;
      if (this.bowClips && this.drawn && anim.overlay !== 'BowAim' && anim.overlay !== 'BowRelease') anim.playOverlay('BowAim', { loop: true, fade: 0.06 });
      this.aim = this.ev.bowAim(this.quickShot && !this.aimHeld);
      if (this.drawn && ((this.quickShot && !this.aimHeld) || this.shotQueued)) this.loose();
    } else {
      this.quickShot = false;
      this.shotQueued = false;
      this.aim = null;
    }
  }

  private loose(): void {
    if (!this.spend(this.inCombat ? this.wpn.stamina : 0)) return;
    const aim = this.ev.bowAim(this.quickShot && !this.aimHeld);
    this.progress.data.arrows = Math.max(0, this.progress.data.arrows - 1);
    this.progress.save();
    this.ev.shoot(aim);
    this.yaw = this.yawTarget = aim.yaw;
    // Next arrow: nocked and drawn again once the release has played out.
    this.drawT = -1;
    if (this.bowClips) this.rig.anim.playOverlay('BowRelease', { fade: 0.03 });
    this.releaseT = this.bowClips ? (this.clips.BowRelease?.duration ?? 0.25) : 0.12;
    this.quickShot = false;
    this.shotQueued = false;
  }

  /**
   * Procedural archer pose layered on the animation (until BowDraw/BowAim clips
   * exist): bow arm straight at the target, string hand drawn to the chest.
   */
  private poseBow(dt: number): void {
    if (!this.hasBow) return;
    const target = this.aiming ? 1 : 0;
    this.aimW += (target - this.aimW) * (1 - Math.exp(-dt * (target ? 14 : 1 / BOW.relaxFade)));
    const w = this.aimW;
    const bones = this.rig.bones;
    const pitch = this.aim?.pitch ?? 0;
    const k = this.drawK;
    if (this.bowMesh) {
      // Limbs vertical in the hand at rest; along the raised arm's local Z when aiming.
      this.bowMesh.position.set(0, -0.12, 0.02);
      this.bowMesh.rotation.set((Math.PI / 2) * w, 0, 0);
      const str = this.bowMesh.userData.string as THREE.Object3D;
      str.position.z = -0.1 - 0.32 * k * w;
    }
    if (w < 0.01) return;
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    if (this.bowClips) {
      // Authored clips aim level; lean the upper body into the shot's elevation.
      const sp = bones.get('spine');
      if (sp) sp.quaternion.premultiply(q.setFromEuler(e.set(-pitch * 0.85 * w, 0, 0)));
      return;
    }
    const blend = (name: string, x: number, y: number, z: number) => {
      const b = bones.get(name);
      if (!b) return;
      q.setFromEuler(e.set(x, y, z));
      b.quaternion.slerp(q, w);
    };
    // Bones: hanging limbs point down local -Y; X = -90° levels them forward,
    // +Z swings toward +X (arm_L sits at -X, arm_R at +X).
    blend('arm_L', -(Math.PI / 2 + pitch), 0, 0.1);
    // String arm: forward and across the chest, drawn further across as it fills.
    blend('arm_R', -(Math.PI / 2 + pitch) + 0.25 * k, 0, -(0.5 + 0.45 * k));
    blend('hand_R', -0.6 * k, 0, 0);
    blend('spine', 0, 0.12, 0);
    blend('head', -pitch * 0.5, 0, 0);
  }

  /** Walked or rolled off a ledge: fall, with a moment of coyote time to still jump. */
  private beginFall(): void {
    this.airborne = true;
    this.vy = 0;
    this.coyote = JUMP.coyote;
    this.fallFrom = this.mover.feet.y;
    this.rollT = -1;
    this.attackT = -1;
    if (this.rig.anim.base !== 'Jump') this.rig.anim.setBase('Jump', 0, 0.12, true);
  }

  /** Coyote jump: pressed just after leaving a ledge. */
  get canCoyoteJump(): boolean {
    return this.airborne && this.coyote > 0 && this.airJumps === 0;
  }

  private regen(dt: number, draining: boolean): void {
    if (this.staminaDelay > 0) this.staminaDelay -= dt;
    else if (!draining && this.attackT < 0 && this.rollT < 0) {
      const rate = this.blocking ? REGEN.rate * 0.35 : REGEN.rate;
      this.stamina = Math.min(this.maxStamina, this.stamina + rate * dt);
    }
  }

  private updateAttack(dt: number, f: Frame): void {
    // A weapon without swings (the bow) has nothing to do here.
    if (!this.swings.length) return;
    if (this.attackT >= 0) this.attackT += dt;
    if (this.horse && f.attack && !this.talking) this.attackQueued = 0.35;
    const cur = this.swings[this.attackIdx];
    const canStart = this.attackT < 0 || this.attackT >= cur.chain;
    if (this.attackQueued > 0 && canStart && !this.talking && !this.blocking) {
      this.attackQueued = 0;
      if (this.spend(this.wpn.stamina)) {
        this.attackIdx = (this.attackIdx + 1) % this.swings.length;
        this.attackT = 0;
        this.hitDone = false;
        if (!this.horse && !this.airborne) {
          // Aim assist: snap toward an enemy in front so the lunge connects.
          const target = this.ev.aim(this.pos, this.yaw);
          if (target) {
            const a = Math.atan2(target.x - this.pos.x, target.z - this.pos.z);
            this.yaw = this.yawTarget = a;
            this.moveDir.set(Math.sin(a), 0, Math.cos(a));
          }
        }
        this.rig.anim.playOverlay(this.swings[this.attackIdx].clip, { fade: 0.06, timeScale: this.wpn.speed });
        this.ev.swing();
      }
    }
    const a = this.swings[this.attackIdx];
    if (this.attackT >= 0 && !this.hitDone && this.attackT >= a.hit) {
      this.hitDone = true;
      const w = this.wpn;
      const range = this.horse ? Math.max(2.7, w.range) : w.range;
      const arc = this.horse ? Math.max(80, w.arc) : w.arc;
      const hits = this.ev.strike(this.pos, this.yaw, range, THREE.MathUtils.degToRad(arc), w.dmg);
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
    this.updateNock();
  }

  /**
   * The nocked arrow while the authored draw is mostly done: it lies from the
   * string hand to the bow hand (the arms are single bones, so the hands mark
   * the string and the grip).
   */
  private updateNock(): void {
    const show = this.hasBow && this.aiming && this.drawK > 0.6 && this.releaseT <= 0 && !!this.nockModel && this.bowClips;
    if (!show) {
      if (this.nock) this.nock.visible = false;
      return;
    }
    const r = this.rig.root;
    if (!this.nock || this.nock.parent !== r) {
      this.nock?.removeFromParent();
      this.nock = this.nockModel!.clone();
      r.add(this.nock);
    }
    const hr = this.rig.bones.get('hand_R');
    const hl = this.rig.bones.get('hand_L');
    if (!hr || !hl) return;
    r.updateMatrixWorld(true);
    const a = r.worldToLocal(hr.getWorldPosition(new THREE.Vector3()));
    const b = r.worldToLocal(hl.getWorldPosition(new THREE.Vector3()));
    const dir = b.clone().sub(a);
    if (dir.lengthSq() < 1e-4) return;
    dir.normalize();
    // Nock at the string hand; the 0.83 m shaft reaches past the grip.
    this.nock.position.copy(a).addScaledVector(dir, 0.38);
    this.nock.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    this.nock.visible = true;
  }
}

