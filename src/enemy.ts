import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { CharacterFactory, CLIP_SPEED, type Accessory, type Rig } from './characters';
import type { HitResult, PlayerView } from './combat';
import { Flash, type Sfx } from './fx';
import type { Spawn } from './level';
import { PathFollower } from './nav';
import { angleTo, dampAngle, mulberry32, turnToward, wrapAngle } from './util';
import type { World } from './world';

/**
 * Hostile raiders, Dark Souls style: they telegraph every swing with a slow
 * windup and a red flash + glint, commit to the strike, then recover — the
 * recovery is the opening. Poise decides whether a hit makes them flinch.
 */

export type EnemyKind = 'raider' | 'skirmisher' | 'brute' | 'chief';

interface KindDef {
  title: string;
  hp: number;
  /** Hits needed (within 2.5 s) to break poise. */
  poise: number;
  walk: number;
  run: number;
  scale: number;
  dmg: number;
  knock: number;
  range: number;
  /** Windup hold before the swing (s), first attack of a chain. */
  windup: number;
  /** Windup for follow-up attacks in a combo. */
  comboWindup: number;
  strikeSpeed: number;
  recover: number;
  maxCombo: number;
  comboChance: number;
  sight: number;
  turn: number;
  lunge: number;
  acc: Accessory[];
  colours: Record<string, number>;
  /** Which swings (indices into SWINGS) this kind uses; the first is its opener. */
  swings: number[];
  /** Chance to raise a shield when the player starts a swing nearby. */
  block: number;
  /** Skirmish-style: hop back out of reach after a combo. */
  backstep: number;
}

const KINDS: Record<EnemyKind, KindDef> = {
  raider: {
    title: 'Raider',
    hp: 100,
    poise: 1,
    walk: 1.6,
    run: 4.0,
    scale: 1,
    dmg: 18,
    knock: 1.6,
    range: 1.9,
    windup: 0.55,
    comboWindup: 0.3,
    strikeSpeed: 1.6,
    recover: 0.85,
    maxCombo: 2,
    comboChance: 0.45,
    sight: 15,
    turn: 3.2,
    lunge: 2.2,
    acc: ['Keffiyeh', 'FaceWrap', 'Vest', 'Sword', 'Shield'],
    colours: { P_Robe: 0x2b2622, P_Sash: 0x7b2a24, P_Wrap: 0x3b3530, P_Pants: 0x2f2a26, P_Skin: 0x9a6440 },
    swings: [0, 1],
    block: 0.45,
    backstep: 0.2,
  },
  skirmisher: {
    title: 'Skirmisher',
    hp: 65,
    poise: 1,
    walk: 1.8,
    run: 5.0,
    scale: 0.94,
    dmg: 10,
    knock: 1,
    range: 1.7,
    windup: 0.32,
    comboWindup: 0.16,
    strikeSpeed: 1.9,
    recover: 0.55,
    maxCombo: 3,
    comboChance: 0.7,
    sight: 16,
    turn: 4.5,
    lunge: 2.6,
    acc: ['Headband', 'FaceWrap', 'Hair', 'Sword'],
    colours: { P_Robe: 0x6b4a32, P_Sash: 0x2b2622, P_Hair: 0x1d1612, P_Pants: 0x3d3128, P_Skin: 0x7d4f31 },
    swings: [3, 1, 3],
    block: 0,
    backstep: 0.65,
  },
  brute: {
    title: 'Raider Brute',
    hp: 240,
    poise: 3,
    walk: 1.3,
    run: 3.1,
    scale: 1.32,
    dmg: 34,
    knock: 3.5,
    range: 2.6,
    windup: 1.0,
    comboWindup: 0.6,
    strikeSpeed: 1.3,
    recover: 1.4,
    maxCombo: 2,
    comboChance: 0.25,
    sight: 12,
    turn: 1.8,
    lunge: 2.8,
    acc: ['Helmet', 'BeardLong', 'Lamellar', 'Belly', 'Sword', 'Shield'],
    colours: { P_Robe: 0x4a1a14, P_Sash: 0x2b2622, P_Wrap: 0x2b2622, P_Pants: 0x2a1d17, P_Skin: 0x7d4f31 },
    swings: [2, 0],
    block: 0,
    backstep: 0,
  },
  chief: {
    title: 'Raider Chief',
    hp: 420,
    poise: 4,
    walk: 1.4,
    run: 3.4,
    scale: 1.38,
    dmg: 38,
    knock: 4,
    range: 2.7,
    windup: 0.9,
    comboWindup: 0.45,
    strikeSpeed: 1.4,
    recover: 1.1,
    maxCombo: 3,
    comboChance: 0.5,
    sight: 16,
    turn: 2.2,
    lunge: 3,
    acc: ['Helmet', 'BeardLong', 'Lamellar', 'Cloak', 'Belly', 'Sword', 'Shield'],
    colours: { P_Robe: 0x2a1d17, P_Sash: 0xd6a531, P_Wrap: 0x2b2622, P_Pants: 0x2a1d17, P_Skin: 0x7d4f31, P_Cloak: 0x6d1a14 },
    swings: [2, 0, 1],
    block: 0.25,
    backstep: 0.15,
  },
};

// Clip timing (seconds of clip time, from the manifest): arm raised / blade lands.
// `raiseSpeed` plays the raise slowly as a telegraph; HeavyAttack has its own
// authored raise-and-hold, so it plays at full speed. `strike` overrides the
// kind's strike speed (null = use the kind's).
interface Swing {
  clip: string;
  raise: number;
  hit: number;
  raiseSpeed: number;
  strike: number | null;
  heavy: boolean;
}
const SWINGS: Swing[] = [
  { clip: 'Attack', raise: 0.21, hit: 0.375, raiseSpeed: 0.55, strike: null, heavy: false },
  { clip: 'Attack2', raise: 0.17, hit: 0.333, raiseSpeed: 0.55, strike: null, heavy: false },
  { clip: 'HeavyAttack', raise: 0.75, hit: 1.042, raiseSpeed: 1, strike: 1.15, heavy: true },
  { clip: 'Thrust', raise: 0.18, hit: 0.333, raiseSpeed: 0.6, strike: null, heavy: false },
];
const BACKSTEP = { duration: 0.5, distance: 1.6 };

type EState = 'idle' | 'alert' | 'approach' | 'reposition' | 'windup' | 'strike' | 'recover' | 'stagger' | 'block' | 'backstep' | 'return' | 'dead';

const RADIUS = 0.32;
/** Body half-width for spacing (shoulders + arms), larger than the collision capsule. */
const BODY = 0.42;
const LEASH = 38;
/** At most this many raiders press the attack at once; the rest wait on an outer ring. */
const MAX_ATTACKERS = 2;
const WAIT_RING = 3.6;
const ATTACKING: ReadonlySet<string> = new Set(['windup', 'strike', 'recover']);
const ENGAGED: ReadonlySet<string> = new Set(['alert', 'approach', 'reposition', 'windup', 'strike', 'recover', 'stagger', 'block', 'backstep']);
const TAU = Math.PI * 2;

export class Enemy {
  readonly pos = new THREE.Vector3();
  readonly def: KindDef;
  yaw: number;
  hp: number;
  state: EState = 'idle';
  /** Seconds since the player last hurt this enemy (drives the HUD bar). */
  sinceHurt = 99;
  lastDamage = 0;
  readonly flash = new Flash();
  /** Holds one of the limited attack slots (set by EnemySystem each frame). */
  hasToken = false;
  /** Assigned angle around the player (atan2(dx, dz) from the player), NaN = none. */
  slotAngle = NaN;
  /** Called once when this enemy dies (gold, quests). */
  onKilled: (e: Enemy) => void = () => {};
  /** Called at the telegraph moment of a windup (glint VFX). */
  onTell: (e: Enemy) => void = () => {};
  private home: THREE.Vector3;
  private homeYaw: number;
  private timer = 0;
  private swing = 0;
  private combo = 0;
  private struck = false;
  private told = false;
  private poiseHits = 0;
  private poiseTimer = 0;
  private cooldown = 0;
  private knock = new THREE.Vector3();
  private follow: PathFollower;
  private reTarget = new THREE.Vector3();
  private rnd: () => number;
  private idleTimer = 0;
  private wanderTarget: THREE.Vector3 | null = null;
  private animAcc = 0;
  private frame = 0;
  private guardHits = 0;
  private sawPlayerAttack = false;

  constructor(
    readonly kind: EnemyKind,
    readonly rig: Rig,
    spawn: Spawn,
    readonly camp: string,
    private collider: RAPIER.Collider,
    private world: World,
    private sfx: Sfx,
    seed: number,
  ) {
    this.def = KINDS[kind] ?? KINDS.raider;
    this.hp = this.def.hp;
    this.pos.set(...spawn.pos);
    this.pos.y = world.ground(this.pos.x, this.pos.z);
    this.yaw = spawn.yaw;
    this.home = this.pos.clone();
    this.homeYaw = spawn.yaw;
    this.follow = new PathFollower(world.nav);
    this.rnd = mulberry32(seed);
    this.idleTimer = 1 + this.rnd() * 4;
    this.flash.attach(rig.root);
    this.rig.anim.setBase('Idle', 0.9 + this.rnd() * 0.2, 0);
    this.sync();
  }

  get dead(): boolean {
    return this.state === 'dead';
  }
  get title(): string {
    return this.def.title;
  }
  get homePos(): THREE.Vector3 {
    return this.home;
  }
  get bodyRadius(): number {
    return BODY * this.def.scale;
  }
  get combatant(): boolean {
    return ENGAGED.has(this.state);
  }
  get midAttack(): boolean {
    return ATTACKING.has(this.state);
  }
  get readyToAttack(): boolean {
    return this.cooldown <= 0;
  }

  get engaged(): boolean {
    return !this.dead && this.state !== 'idle' && this.state !== 'return';
  }
  /** Height of the head (for the HUD bar). */
  get headY(): number {
    return this.pos.y + 2.25 * this.def.scale;
  }
  /** True while the swing is telegraphed (HUD/indicator use). */
  get telegraphing(): boolean {
    return this.state === 'windup';
  }

  reset(): void {
    this.hp = this.def.hp;
    this.pos.copy(this.home);
    this.yaw = this.homeYaw;
    this.state = 'idle';
    this.sinceHurt = 99;
    this.knock.set(0, 0, 0);
    this.collider.setEnabled(true);
    this.rig.anim.stopOverlay(0);
    this.rig.anim.setBase('Idle', 1, 0);
    this.follow.clear();
    this.sync();
  }

  private enter(s: EState): void {
    this.state = s;
    const a = this.rig.anim;
    const d = this.def;
    switch (s) {
      case 'idle':
      case 'alert':
      case 'windup':
      case 'strike':
      case 'recover':
      case 'block':
        a.setBase('Idle', 1, 0.15);
        break;
      case 'stagger':
        a.stopOverlay(0.05);
        a.setBase('Stagger', 1, 0.06, true);
        break;
      case 'backstep':
        a.stopOverlay(0.05);
        a.setBase('Backstep', 1, 0.06, true);
        break;
      case 'approach':
        a.setBase('Run', d.run / CLIP_SPEED.personRun, 0.15);
        break;
      case 'reposition':
      case 'return':
        a.setBase('Walk', (s === 'return' ? d.walk * 1.4 : d.walk) / CLIP_SPEED.personWalk, 0.2);
        break;
      case 'dead':
        a.stopOverlay(0.05);
        a.setBase('Death', 1, 0.1);
        break;
    }
  }

  /** A sword blow from the player. */
  damage(dmg: number, from: THREE.Vector3): HitResult {
    const res: HitResult = { pos: this.pos.clone().setY(this.pos.y + 1.2 * this.def.scale), killed: false, staggered: false };
    if (this.dead) return res;
    const away = this.pos.clone().sub(from).setY(0).normalize();
    // Shield up and facing the blow: no damage, but the guard wears down.
    if (this.state === 'block' && Math.cos(wrapAngle(Math.atan2(-away.x, -away.z) - this.yaw)) > 0.3) {
      res.blocked = true;
      this.guardHits++;
      this.knock.copy(away).multiplyScalar(1.2);
      this.sfx.clang();
      if (this.guardHits >= 2) {
        // Guard break: wide open.
        this.guardHits = 0;
        this.timer = 1.1;
        this.enter('stagger');
        res.staggered = true;
      } else {
        this.rig.anim.playOverlay('BlockHit', { fade: 0.03 });
        this.timer = Math.max(this.timer, 0.5);
      }
      return res;
    }
    this.hp -= dmg;
    this.lastDamage = this.sinceHurt < 1.5 ? this.lastDamage + dmg : dmg;
    this.sinceHurt = 0;
    this.flash.hit();
    if (this.hp <= 0) {
      this.hp = 0;
      this.knock.copy(away).multiplyScalar(3);
      this.enter('dead');
      this.collider.setEnabled(false);
      this.sfx.death();
      res.killed = true;
      this.onKilled(this);
      return res;
    }
    // Poise: brutes shrug off single blows, especially mid-swing (hyper armour).
    this.poiseHits++;
    this.poiseTimer = 2.5;
    const armoured = this.def.poise > 1 && (this.state === 'windup' || this.state === 'strike');
    if (this.poiseHits >= this.def.poise && !armoured) {
      this.poiseHits = 0;
      this.knock.copy(away).multiplyScalar(this.def.poise > 1 ? 2.5 : 3.2);
      this.timer = this.def.poise > 1 ? 1.0 : 0.75;
      this.enter('stagger');
      res.staggered = true;
    } else {
      this.knock.copy(away).multiplyScalar(0.8);
    }
    if (this.state === 'idle' || this.state === 'return') this.alert();
    return res;
  }

  private alert(): void {
    this.timer = 0.35 + this.rnd() * 0.25;
    this.follow.clear();
    this.enter('alert');
  }

  update(dt: number, player: PlayerView, focusDist: number): void {
    this.sinceHurt += dt;
    this.flash.update(dt);
    if (this.poiseTimer > 0 && (this.poiseTimer -= dt) <= 0) this.poiseHits = 0;
    this.cooldown -= dt;
    const d = this.def;
    const dx = player.pos.x - this.pos.x;
    const dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const toPlayer = Math.atan2(dx, dz);
    const fromHome = Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z);
    const playerHere = !player.dead && Math.hypot(player.pos.x - this.home.x, player.pos.z - this.home.z) < LEASH + 6;

    // Shield reaction: when the player starts a swing in reach, maybe raise the guard.
    if (player.attacking && !this.sawPlayerAttack) {
      this.sawPlayerAttack = true;
      const canBlock = this.state === 'approach' || this.state === 'reposition' || this.state === 'recover';
      if (canBlock && d.block > 0 && dist < d.range + 1.6 && this.rnd() < d.block) {
        this.rig.anim.playOverlay('Block', { loop: true, fade: 0.06 });
        this.timer = 0.8 + this.rnd() * 0.5;
        this.enter('block');
      }
    } else if (!player.attacking) {
      this.sawPlayerAttack = false;
    }

    switch (this.state) {
      case 'block': {
        this.timer -= dt;
        this.yaw = turnToward(this.yaw, toPlayer, d.turn * 1.5, dt);
        // BlockHit is one-shot; fall back to the held guard.
        if (this.rig.anim.overlay === '') this.rig.anim.playOverlay('Block', { loop: true, fade: 0.05 });
        if (this.timer <= 0) {
          this.rig.anim.stopOverlay(0.15);
          this.enter('approach');
        }
        break;
      }
      case 'backstep': {
        this.timer -= dt;
        const v = BACKSTEP.distance / BACKSTEP.duration;
        this.stepDir(-Math.sin(this.yaw), -Math.cos(this.yaw), v * dt, dt, false);
        if (this.timer <= 0) {
          this.cooldown = Math.max(this.cooldown, 0.8);
          this.enter('approach');
        }
        break;
      }
      case 'idle': {
        // Loiter around the camp.
        this.idleTimer -= dt;
        if (this.wanderTarget) {
          if (this.moveToward(this.wanderTarget.x, this.wanderTarget.z, d.walk, dt) < 0.4) {
            this.wanderTarget = null;
            this.rig.anim.setBase('Idle', 1, 0.25);
          }
        } else if (this.idleTimer <= 0) {
          this.idleTimer = 3 + this.rnd() * 6;
          const a = this.rnd() * Math.PI * 2;
          const r = 1 + this.rnd() * 4;
          const tx = this.home.x + Math.sin(a) * r;
          const tz = this.home.z + Math.cos(a) * r;
          if (!this.world.nav.isBlocked(tx, tz)) {
            this.wanderTarget = new THREE.Vector3(tx, 0, tz);
            this.rig.anim.setBase('Walk', d.walk / CLIP_SPEED.personWalk, 0.25);
          }
        }
        if (!player.dead && dist < d.sight && playerHere) {
          this.wanderTarget = null;
          this.alert();
        }
        break;
      }
      case 'alert': {
        this.timer -= dt;
        this.yaw = turnToward(this.yaw, toPlayer, d.turn * 2, dt);
        if (this.timer <= 0) this.enter('approach');
        break;
      }
      case 'approach': {
        if (player.dead || !playerHere || fromHome > LEASH) {
          this.goHome();
          break;
        }
        if (this.hasToken && dist < d.range + 0.3 && this.cooldown <= 0) {
          this.startSwing(true);
          break;
        }
        if (this.hasToken && dist < d.range + 1.4 && this.cooldown > 0) {
          this.pickReposition(player.pos);
          break;
        }
        // Go to the assigned slot: close in when holding an attack token, else wait on the ring.
        const ring = this.hasToken ? d.range * 0.85 : WAIT_RING + (d.scale - 1) * 1.5;
        const a = Number.isNaN(this.slotAngle) ? Math.atan2(this.pos.x - player.pos.x, this.pos.z - player.pos.z) : this.slotAngle;
        const tx = player.pos.x + Math.sin(a) * ring;
        const tz = player.pos.z + Math.cos(a) * ring;
        const left = Math.hypot(tx - this.pos.x, tz - this.pos.z);
        const anim = this.rig.anim;
        if (left < 0.4) {
          // In position: square up to the player and wait for an opening.
          anim.setBase('Idle', 1, 0.2);
          this.yaw = turnToward(this.yaw, toPlayer, d.turn, dt);
        } else {
          const run = left > 2.5;
          if (run) anim.setBase('Run', d.run / CLIP_SPEED.personRun, 0.15);
          else anim.setBase('Walk', d.walk / CLIP_SPEED.personWalk, 0.2);
          this.moveToward(tx, tz, run ? d.run : d.walk, dt);
        }
        break;
      }
      case 'reposition': {
        const left = this.moveToward(this.reTarget.x, this.reTarget.z, d.walk, dt);
        this.timer -= dt;
        if (left < 0.4 || this.timer <= 0) {
          this.enter('approach');
          // Face the player before re-engaging.
          this.yaw = turnToward(this.yaw, toPlayer, d.turn, dt);
        }
        break;
      }
      case 'windup': {
        this.timer -= dt;
        const s = SWINGS[this.swing];
        const a = this.rig.anim;
        // Raise slowly, then hold at the top until the windup expires.
        const t = a.overlayTime();
        if (t >= s.raise) a.setOverlayTimeScale(0);
        else a.setOverlayTimeScale(s.raiseSpeed);
        // Tracks the player while winding up (that's what makes dodging timing matter).
        this.yaw = turnToward(this.yaw, toPlayer, d.turn, dt);
        if (!this.told && this.timer < 0.18) {
          this.told = true;
          this.flash.tell(0.16);
          this.sfx.tell();
          this.onTell(this);
        }
        if (this.timer <= 0 && (t < 0 || t >= s.raise - 0.02)) {
          a.setOverlayTimeScale(s.strike ?? d.strikeSpeed);
          this.struck = false;
          this.timer = 0.6;
          this.enter('strike');
        }
        break;
      }
      case 'strike': {
        const s = SWINGS[this.swing];
        const t = this.rig.anim.overlayTime();
        // Committed: no tracking, a short lunge into the blow.
        if (!this.struck) {
          const step = d.lunge * dt;
          this.stepDir(Math.sin(this.yaw), Math.cos(this.yaw), dist > 0.9 ? step : 0, dt, false);
        }
        if (!this.struck && (t < 0 || t >= s.hit)) {
          this.struck = true;
          this.sfx.swing(this.kind === 'brute');
          const facing = Math.cos(wrapAngle(toPlayer - this.yaw)) > 0.45;
          const reach = d.range + (player.mounted ? 0.6 : 0.25);
          if (facing && dist < reach && !player.dead) player.hurt(s.heavy ? d.dmg * 1.15 : d.dmg, this.pos, s.heavy ? d.knock * 1.3 : d.knock);
          this.rig.anim.setOverlayTimeScale(1);
        }
        this.timer -= dt;
        if (this.struck && this.timer <= 0) {
          this.timer = this.combo > 0 ? 0.25 : d.recover * (0.85 + this.rnd() * 0.3);
          this.enter('recover');
        }
        break;
      }
      case 'recover': {
        this.timer -= dt;
        if (this.timer <= 0) {
          if (this.combo > 0 && dist < d.range + 1.2 && !player.dead) {
            this.combo--;
            this.startSwing(false);
          } else {
            this.cooldown = 0.6 + this.rnd() * 1.2;
            if (d.backstep > 0 && dist < d.range + 0.8 && this.rnd() < d.backstep) {
              this.timer = BACKSTEP.duration;
              this.enter('backstep');
            } else {
              this.enter('approach');
            }
          }
        }
        break;
      }
      case 'stagger': {
        this.timer -= dt;
        if (this.timer <= 0) {
          this.cooldown = 0.2;
          this.enter('approach');
        }
        break;
      }
      case 'return': {
        if (!player.dead && dist < d.sight * 0.7 && playerHere && fromHome < LEASH - 8) {
          this.alert();
          break;
        }
        this.hp = Math.min(d.hp, this.hp + d.hp * 0.25 * dt);
        if (this.moveToward(this.home.x, this.home.z, d.walk * 1.4, dt) < 0.5) {
          this.hp = d.hp;
          this.yaw = this.homeYaw;
          this.enter('idle');
        }
        break;
      }
      case 'dead':
        break;
    }

    // Knockback slide.
    if (this.knock.lengthSq() > 1e-4) {
      const k = this.knock;
      this.stepDir(k.x, k.z, 1, dt, false, k.length() * dt);
      k.multiplyScalar(Math.max(0, 1 - dt * 7));
    }
    this.sync();
    this.animAcc += dt;
    this.frame++;
    const every = focusDist > 70 ? 6 : focusDist > 35 ? 2 : 1;
    if (this.frame % every === 0) {
      this.rig.anim.update(this.animAcc);
      this.animAcc = 0;
    }
  }

  private comboStep = 0;

  private startSwing(first: boolean): void {
    const d = this.def;
    if (first) {
      this.combo = d.maxCombo > 1 && this.rnd() < d.comboChance ? Math.floor(1 + this.rnd() * (d.maxCombo - 1)) : 0;
      // Openers vary a little; the first listed swing is the favourite.
      this.comboStep = this.rnd() < 0.7 ? 0 : Math.floor(this.rnd() * d.swings.length);
    } else {
      this.comboStep = (this.comboStep + 1) % d.swings.length;
    }
    this.swing = d.swings[this.comboStep];
    const s = SWINGS[this.swing];
    // The hold can't be shorter than the time the raise takes to play.
    const minHold = s.raise / s.raiseSpeed + 0.05;
    this.timer = Math.max(minHold, (first ? d.windup : d.comboWindup) * (0.85 + this.rnd() * 0.3));
    this.told = false;
    this.rig.anim.playOverlay(s.clip, { fade: 0.08, timeScale: s.raiseSpeed });
    this.enter('windup');
  }

  private pickReposition(p: THREE.Vector3): void {
    // Step to the side around the player, Souls-style spacing.
    const side = this.rnd() < 0.5 ? -1 : 1;
    const a = Math.atan2(this.pos.x - p.x, this.pos.z - p.z) + side * (0.5 + this.rnd() * 0.5);
    const r = this.def.range + 1.2 + this.rnd();
    const tx = p.x + Math.sin(a) * r;
    const tz = p.z + Math.cos(a) * r;
    if (this.world.nav.isBlocked(tx, tz)) {
      this.cooldown = 0;
      return;
    }
    this.reTarget.set(tx, 0, tz);
    this.timer = 1.4;
    this.enter('reposition');
  }

  private goHome(): void {
    this.follow.clear();
    this.enter('return');
  }

  /** Path toward (x, z) at `speed`; returns the remaining distance. */
  private moveToward(x: number, z: number, speed: number, dt: number, stopAt = 0): number {
    const dx = x - this.pos.x;
    const dz = z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d <= stopAt) return d;
    let dir: [number, number] | null;
    if (this.world.nav.lineClear(this.pos.x, this.pos.z, x, z)) dir = [dx / d, dz / d];
    else dir = this.follow.steer(this.pos.x, this.pos.z, x, z, dt);
    if (!dir) return d;
    this.stepDir(dir[0], dir[1], Math.min(speed * dt, d - stopAt), dt, true);
    return d;
  }

  /** Positional correction from the separation pass; ignored if it would enter a wall. */
  nudge(dx: number, dz: number): void {
    const nx = this.pos.x + dx;
    const nz = this.pos.z + dz;
    if (this.world.nav.isBlocked(nx, nz)) return;
    this.pos.x = nx;
    this.pos.z = nz;
    this.pos.y = this.world.ground(nx, nz);
  }

  private stepDir(dx: number, dz: number, dist: number, dt: number, face: boolean, override?: number): void {
    const len = override ?? dist;
    if (len <= 0) return;
    const nx = this.pos.x + dx * len;
    const nz = this.pos.z + dz * len;
    if (this.world.nav.isBlocked(nx, nz)) return;
    const b = this.world.physics.bounds;
    if (nx < b.x[0] || nx > b.x[1] || nz < b.z[0] || nz > b.z[1]) return;
    this.pos.x = nx;
    this.pos.z = nz;
    this.pos.y = this.world.ground(nx, nz);
    if (face) this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 12, dt);
  }

  sync(): void {
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.yaw;
    if (!this.dead) this.collider.setTranslation({ x: this.pos.x, y: this.pos.y + 0.9 * this.def.scale, z: this.pos.z });
  }
}

export class EnemySystem {
  readonly list: Enemy[] = [];
  private hand = new THREE.Vector3();

  constructor(world: World, factory: CharacterFactory, scene: THREE.Scene, sfx: Sfx) {
    let seed = 100;
    for (const s of world.level.spawns) {
      if (s.role !== 'enemy') continue;
      const kind = (s.title === 'chief' ? 'chief' : (s.kind ?? 'raider')) as EnemyKind;
      const def = KINDS[kind] ?? KINDS.raider;
      const rig = factory.createPerson(def.acc, def.colours, def.scale);
      const at = new THREE.Vector3(...s.pos);
      at.y = world.ground(at.x, at.z);
      const col = world.physics.addActor(RADIUS * def.scale, 0.55 * def.scale, at);
      const e = new Enemy(kind, rig, s, s.camp ?? '', col, world, sfx, seed++);
      scene.add(rig.root);
      this.list.push(e);
    }
  }

  /** Hook the telegraph glint to the enemy's sword hand. */
  setTellFx(spawn: (follow: () => THREE.Vector3) => void): void {
    for (const e of this.list) {
      const hand = e.rig.bones.get('hand_R');
      e.onTell = () => spawn(() => (hand ? hand.getWorldPosition(this.hand) : this.hand.copy(e.pos).setY(e.headY)));
    }
  }

  update(dt: number, player: PlayerView): void {
    this.assignTokensAndSlots(player);
    for (const e of this.list) {
      const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
      e.update(dt, player, d);
    }
    this.separate(player);
  }

  /**
   * Souls-style crowd control: only MAX_ATTACKERS raiders press the attack at
   * once (whoever is mid-swing keeps the slot), and every engaged raider gets
   * an angle around the player spread far enough apart that bodies don't overlap.
   */
  private assignTokensAndSlots(player: PlayerView): void {
    const p = player.pos;
    const dist = (e: Enemy) => Math.hypot(e.pos.x - p.x, e.pos.z - p.z);
    const near = this.list.filter((e) => !e.dead && e.combatant && dist(e) < 25);
    const nearSet = new Set(near);
    for (const e of this.list) {
      if (nearSet.has(e)) continue;
      e.hasToken = false;
      e.slotAngle = NaN;
    }
    // Raiders mid-swing keep their token; then the nearest ones ready to attack.
    let tokens = 0;
    for (const e of near) {
      e.hasToken = e.midAttack;
      if (e.hasToken) tokens++;
    }
    const ready = near.filter((e) => !e.hasToken && e.readyToAttack).sort((a, b) => dist(a) - dist(b));
    for (const e of ready) {
      if (tokens >= MAX_ATTACKERS) break;
      e.hasToken = true;
      tokens++;
    }

    // Slot angles: start from where each raider stands, then relax so that
    // neighbours on the same ring are at least two body widths apart.
    for (const inner of [true, false]) {
      const items = near
        .filter((e) => e.hasToken === inner)
        .map((e) => {
          const cur = Math.atan2(e.pos.x - p.x, e.pos.z - p.z);
          const prev = Number.isNaN(e.slotAngle) ? cur : e.slotAngle;
          // Drift toward the raider's natural position so slots stay nearby.
          return { e, a: prev + wrapAngle(cur - prev) * 0.08 };
        });
      if (items.length > 1) {
        for (let iter = 0; iter < 6; iter++) {
          items.sort((x, y) => x.a - y.a);
          for (let i = 0; i < items.length; i++) {
            const A = items[i];
            const B = items[(i + 1) % items.length];
            const R = inner ? Math.max(A.e.def.range, B.e.def.range) * 0.85 : WAIT_RING;
            const chord = A.e.bodyRadius + B.e.bodyRadius + 0.45;
            const need = 2 * Math.asin(Math.min(1, chord / (2 * R)));
            const gap = (((B.a - A.a) % TAU) + TAU) % TAU;
            if (gap < need) {
              const push = (need - gap) / 2;
              A.a -= push;
              B.a += push;
            }
          }
        }
      }
      for (const it of items) it.e.slotAngle = wrapAngle(it.a);
    }
  }

  /** Hard separation: raiders never overlap each other or the player. */
  private separate(player: PlayerView): void {
    const live = this.list.filter((e) => !e.dead);
    for (let iter = 0; iter < 2; iter++) {
      for (let i = 0; i < live.length; i++) {
        const a = live[i];
        for (let j = i + 1; j < live.length; j++) {
          const b = live[j];
          const dx = b.pos.x - a.pos.x;
          const dz = b.pos.z - a.pos.z;
          const min = a.bodyRadius + b.bodyRadius;
          const d2 = dx * dx + dz * dz;
          if (d2 >= min * min) continue;
          const d = Math.sqrt(d2);
          const nx = d > 1e-3 ? dx / d : 1;
          const nz = d > 1e-3 ? dz / d : 0;
          const push = (min - d) / 2;
          a.nudge(-nx * push, -nz * push);
          b.nudge(nx * push, nz * push);
        }
        if (player.dead) continue;
        // The player doesn't move here (their own capsule handles the rest).
        const px = a.pos.x - player.pos.x;
        const pz = a.pos.z - player.pos.z;
        const pmin = a.bodyRadius + 0.38;
        const pd = Math.hypot(px, pz);
        if (pd < pmin && pd > 1e-3) a.nudge((px / pd) * (pmin - pd), (pz / pd) * (pmin - pd));
      }
    }
    for (const e of live) e.sync();
  }

  hitArc(origin: THREE.Vector3, yaw: number, range: number, halfAngle: number, dmg: number): HitResult[] {
    const out: HitResult[] = [];
    const cosMax = Math.cos(halfAngle);
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    for (const e of this.list) {
      if (e.dead) continue;
      const dx = e.pos.x - origin.x;
      const dz = e.pos.z - origin.z;
      const d = Math.hypot(dx, dz);
      const r = RADIUS * e.def.scale;
      if (d > range + r || Math.abs(e.pos.y - origin.y) > 2.5) continue;
      if (d > 0.4 && (dx * fx + dz * fz) / d < cosMax) continue;
      out.push(e.damage(dmg, origin));
    }
    return out;
  }

  /** Nearest living enemy within `range` and the cone in front (for aim assist). */
  aimTarget(origin: THREE.Vector3, yaw: number, range: number, halfAngle: number): Enemy | null {
    let best: Enemy | null = null;
    let bd = range;
    for (const e of this.list) {
      if (e.dead) continue;
      const d = Math.hypot(e.pos.x - origin.x, e.pos.z - origin.z);
      if (d > bd) continue;
      const a = Math.abs(wrapAngle(angleTo(origin, e.pos) - yaw));
      if (a > halfAngle) continue;
      bd = d;
      best = e;
    }
    return best;
  }

  /** Hook every enemy's death. */
  setKillHook(cb: (e: Enemy) => void): void {
    for (const e of this.list) e.onKilled = cb;
  }

  /** Living enemies left in a camp. */
  campAlive(camp: string): number {
    return this.list.filter((e) => e.camp === camp && !e.dead).length;
  }

  /** Camp centres (for map icons), with how many are still alive. */
  camps(): { camp: string; x: number; z: number; alive: number; total: number }[] {
    const m = new Map<string, { x: number; z: number; alive: number; total: number }>();
    for (const e of this.list) {
      const c = m.get(e.camp) ?? { x: 0, z: 0, alive: 0, total: 0 };
      c.x += e.homePos.x;
      c.z += e.homePos.z;
      c.total++;
      if (!e.dead) c.alive++;
      m.set(e.camp, c);
    }
    return [...m].map(([camp, c]) => ({ camp, x: c.x / c.total, z: c.z / c.total, alive: c.alive, total: c.total }));
  }

  resetAll(): void {
    for (const e of this.list) e.reset();
  }
}
