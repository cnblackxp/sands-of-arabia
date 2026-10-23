import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { CharacterFactory, CLIP_SPEED, type Accessory, type Rig } from './characters';
import { BEAST_KINDS, createBeast, type Beast, type BeastKind, type BeastModels, type Ear } from './beasts';
import type { Foe, HitResult, PlayerView } from './combat';
import { Flash, type Sfx } from './fx';
import { tOr } from './i18n';
import type { Spawn } from './level';
import { PathFollower } from './nav';
import { angleTo, dampAngle, mulberry32, turnToward, wrapAngle } from './util';
import type { World } from './world';

/**
 * Hostile raiders, Dark Souls style: they telegraph every swing with a slow
 * windup and a red flash + glint, commit to the strike, then recover — the
 * recovery is the opening. Poise decides whether a hit makes them flinch.
 */

export type EnemyKind = 'raider' | 'skirmisher' | 'brute' | 'chief' | 'slinger' | 'clubman' | 'archer' | 'champion' | 'ghul';

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
  /** Throws stones from range instead of closing in (slingers). */
  ranged?: { min: number; max: number; cooldown: [number, number]; dmg: number; arrow?: boolean };
  /** Big wooden club: heavier swing sounds. */
  club?: boolean;
  /** Vanishes in a whirl of sand and stands behind the player, every [min, max] s (the ghul). */
  blink?: [number, number];
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
  slinger: {
    title: 'Slinger',
    hp: 55,
    poise: 1,
    walk: 1.9,
    run: 4.6,
    scale: 0.95,
    dmg: 8,
    knock: 0.9,
    range: 1.6,
    windup: 0.6,
    comboWindup: 0.3,
    strikeSpeed: 1.6,
    recover: 0.7,
    maxCombo: 1,
    comboChance: 0,
    sight: 24,
    turn: 4,
    lunge: 1.4,
    acc: ['Keffiyeh', 'FaceWrap', 'Waterskin', 'Sling'],
    colours: { P_Robe: 0xb8a48a, P_Sash: 0x7b2a24, P_Wrap: 0xe5dcc8, P_Pants: 0x5a3f2c, P_Skin: 0x9a6440 },
    swings: [4],
    block: 0,
    backstep: 0.5,
    ranged: { min: 6, max: 21, cooldown: [2.0, 3.4], dmg: 12 },
  },
  champion: {
    title: 'Champion of Ukaz',
    hp: 760,
    poise: 5,
    walk: 1.6,
    run: 3.8,
    scale: 1.3,
    dmg: 36,
    knock: 3.6,
    range: 2.6,
    windup: 0.8,
    comboWindup: 0.4,
    strikeSpeed: 1.45,
    recover: 0.95,
    maxCombo: 3,
    comboChance: 0.6,
    sight: 16,
    turn: 2.6,
    lunge: 3.2,
    acc: ['Helmet', 'BeardLong', 'Lamellar', 'Cloak', 'Sword', 'Shield'],
    colours: { P_Robe: 0x6d1a14, P_Sash: 0xd6a531, P_Wrap: 0x2b2622, P_Pants: 0x2a1d17, P_Skin: 0x9a6440, P_Cloak: 0x2c3e73, P_Armor: 0x8a7a5a },
    swings: [2, 0, 1, 3],
    block: 0.35,
    backstep: 0.25,
  },
  ghul: {
    title: 'Ghul of the Sandstorm',
    hp: 900,
    poise: 6,
    walk: 1.7,
    run: 4.6,
    scale: 1.45,
    dmg: 32,
    knock: 3.4,
    range: 2.5,
    windup: 0.7,
    comboWindup: 0.35,
    strikeSpeed: 1.55,
    recover: 0.9,
    maxCombo: 3,
    comboChance: 0.55,
    sight: 22,
    turn: 3,
    lunge: 3.4,
    acc: ['Hair', 'Cloak'],
    colours: { P_Robe: 0x2a2420, P_Sash: 0x4a3a2c, P_Wrap: 0x3a332b, P_Pants: 0x2a2420, P_Skin: 0x7d7a6e, P_Hair: 0x1a1714, P_Cloak: 0x3b2f26 },
    swings: [2, 0, 1],
    block: 0,
    backstep: 0.3,
    blink: [5, 8],
  },
  archer: {
    title: 'Archer',
    hp: 60,
    poise: 1,
    walk: 1.8,
    run: 4.4,
    scale: 0.97,
    dmg: 8,
    knock: 0.9,
    range: 1.6,
    windup: 0.9,
    comboWindup: 0.3,
    strikeSpeed: 1.6,
    recover: 0.8,
    maxCombo: 1,
    comboChance: 0,
    sight: 28,
    turn: 3.5,
    lunge: 1.2,
    acc: ['Keffiyeh', 'FaceWrap', 'Vest', 'BowHeld', 'Quiver'],
    colours: { P_Robe: 0x5a4632, P_Sash: 0x2b2622, P_Wrap: 0x3b3530, P_Pants: 0x2f2a26, P_Skin: 0x9a6440, P_Vest: 0x3b2a1c },
    swings: [6],
    block: 0,
    backstep: 0.4,
    ranged: { min: 9, max: 28, cooldown: [2.4, 3.6], dmg: 14, arrow: true },
  },
  clubman: {
    title: 'Clubman',
    hp: 200,
    poise: 3,
    walk: 1.35,
    run: 3.2,
    scale: 1.24,
    dmg: 30,
    knock: 3.2,
    range: 2.4,
    windup: 0.95,
    comboWindup: 0.55,
    strikeSpeed: 1.25,
    recover: 1.3,
    maxCombo: 2,
    comboChance: 0.3,
    sight: 13,
    turn: 2,
    lunge: 2.6,
    acc: ['Turban', 'BeardLong', 'Belly', 'Vest', 'Club'],
    colours: { P_Robe: 0x6b4a32, P_Sash: 0x2b2622, P_Wrap: 0x7b2a24, P_Pants: 0x3d3128, P_Skin: 0x7d4f31, P_Vest: 0x4a2a17 },
    swings: [5, 0],
    block: 0,
    backstep: 0,
    club: true,
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
  // Overhand stone throw (Throw clip when the model has it, else the Attack raise).
  { clip: 'Throw', raise: 0.2, hit: 0.333, raiseSpeed: 0.5, strike: null, heavy: false },
  // Clubman's overhead slam: authored raise and hold like HeavyAttack.
  { clip: 'ClubSwing', raise: 0.708, hit: 0.875, raiseSpeed: 1, strike: 1.1, heavy: true },
  // Archer: draw to full and hold (the tell), then loose.
  { clip: 'BowDraw', raise: 0.5, hit: 0.54, raiseSpeed: 0.9, strike: 1, heavy: false },
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

export class Enemy implements Foe {
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
  onKilled: (e: Foe) => void = () => {};
  /** Slingers: loose a stone from the hand toward the player. */
  onThrow: (e: Enemy, from: THREE.Vector3, dmg: number) => void = () => {};
  readonly flying = false;
  /** Called at the telegraph moment of a windup (glint VFX). */
  onTell: (e: Enemy) => void = () => {};
  /** The ghul vanished at `from` and stands at `to` (sand VFX and sound). */
  onBlink: (e: Enemy, from: THREE.Vector3, to: THREE.Vector3) => void = () => {};
  private blinkT = 3;
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
  /** Grunt pitch: brutes are deep, skirmishers light. */
  private get voicePitch(): number {
    return this.kind === 'ghul' ? 62 : this.kind === 'brute' || this.kind === 'clubman' ? 85 : this.kind === 'skirmisher' || this.kind === 'slinger' ? 165 : this.kind === 'chief' ? 105 : 130;
  }
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
    this.nightOnly = !!spawn.night_only;
    this.boss = !!spawn.boss;
    this.hp = this.def.hp;
    this.pos.set(...spawn.pos);
    this.pos.y = world.floor(this.pos.x, this.pos.z, spawn.pos[1]);
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
    return this.dormant || this.state === 'dead';
  }
  /** Night-only foes are away by day (not drawn, not fighting, not counted). */
  readonly nightOnly: boolean;
  /** A boss: the HUD shows its big health bar while fighting it. */
  readonly boss: boolean;
  dormant = false;
  setDormant(on: boolean): void {
    if (on === this.dormant) return;
    if (!on) this.reset();
    this.dormant = on;
    this.rig.root.visible = !on;
    this.collider.setEnabled(!on && this.state !== 'dead');
  }
  get maxHp(): number {
    return this.def.hp * this.hpScale;
  }
  /** A training dummy (?playtest): stands still and never fights back. */
  passive = false;
  /** Health multiplier (the dummy takes long combos). */
  hpScale = 1;
  get moving(): boolean {
    return !this.dead && (this.state === 'approach' || this.state === 'reposition' || this.state === 'return' || (this.state === 'idle' && this.rig.anim.base === 'Walk'));
  }
  get running(): boolean {
    return this.state === 'approach' && this.rig.anim.base === 'Run';
  }
  get hitRadius(): number {
    return 0.38 * this.def.scale;
  }
  get hitLo(): number {
    return 0.15;
  }
  get hitHi(): number {
    return 1.85 * this.def.scale;
  }
  get root(): THREE.Object3D {
    return this.rig.root;
  }
  /** Arrows (and the occasional stone) hit like a light blow, but never stagger brutes. */
  shot(dmg: number, from: THREE.Vector3): HitResult | null {
    return this.damage(dmg, from);
  }
  get title(): string {
    return this.passive ? tOr('enemies.dummy', 'Training dummy') : tOr(`enemies.${this.kind}`, this.def.title);
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
    this.hp = this.maxHp;
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
  damage(dmg: number, from: THREE.Vector3, poise = 1): HitResult {
    const res: HitResult = { pos: this.pos.clone().setY(this.pos.y + 1.2 * this.def.scale), killed: false, staggered: false };
    if (this.dead) return res;
    const away = this.pos.clone().sub(from).setY(0).normalize();
    // Shield up and facing the blow: no damage, but the guard wears down.
    if (this.state === 'block' && Math.cos(wrapAngle(Math.atan2(-away.x, -away.z) - this.yaw)) > 0.3) {
      res.blocked = true;
      this.guardHits += poise;
      this.knock.copy(away).multiplyScalar(1.2);
      this.sfx.clang();
      if (this.guardHits >= 2) {
        // Guard break: wide open.
        this.sfx.guardBreak();
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
    if (this.hp > 0) this.sfx.grunt(this.voicePitch);
    if (this.hp <= 0) {
      this.hp = 0;
      this.knock.copy(away).multiplyScalar(3);
      this.enter('dead');
      this.collider.setEnabled(false);
      this.sfx.death();
      this.sfx.grunt(this.voicePitch * 0.75, 0, 1.2);
      res.killed = true;
      this.onKilled(this);
      return res;
    }
    // Poise: brutes shrug off single blows, especially mid-swing (hyper armour).
    this.poiseHits += poise;
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
    if (this.def.blink) this.sfx.ghulHowl();
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
    if (d.blink) this.blinkT -= dt;
    const dx = player.pos.x - this.pos.x;
    const dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const toPlayer = Math.atan2(dx, dz);
    this.lastPlayer.copy(player.pos);
    const fromHome = Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z);
    const playerHere = !player.dead && Math.hypot(player.pos.x - this.home.x, player.pos.z - this.home.z) < LEASH + 6;

    // Shield reaction: when the player starts a swing in reach, maybe raise the guard.
    if (player.attacking && !this.sawPlayerAttack) {
      this.sawPlayerAttack = true;
      const canBlock = !this.passive && (this.state === 'approach' || this.state === 'reposition' || this.state === 'recover');
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
        if (!player.dead && dist < d.sight && playerHere && !this.passive) {
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
        if (this.passive) {
          this.enter('idle');
          break;
        }
        if (player.dead || !playerHere || fromHome > LEASH) {
          this.goHome();
          break;
        }
        if (d.ranged) {
          this.rangedApproach(dt, player, dist, toPlayer);
          break;
        }
        if (d.blink && this.blinkT <= 0 && dist > 5 && dist < 20 && this.blink(player)) break;
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
        const s = this.swingDef;
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
          if (d.ranged && this.swing === 4) this.sfx.slingWhirl();
          else if (d.ranged?.arrow && this.swing === 6) this.sfx.bowDraw(0.4);
          else this.sfx.tell();
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
        const s = this.swingDef;
        const t = this.rig.anim.overlayTime();
        if (d.ranged) {
          // Let the stone fly at the release point; no lunge.
          if (!this.struck && (t < 0 || t >= s.hit)) {
            this.struck = true;
            const hand = this.rig.bones.get('hand_R');
            const from = hand ? hand.getWorldPosition(new THREE.Vector3()) : this.pos.clone().setY(this.pos.y + 1.7);
            this.onThrow(this, from, d.ranged.dmg);
            this.rig.anim.setOverlayTimeScale(1);
          }
          this.timer -= dt;
          if (this.struck && this.timer <= 0) {
            this.cooldown = d.ranged.cooldown[0] + this.rnd() * (d.ranged.cooldown[1] - d.ranged.cooldown[0]);
            this.timer = d.recover;
            this.combo = 0;
            this.enter('recover');
          }
          break;
        }
        // Committed: no tracking, a short lunge into the blow.
        if (!this.struck) {
          const step = d.lunge * dt;
          this.stepDir(Math.sin(this.yaw), Math.cos(this.yaw), dist > 0.9 ? step : 0, dt, false);
        }
        if (!this.struck && (t < 0 || t >= s.hit)) {
          this.struck = true;
          if (d.club) this.sfx.clubSwing();
          else this.sfx.swing(this.kind === 'brute');
          const facing = Math.cos(wrapAngle(toPlayer - this.yaw)) > 0.45;
          const reach = d.range + (player.mounted ? 0.6 : 0.25);
          if (facing && dist < reach && !player.dead && player.hurt(s.heavy ? d.dmg * 1.15 : d.dmg, this.pos, s.heavy ? d.knock * 1.3 : d.knock) && d.club) this.sfx.clubHit();
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

  /**
   * Slingers keep their distance: back off when the player closes in, come
   * closer when out of range, otherwise stand and throw when the line is clear.
   */
  private rangedApproach(dt: number, player: PlayerView, dist: number, toPlayer: number): void {
    const d = this.def;
    const r = d.ranged!;
    const anim = this.rig.anim;
    if (dist < r.min) {
      // Too close: retreat away from the player.
      const ax = this.pos.x - player.pos.x;
      const az = this.pos.z - player.pos.z;
      const len = Math.hypot(ax, az) || 1;
      const tx = this.pos.x + (ax / len) * 3;
      const tz = this.pos.z + (az / len) * 3;
      if (!this.world.nav.isBlocked(tx, tz)) {
        anim.setBase('Run', d.run / CLIP_SPEED.personRun, 0.15);
        this.moveToward(tx, tz, d.run * 0.85, dt);
        return;
      }
      // Cornered: fight with what it has.
      if (dist < d.range + 0.3 && this.cooldown <= 0) {
        this.startSwing(true);
        return;
      }
    } else if (dist > r.max || !this.world.nav.lineClear(this.pos.x, this.pos.z, player.pos.x, player.pos.z)) {
      anim.setBase('Run', d.run / CLIP_SPEED.personRun, 0.15);
      this.moveToward(player.pos.x, player.pos.z, d.run, dt, r.min + 1);
      return;
    }
    anim.setBase('Idle', 1, 0.2);
    this.yaw = turnToward(this.yaw, toPlayer, d.turn, dt);
    if (this.cooldown <= 0 && Math.abs(wrapAngle(toPlayer - this.yaw)) < 0.3) this.startSwing(true);
  }

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
    // Slinger up close: a quick swing instead of a throw.
    if (d.ranged && Math.hypot(this.pos.x - this.lastPlayer.x, this.pos.z - this.lastPlayer.z) < d.ranged.min - 1) this.swing = 0;
    let s = SWINGS[this.swing];
    // Older models: the club falls back to HeavyAttack, the throw to the Attack raise.
    if (!this.rig.anim.hasOverlay(s.clip)) s = s.clip === 'ClubSwing' ? SWINGS[2] : { ...SWINGS[0], raiseSpeed: s.raiseSpeed };
    this.swingDef = s;
    // The hold can't be shorter than the time the raise takes to play.
    const minHold = s.raise / s.raiseSpeed + 0.05;
    this.timer = Math.max(minHold, (first ? d.windup : d.comboWindup) * (0.85 + this.rnd() * 0.3));
    this.told = false;
    this.rig.anim.playOverlay(s.clip, { fade: 0.08, timeScale: s.raiseSpeed });
    this.enter('windup');
  }

  /** The swing being played (the authored one, or its fallback clip). */
  private swingDef: Swing = SWINGS[0];
  private lastPlayer = new THREE.Vector3();

  /** The ghul is suddenly behind you, in a whirl of sand: a short pause, then it swings. */
  private blink(player: PlayerView): boolean {
    const b = this.def.blink!;
    this.blinkT = b[0] + this.rnd() * (b[1] - b[0]);
    const ax = player.pos.x - this.pos.x;
    const az = player.pos.z - this.pos.z;
    const len = Math.hypot(ax, az) || 1;
    const tx = player.pos.x + (ax / len) * 2.8;
    const tz = player.pos.z + (az / len) * 2.8;
    if (this.world.nav.isBlocked(tx, tz)) return false;
    const from = this.pos.clone();
    this.pos.set(tx, this.world.floor(tx, tz, player.pos.y), tz);
    this.yaw = Math.atan2(player.pos.x - tx, player.pos.z - tz);
    this.follow.clear();
    this.sync();
    this.onBlink(this, from, this.pos.clone());
    this.flash.tell(0.2);
    this.timer = 0.45;
    this.enter('alert');
    return true;
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
    this.pos.y = this.world.floor(nx, nz, this.pos.y);
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
    this.pos.y = this.world.floor(nx, nz, this.pos.y);
    if (face) this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 12, dt);
  }

  sync(): void {
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.yaw;
    if (!this.dead) this.collider.setTranslation({ x: this.pos.x, y: this.pos.y + 0.9 * this.def.scale, z: this.pos.z });
  }
}

/** Procedural club (until the Club accessory exists): a knobbed acacia club with bronze studs. */
function buildClub(): THREE.Group {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4426, roughness: 0.85, flatShading: true });
  const stud = new THREE.MeshStandardMaterial({ color: 0xb98a3e, roughness: 0.4, metalness: 0.7 });
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, y: number) => {
    const b = new THREE.Mesh(geo, m);
    b.position.y = y;
    b.castShadow = true;
    g.add(b);
    return b;
  };
  add(new THREE.BoxGeometry(0.06, 0.55, 0.06), wood, -0.2);
  add(new THREE.BoxGeometry(0.13, 0.32, 0.13), wood, -0.6);
  for (const [x, y, z] of [[0.07, -0.55, 0], [-0.07, -0.66, 0], [0, -0.6, 0.07], [0, -0.7, -0.07]]) {
    const st = add(new THREE.BoxGeometry(0.04, 0.04, 0.04), stud, y);
    st.position.x = x;
    st.position.z = z;
  }
  return g;
}

/** The ghul's eyes: two embers in an ashen face (until it has a model of its own). */
const EMBER = new THREE.MeshBasicMaterial({ color: 0xff8a1a, fog: false, toneMapped: false });
const EYE_GEO = new THREE.BoxGeometry(0.045, 0.028, 0.03);
function addEmberEyes(rig: Rig, scale: number): void {
  const head = rig.bones.get('head');
  if (!head) return;
  rig.root.updateMatrixWorld(true);
  const at = head.getWorldPosition(new THREE.Vector3());
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(EYE_GEO, EMBER);
    eye.position.copy(head.worldToLocal(at.clone().add(new THREE.Vector3(0.06 * s * scale, 0.25 * scale, 0.165 * scale))));
    head.add(eye);
  }
}

export class EnemySystem {
  /** Every hostile: raiders and beasts. */
  readonly list: Foe[] = [];
  /** Raiders (people): the ones that share attack tokens and ring slots. */
  readonly humans: Enemy[] = [];
  readonly beasts: Beast[] = [];
  private hand = new THREE.Vector3();
  /** Pan/gain of a world point for beast sounds (set by the game). */
  ear: Ear = () => ({ pan: 0, gain: 1 });

  constructor(
    private world: World,
    private factory: CharacterFactory,
    private scene: THREE.Scene,
    private sfx: Sfx,
    private models: BeastModels,
  ) {
    for (const s of world.level.spawns) {
      if (s.role !== 'enemy') continue;
      this.spawn(s);
    }
  }

  private seed = 100;

  /** Add an enemy from a spawn entry (level.json, or the debug menu). */
  spawn(s: Spawn): Foe {
    const kindName = s.title === 'chief' ? 'chief' : (s.kind ?? 'raider');
    if (BEAST_KINDS.has(kindName)) {
      const b = createBeast(kindName as BeastKind, s, this.world, this.sfx, (p) => this.ear(p), this.models, this.seed++);
      this.scene.add(b.root);
      this.beasts.push(b);
      this.list.push(b);
      return b;
    }
    const dummy = kindName === 'dummy';
    const kind = (KINDS[kindName as EnemyKind] ? kindName : 'raider') as EnemyKind;
    const def = KINDS[kind];
    // Himyarite raiders wear the king's indigo and gold.
    // Variants: Himyar's indigo and gold, Palmyra's red and ochre, the camel raiders' dust.
    const look: Record<string, Record<string, number>> = {
      himyar: { P_Robe: 0x1f2f5a, P_Sash: 0xd6a531, P_Wrap: 0x1f2f5a, P_Vest: 0x6b4a32 },
      palmyrene: { P_Robe: 0x8a2a1a, P_Sash: 0xc9902e, P_Wrap: 0xe5dcc8, P_Vest: 0x6b4426, P_Pants: 0x3d3128 },
      camel: { P_Robe: 0x9a8a70, P_Sash: 0x3b3530, P_Wrap: 0x6b5a48, P_Vest: 0x4a3a2c },
    };
    const colours = dummy
      ? { P_Robe: 0xc9a86a, P_Sash: 0x7b5a32, P_Wrap: 0xc9a86a, P_Pants: 0xa8884f, P_Skin: 0xb89a6a, P_Vest: 0x8a6a40 }
      : s.variant && look[s.variant]
        ? { ...def.colours, ...look[s.variant] }
        : def.colours;
    const rig = this.factory.createPerson(dummy ? ['Vest'] : def.acc, colours, def.scale);
    if (def.club && !this.factory.hasPart('Club')) rig.bones.get('hand_R')?.add(buildClub());
    if (def.blink) addEmberEyes(rig, def.scale);
    const at = new THREE.Vector3(...s.pos);
    at.y = this.world.floor(at.x, at.z, s.pos[1]);
    const col = this.world.physics.addActor(RADIUS * def.scale, 0.55 * def.scale, at);
    const e = new Enemy(kind, rig, s, s.camp ?? '', col, this.world, this.sfx, this.seed++);
    if (dummy) {
      e.passive = true;
      e.hpScale = 5;
      e.hp = e.maxHp;
    }
    e.onThrow = (en, from, dmg) => this.onThrow(en, from, dmg);
    e.onTell = this.tellFx ? this.tellFor(e) : () => {};
    e.onBlink = (_, a, b) => this.onBlink(a, b);
    e.onKilled = this.killHook;
    this.scene.add(rig.root);
    this.humans.push(e);
    this.list.push(e);
    return e;
  }

  /** The ghul moved through the sand (the game adds the dust and the sound). */
  onBlink: (from: THREE.Vector3, to: THREE.Vector3) => void = () => {};
  /** A slinger lets a stone fly (the game turns it into a projectile). */
  onThrow: (e: Enemy, from: THREE.Vector3, dmg: number) => void = () => {};
  private tellFx: ((follow: () => THREE.Vector3) => void) | null = null;
  private killHook: (e: Foe) => void = () => {};

  private tellFor(e: Enemy): (e: Enemy) => void {
    const hand = e.rig.bones.get('hand_R');
    return () => this.tellFx?.(() => (hand ? hand.getWorldPosition(this.hand) : this.hand.copy(e.pos).setY(e.headY)));
  }

  /** Hook the telegraph glint to the enemy's sword hand. */
  setTellFx(spawn: (follow: () => THREE.Vector3) => void): void {
    this.tellFx = spawn;
    for (const e of this.humans) e.onTell = this.tellFor(e);
  }

  private tick = 0;
  private slept = new Map<Foe, number>();

  update(dt: number, player: PlayerView, night = false): void {
    this.assignTokensAndSlots(player);
    this.tick++;
    let i = 0;
    for (const e of this.list) {
      i++;
      // Night-only foes come out at dusk and are gone by dawn (back at their posts).
      if (e.nightOnly) e.setDormant(!night);
      if (e.dormant) continue;
      const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
      e.root.visible = d < 200 || e.engaged;
      const run = (t: number) => (e instanceof Enemy ? e.update(t, player, d) : (e as Beast).update(t, player, d));
      // Idle foes far away (big maps) update every 6th frame with the time they missed.
      if (d < 90 || e.engaged) {
        run(dt + (this.slept.get(e) ?? 0));
        this.slept.set(e, 0);
      } else {
        const acc = (this.slept.get(e) ?? 0) + dt;
        if ((this.tick + i) % 6 === 0) {
          run(acc);
          this.slept.set(e, 0);
        } else this.slept.set(e, acc);
      }
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
    // Slingers keep their own distance: no tokens, no ring slots.
    const near = this.humans.filter((e) => !e.dead && e.combatant && !e.def.ranged && dist(e) < 25);
    const nearSet = new Set(near);
    for (const e of this.humans) {
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
    const live: (Enemy | Beast)[] = [...this.humans.filter((e) => !e.dead), ...this.beasts.filter((b) => !b.dead && !b.flying)];
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

  hitArc(origin: THREE.Vector3, yaw: number, range: number, halfAngle: number, dmg: number, poise = 1): HitResult[] {
    const out: HitResult[] = [];
    const cosMax = Math.cos(halfAngle);
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    for (const e of this.list) {
      if (e.dead) continue;
      const dx = e.pos.x - origin.x;
      const dz = e.pos.z - origin.z;
      const d = Math.hypot(dx, dz);
      const r = e.hitRadius;
      // Flying foes are only in reach while they swoop low.
      const dy = e.flying ? e.pos.y - (origin.y + 1.2) : e.pos.y - origin.y;
      if (d > range + r || Math.abs(dy) > (e.flying ? 1.3 : 2.5)) continue;
      if (d > 0.4 && (dx * fx + dz * fz) / d < cosMax) continue;
      out.push(e.damage(dmg, origin, poise));
    }
    return out;
  }

  /** Nearest living enemy within `range` and the cone in front (for aim assist). */
  aimTarget(origin: THREE.Vector3, yaw: number, range: number, halfAngle: number, air = false): Foe | null {
    let best: Foe | null = null;
    let bd = range;
    for (const e of this.list) {
      if (e.dead || (e.flying && !air && e.pos.y - origin.y > 2.5)) continue;
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
  setKillHook(cb: (e: Foe) => void): void {
    this.killHook = cb;
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
