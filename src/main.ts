import * as THREE from 'three';
import { Camel, Horse } from './animals';
import { Ambience, Music, type Mood } from './audio';
import { FollowCamera } from './camera';
import { CharacterFactory, PLAYER_LOOKS } from './characters';
import type { HitResult } from './combat';
import { type Enemy, EnemySystem } from './enemy';
import { Glints, Particles, Sfx, TimeScale } from './fx';
import { Hud, type Action, type EnemyBar } from './hud';
import { Input, type Frame } from './input';
import { GOLD_DROP, ITEM_NAMES, UPGRADES, WEAPONS, upgradePrice, weapon } from './items';
import type { Exit, Spawn, Vec3 } from './level';
import { beam, Bonfire, Chest, GoldPile, Icon, type IconKind, Pickup } from './markers';
import { Menu, type MenuRow, type MenuTab } from './menu';
import { BADGE, Minimap, type BadgeKind, type MapMarker } from './minimap';
import { type Npc, NpcSystem } from './npc';
import { Physics } from './physics';
import { Player } from './player';
import { Progress } from './progress';
import { FREE_PICKUPS, objMap, QUESTS, QuestSystem, type QuestDef } from './quests';
import { DayCycle, timeLabel } from './sky';
import { mulberry32 } from './util';
import { cutout, loadCommon, loadMap, World, type CommonAssets, type MapEntry } from './world';

const TALK_RANGE = 2.4;
/** See-through radius around the player, metres. */
const CUT_RADIUS = 2.6;
const MOUNT_RANGE = 2.8;
const USE_RANGE = 2.2;

const ROBES: (number | null)[] = [null, 0xf1ece0, 0x2c3e73, 0x7b2a24, 0xc9902e, 0x2f6d4f, 0x5b2d6e, 0x2b2622, 0xb8a48a];
const FLOW: { label: string; on: boolean; speed: number }[] = [
  { label: 'Stopped', on: false, speed: 0 },
  { label: 'Slow (1 h / min)', on: true, speed: 1 / 60 },
  { label: 'Fast (1 h / 10 s)', on: true, speed: 1 / 10 },
];

function nameHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

/** Speaking pitch (Hz) for an NPC's babble: stable per name, women higher, guards and priests lower. */
function voiceOf(npc: Npc): number {
  const base = npc.female ? 290 : npc.role === 'guard' || npc.role === 'priest' ? 150 : 185;
  return base * (0.88 + nameHash(npc.name) * 0.24);
}

const FILLERS = ['Hmm…', 'Ah.', 'Mm.', 'Well…', 'Eh.', 'Oh!', 'Hm, hm.'];

/** Small talk sometimes opens with an "um" or "ah", seeded by name and time. */
function withFiller(lines: string[], name: string): string[] {
  if (lines.length === 0 || Math.random() > 0.4) return lines;
  const f = FILLERS[Math.floor(nameHash(name + Date.now()) * FILLERS.length)];
  return [`${f} ${lines[0]}`, ...lines.slice(1)];
}

interface Arrival {
  pos: Vec3;
  yaw: number;
  /** Wake up from death: full health, enemies fresh. */
  revive?: boolean;
}

class Game {
  renderer: THREE.WebGLRenderer;
  cam = new FollowCamera();
  input: Input;
  hud: Hud;
  sfx = new Sfx();
  ambience = new Ambience(this.sfx);
  music = new Music(this.sfx, import.meta.env.BASE_URL);
  /** Per-walker footstep state (distance since the last step, last position). */
  private steps = new Map<object, { x: number; z: number; acc: number; phase: number }>();
  private prevEnemyState = new Map<object, string>();
  private nextAnimal = 4;
  time = new TimeScale();
  progress = new Progress();
  quests: QuestSystem;
  physics!: Physics;
  world!: World;
  common!: CommonAssets;
  factory!: CharacterFactory;
  mapName = '';
  exits: Exit[] = [];
  private beacons: THREE.Mesh[] = [];
  private travelling = false;
  private debugObj: THREE.Object3D | null = null;
  day!: DayCycle;
  player!: Player;
  npcs!: NpcSystem;
  enemies!: EnemySystem;
  particles!: Particles;
  glints!: Glints;
  minimap!: Minimap;
  menu!: Menu;
  horses: Horse[] = [];
  camels: Camel[] = [];
  bonfires: Bonfire[] = [];
  chests: Chest[] = [];
  pickups: Pickup[] = [];
  lostPile: GoldPile | null = null;
  private icons = new Map<Npc, Icon>();
  dialogue: { npc: Npc; lines: string[]; i: number; onDone?: () => void; voice: number } | null = null;
  private last = performance.now();
  private fpsAcc = 0;
  private fpsFrames = 0;
  fps = 60;
  private frameNo = 0;
  private robe = 0;
  private flow = 0;
  private projected = new THREE.Vector3();

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.input = new Input(canvas);
    this.input.onGesture = () => this.sfx.unlock();
    this.hud = new Hud(document.getElementById('hud')!);
    this.quests = new QuestSystem(this.progress, {
      toast: (t) => this.hud.showToast(t, 3.5),
      reward: (q) => this.questReward(q),
      sound: (k) => (k === 'accept' ? this.sfx.questAccept() : this.sfx.pickup()),
    });
    // Animal Crossing-style babble: each typed letter is voiced in the speaker's pitch.
    this.hud.onVoice = (ch) => {
      if (this.dialogue) this.sfx.voice(this.dialogue.voice, ch);
    };
    window.addEventListener('resize', () => this.resize());
  }

  async start(): Promise<void> {
    const bar = document.querySelector('#loading .bar div') as HTMLDivElement;
    const msg = document.querySelector('#loading .msg') as HTMLDivElement;
    this.common = await loadCommon((f, label) => {
      bar.style.width = `${f * 50}%`;
      msg.textContent = `Loaded ${label}`;
    });
    const c = this.common;
    void this.music.load();
    this.factory = new CharacterFactory(c.person, c.horse, c.camel, c.personClips);
    this.factory.setWingedHorse(c.wingedHorse);

    const hudRoot = document.getElementById('hud')!;
    this.menu = new Menu(hudRoot, this.hud, (confirm) => this.sfx.ui(confirm));
    this.menu.onClose = () => {
      this.input.cancelHolds();
      this.cam.focus = false;
      this.minimap?.setVisible(true);
    };
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Backquote' && this.debugObj) this.debugObj.visible = !this.debugObj.visible;
    });

    // Resume at the last bonfire if there is one.
    const bf = this.progress.data.bonfire;
    if (bf && c.maps.maps.some((m) => m.name === bf.map)) await this.enterMap(bf.map, null, { pos: bf.pos, yaw: bf.yaw });
    else await this.enterMap(c.maps.start, null);
    this.resize();
    this.canvas.focus();
    this.renderer.setAnimationLoop(() => this.frame());
    // Embedded previews can stall requestAnimationFrame while the page is still
    // visible; keep ticking from a timer until rAF comes back.
    setInterval(() => {
      if (performance.now() - this.last > 120) this.frame();
    }, 33);
  }

  private mapEntry(name: string): MapEntry {
    return this.common.maps.maps.find((m) => m.name === name) ?? this.common.maps.maps[0];
  }

  private mapTitle(name: string): string {
    return this.mapEntry(name).title;
  }

  /** Travel to another map through an exit (or quick travel). */
  async travel(to: string, at?: Arrival): Promise<void> {
    if (this.travelling) return;
    this.closeDialogue(false);
    if (this.menu.isOpen) this.menu.close();
    this.sfx.travel();
    await this.enterMap(to, this.mapName, at);
  }

  /**
   * Load (or reuse) a map and rebuild everything that lives in it. The player
   * keeps HP, stamina and looks; horses, camels and people belong to the map.
   */
  private async enterMap(name: string, from: string | null, at?: Arrival): Promise<void> {
    this.travelling = true;
    const entry = this.mapEntry(name);
    const loading = document.getElementById('loading')!;
    const bar = document.querySelector('#loading .bar div') as HTMLDivElement;
    const msg = document.querySelector('#loading .msg') as HTMLDivElement;
    (document.querySelector('#loading .title') as HTMLDivElement).textContent = entry.title;
    loading.classList.remove('done');
    const map = await loadMap(entry, (f, label) => {
      bar.style.width = `${50 + f * 50}%`;
      msg.textContent = `Loaded ${label}`;
    });

    // Carry over what belongs to the player and the clock.
    const prev = this.player && !at?.revive ? { hp: this.player.hp, stamina: this.player.stamina } : null;
    const hours = this.day?.hours;
    this.teardown();

    this.physics = new Physics();
    await this.physics.init();
    this.world = new World(map, this.physics);
    this.mapName = entry.name;
    const scene = this.world.scene;
    this.day = new DayCycle(this.world, this.renderer, this.common.bg, this.common.envHdr);
    if (hours !== undefined) this.day.set(hours);
    this.day.flowing = FLOW[this.flow].on;
    this.day.speed = FLOW[this.flow].speed;
    this.particles = new Particles(scene);
    this.glints = new Glints(scene);
    const factory = this.factory;
    const rnd = mulberry32(21);
    const level = map.level;

    // Arrival: explicit (bonfire / respawn), else the spawn marked `from: <previous map>`.
    const spawns = level.spawns.filter((s) => s.role === 'player');
    const ps = (from && spawns.find((s) => s.from === from)) || spawns.find((s) => !s.from) || spawns[0];
    const pos = new THREE.Vector3(...(at?.pos ?? ps.pos));
    pos.y = this.physics.support(pos.x, pos.z, pos.y + 0.3);
    this.player = new Player(factory, this.physics, pos, at?.yaw ?? ps.yaw, this.playerEvents(), this.progress, this.common.personClips);
    if (prev) {
      this.player.hp = Math.min(this.player.maxHp, Math.max(1, prev.hp));
      this.player.stamina = prev.stamina;
    }
    if (this.player.lookIndex !== this.lookIndex || this.robe !== 0) this.player.setLook(this.lookIndex, ROBES[this.robe] ?? undefined);
    scene.add(this.player.rig.root);

    this.npcs = new NpcSystem(this.world, factory, scene, this.sfx);
    this.enemies = new EnemySystem(this.world, factory, scene, this.sfx);
    this.horses = [];
    this.camels = [];
    for (const s of level.spawns) {
      const role = s.role as string;
      if (role === 'horse' || role === 'winged_horse') this.addHorse(s, role === 'winged_horse', rnd);
      else if (role === 'camel') {
        const c = new Camel(factory, this.physics, s, rnd);
        this.camels.push(c);
        scene.add(c.rig.root);
      }
    }
    this.enemies.setTellFx((follow) => this.glints.spawn(follow));
    this.enemies.setKillHook((e) => this.onEnemyKilled(e));
    const tmp = new THREE.Vector3();
    this.npcs.onTell = (n) => {
      const hand = n.rig.bones.get('hand_R');
      this.glints.spawn(() => (hand ? hand.getWorldPosition(tmp) : tmp.copy(n.pos)));
    };
    this.npcs.onDeathCb = (n) => this.hud.showToast(`${n.name} the ${n.title.toLowerCase()} has fallen.`);

    // Exits: a soft light shaft over each cairn.
    this.exits = level.exits ?? [];
    for (const e of this.exits) {
      const m = beam(0xffd08a, 10, 0.5);
      m.position.set(e.pos[0], this.world.ground(e.pos[0], e.pos[2]), e.pos[2]);
      this.beacons.push(m);
      scene.add(m);
    }
    this.placeBonfires(level.spawns, ps);
    this.placeChests(level.spawns);
    this.spawnPickups();
    this.spawnLostGold();

    const hudRoot = document.getElementById('hud')!;
    const mode = this.minimap?.mode ?? 0;
    this.minimap?.dispose();
    this.minimap = new Minimap(hudRoot, level, map.heights);
    while (this.minimap.mode !== mode) this.minimap.cycle();

    this.debugObj = this.world.colliderDebug();
    this.debugObj.visible = false;
    scene.add(this.debugObj);

    this.physics.step();
    this.cam.snap(this.player.pos);
    // Compile shaders before the first frame to avoid a hitch.
    this.renderer.compile(scene, this.cam.camera);
    loading.classList.add('done');
    this.last = performance.now();
    this.travelling = false;
    this.hud.showToast(entry.title, 3);
  }

  private lookIndex = 0;

  private addHorse(s: Spawn, winged: boolean, rnd: () => number): Horse {
    const h = new Horse(this.factory, this.physics, s, rnd, winged);
    this.horses.push(h);
    this.world.scene.add(h.rig.root);
    return h;
  }

  /** Bonfires from level.json (`role: "bonfire"`), else one beside the arrival point. */
  private placeBonfires(spawns: Spawn[], arrival: Spawn): void {
    const list = spawns.filter((s) => (s.role as string) === 'bonfire');
    const spots: { pos: THREE.Vector3; yaw: number; id?: string }[] = list.map((s) => ({ pos: new THREE.Vector3(...s.pos), yaw: s.yaw, id: s.id }));
    if (spots.length === 0) {
      const a = new THREE.Vector3(...arrival.pos);
      for (const [dx, dz] of [[3, 2], [-3, 2], [2, -3], [-2, -3], [4, 0], [0, 4]]) {
        const x = a.x + dx;
        const z = a.z + dz;
        if (!this.world.nav.isBlocked(x, z)) {
          spots.push({ pos: new THREE.Vector3(x, 0, z), yaw: 0 });
          break;
        }
      }
    }
    const prop = this.common.bonfireProp?.scene ?? null;
    spots.forEach((s, i) => {
      // Markers on platforms carry their height.
      s.pos.y = this.world.floor(s.pos.x, s.pos.z, s.pos.y);
      const id = `${this.mapName}:${s.id ?? i}`;
      const b = new Bonfire(this.world.scene, id, s.pos, s.yaw, prop);
      b.setLit(this.progress.data.litBonfires.includes(id));
      this.bonfires.push(b);
      this.world.addLightSpot(s.pos.clone().setY(s.pos.y + 0.6), true);
    });
  }

  private spawnPickups(): void {
    for (const p of this.pickups) p.dispose();
    this.pickups = [];
    const markers = this.world.level.spawns.filter((x) => (x.role as string) === 'pickup');
    const at = (id: string) => {
      const m = markers.find((x) => x.id === id);
      if (!m) return null;
      return new THREE.Vector3(m.pos[0], this.world.floor(m.pos[0], m.pos[2], m.pos[1]), m.pos[2]);
    };
    for (const o of this.quests.pickupsIn(this.mapName)) {
      const pos = at(o.pickup);
      if (pos) this.pickups.push(new Pickup(this.world.scene, pos, o.item, ITEM_NAMES[o.item] ?? o.item.replace(/_/g, ' ')));
    }
    for (const [id, free] of Object.entries(FREE_PICKUPS)) {
      if (this.progress.data.taken.includes(id)) continue;
      const pos = at(id);
      if (pos) this.pickups.push(new Pickup(this.world.scene, pos, `free:${id}`, free.label));
    }
  }

  /** Chests from level.json (`role: "chest"`); opened ones stay open. */
  private placeChests(spawns: Spawn[]): void {
    const prop = this.common.chestProp?.scene ?? null;
    for (const s of spawns) {
      if ((s.role as string) !== 'chest') continue;
      const id = `${this.mapName}:${s.id ?? `${s.pos[0]},${s.pos[2]}`}`;
      const pos = new THREE.Vector3(s.pos[0], this.world.floor(s.pos[0], s.pos[2], s.pos[1]), s.pos[2]);
      const c = new Chest(this.world.scene, id, pos, s.yaw, !!s.secret, prop);
      if (this.progress.data.openedChests.includes(id)) c.setOpen();
      this.chests.push(c);
    }
  }

  private openChest(c: Chest): void {
    c.open();
    this.progress.data.openedChests.push(c.id);
    const [lo, hi] = c.secret ? [220, 380] : [50, 120];
    const g = Math.round(lo + Math.random() * (hi - lo));
    this.progress.addGold(g);
    let extra = '';
    // Secret chests also hold a waterskin (up to the cap of extra skins).
    if (c.secret) {
      const u = this.progress.data.upgrades;
      if ((u.flask ?? 0) < 3) {
        u.flask = (u.flask ?? 0) + 1;
        this.progress.data.flasks++;
        extra = ' and an extra waterskin';
      }
    }
    this.progress.save();
    this.sfx.chest();
    this.floatAt(c.pos, 1.2, `+${g} gold`, 'gold');
    this.particles.burst(c.pos.clone().setY(c.pos.y + 0.6), 14, { color: 0xffc94a, speed: 1.6, up: 3, size: 0.06, life: 0.8 });
    this.hud.showToast(`${c.secret ? 'A hidden chest! ' : ''}${g} gold${extra}.`, 3);
    if (c.secret) this.sfx.questAccept();
  }

  private spawnLostGold(): void {
    this.lostPile?.dispose();
    this.lostPile = null;
    const lg = this.progress.data.lostGold;
    if (lg && lg.map === this.mapName) this.lostPile = new GoldPile(this.world.scene, new THREE.Vector3(...lg.pos));
  }

  /** Drop everything that belongs to the current map. */
  private teardown(): void {
    if (!this.world) return;
    this.world.scene.traverse((o) => {
      // Character meshes are generated per rig; map GLTFs stay cached.
      const m = o as THREE.Mesh;
      if (m.isMesh && m.name === 'Merged') m.geometry.dispose();
    });
    for (const b of this.beacons) (b.material as THREE.Material).dispose();
    this.beacons = [];
    for (const i of this.icons.values()) i.dispose();
    this.icons.clear();
    this.bonfires = [];
    this.chests = [];
    this.pickups = [];
    this.lostPile = null;
    this.day.dispose();
    this.physics.world.free();
    this.dialogue = null;
    this.hud.hideDialogue();
  }

  private playerEvents() {
    return {
      hurt: (dmg: number, heavy: boolean) => this.onPlayerHurt(dmg, heavy),
      blocked: () => {
        this.sfx.clang();
        this.cam.addTrauma(0.2);
        this.time.hitstop(0.05);
        const p = this.player.pos;
        this.particles.burst(new THREE.Vector3(p.x, p.y + 1.2, p.z), 10, { color: 0xffd27a, speed: 4, up: 2, size: 0.05, life: 0.3, gravity: 6 });
      },
      death: () => this.onPlayerDeath(),
      respawn: () => void this.respawnAtCheckpoint(),
      swing: () => (this.player.weapon.clips.includes('Thrust') ? this.sfx.thrust() : this.sfx.swing(this.player.weapon.heavy)),
      knockdown: () => this.sfx.knockdown(),
      getUp: () => this.sfx.getUp(),
      shieldUp: () => this.sfx.shieldUp(),
      guardBreak: () => {
        this.sfx.guardBreak();
        this.cam.addTrauma(0.5);
      },
      horseJump: (winged: boolean) => this.sfx.horseJump(winged),
      noFlask: () => {
        this.sfx.denied();
        this.hud.showToast('No waterskins left. Rest at a bonfire to refill them.', 2);
      },
      jump: (double: boolean) => {
        if (double) this.sfx.doubleJump();
        else this.sfx.jump();
        if (double) {
          const p = this.player.pos;
          this.particles.burst(new THREE.Vector3(p.x, p.y, p.z), 12, { color: 0xf3eadc, speed: 2.2, up: -0.5, size: 0.08, life: 0.4, gravity: 1 });
        }
      },
      land: (fall: number) => {
        this.sfx.land();
        const p = this.player.pos;
        this.particles.burst(new THREE.Vector3(p.x, p.y + 0.05, p.z), fall > 2 ? 14 : 8, { color: 0xd9b58a, speed: 1.8, up: 0.8, size: 0.11, life: 0.45, gravity: 3 });
        if (fall > 2) this.cam.addTrauma(Math.min(0.4, fall * 0.06));
      },
      heal: () => {
        this.sfx.drink();
        this.floatAt(this.player.pos, 2, 'restored', 'heal');
        const p = this.player.pos;
        this.particles.burst(new THREE.Vector3(p.x, p.y + 1, p.z), 10, { color: 0x8ee08a, speed: 1, up: 1.5, size: 0.06, life: 0.8, gravity: -1 });
      },
      roll: () => {
        this.sfx.roll();
        const p = this.player.pos;
        this.particles.burst(new THREE.Vector3(p.x, p.y + 0.1, p.z), 10, { color: 0xd9b58a, speed: 1.6, up: 1.2, size: 0.12, life: 0.6, gravity: 2 });
      },
      exhausted: () => {
        this.hud.staminaDenied();
        this.sfx.exhausted();
      },
      strike: (o: THREE.Vector3, yaw: number, range: number, half: number, dmg: number) => [
        ...this.npcs.hitArc(o, yaw, range, half, dmg),
        ...this.enemies.hitArc(o, yaw, range, half, dmg),
      ],
      hit: (r: HitResult[]) => this.onPlayerHit(r),
      aim: (o: THREE.Vector3, yaw: number) => this.enemies.aimTarget(o, yaw, Math.max(3.4, this.player.weapon.range + 1), THREE.MathUtils.degToRad(55))?.pos ?? null,
    };
  }

  // --- economy & death ------------------------------------------------------------

  private onEnemyKilled(e: Enemy): void {
    const [lo, hi] = GOLD_DROP[e.kind] ?? [15, 25];
    const g = Math.round(lo + Math.random() * (hi - lo));
    this.progress.addGold(g);
    this.sfx.coin();
    this.floatAt(e.pos, e.headY - e.pos.y, `+${g} gold`, 'gold');
    this.particles.burst(e.pos.clone().setY(e.pos.y + 1), 8, { color: 0xffc94a, speed: 2, up: 2.5, size: 0.06, life: 0.7 });
    if (e.camp && this.enemies.campAlive(e.camp) === 0) {
      this.hud.showToast(`The ${e.camp.replace(/_/g, ' ')} camp is broken.`, 3);
      this.quests.campCleared(this.mapName, e.camp);
    }
  }

  private onPlayerDeath(): void {
    this.closeDialogue(false);
    this.sfx.death();
    this.sfx.diedDrone();
    this.time.slowmo(1.2, 0.35);
    const gold = this.progress.data.gold;
    if (gold > 0) {
      // Souls-style: the purse stays where you fell. Die again first and it's gone.
      const p = this.player.pos;
      this.progress.data.lostGold = { map: this.mapName, pos: [p.x, p.y, p.z], amount: gold };
      this.progress.data.gold = 0;
      this.progress.save();
      this.hud.showToast(`YOU DIED — ${gold} gold lies where you fell`, 4);
    } else {
      this.hud.showToast('YOU DIED', 3.5);
    }
  }

  private async respawnAtCheckpoint(): Promise<void> {
    const bf = this.progress.data.bonfire;
    const start = this.common.maps.start;
    const target = bf ? { map: bf.map, pos: bf.pos, yaw: bf.yaw } : null;
    if (target && target.map !== this.mapName) {
      await this.travel(target.map, { pos: target.pos, yaw: target.yaw, revive: true });
    } else if (!target && this.mapName !== start) {
      await this.travel(start, { pos: this.defaultSpawn(start), yaw: 0, revive: true });
    } else {
      const pos = target ? new THREE.Vector3(...target.pos) : new THREE.Vector3(...this.defaultSpawn(this.mapName));
      pos.y = this.physics.support(pos.x, pos.z, pos.y + 0.3);
      this.player.revive(pos, target?.yaw ?? 0);
      this.npcs.calmGuards();
      this.enemies.resetAll();
      this.spawnLostGold();
    }
    this.player.restore();
    this.hud.showToast(bf ? 'You wake by the bonfire. The raiders have regrouped.' : 'You wake at the edge of the market.', 3.5);
  }

  private defaultSpawn(map: string): Vec3 {
    if (map === this.mapName) {
      const s = this.world.level.spawns.find((x) => x.role === 'player' && !x.from);
      if (s) return s.pos;
    }
    return [1, 0, 44];
  }

  private restAt(b: Bonfire): void {
    const first = !b.lit;
    b.setLit(true);
    const d = this.progress.data;
    if (!d.litBonfires.includes(b.id)) d.litBonfires.push(b.id);
    d.bonfire = { map: this.mapName, id: b.id, pos: [b.pos.x + 1.2, b.pos.y, b.pos.z + 1.2], yaw: 0 };
    this.player.restore();
    this.enemies.resetAll();
    this.npcs.calmGuards();
    this.progress.save();
    if (first) this.sfx.ignite();
    else this.sfx.rest();
    this.particles.burst(b.pos.clone().setY(b.pos.y + 0.6), 24, { color: 0xffa040, speed: 2, up: 3, size: 0.07, life: 0.9, gravity: -1 });
    this.hud.showToast(first ? 'BONFIRE LIT' : 'Rested. Health and waterskins restored; enemies have returned.', 3);
  }

  private questReward(q: QuestDef): void {
    const r = q.reward;
    this.progress.addGold(r.gold);
    const bits = [`${r.gold} gold`];
    if (r.upgrade) {
      const u = this.progress.data.upgrades;
      u[r.upgrade] = (u[r.upgrade] ?? 0) + 1;
      if (r.upgrade === 'flask') this.progress.data.flasks++;
      bits.push(UPGRADES.find((x) => x.id === r.upgrade)?.name ?? r.upgrade);
    }
    if (r.weapon && !this.progress.data.weapons.includes(r.weapon)) {
      this.progress.data.weapons.push(r.weapon);
      bits.push(weapon(r.weapon).name);
    }
    this.progress.save();
    this.hud.showToast(`Quest complete: ${q.title} — ${bits.join(', ')}`, 4.5);
    this.sfx.questComplete();
  }

  /** Rising HUD text above a world position. */
  private floatAt(p: THREE.Vector3, up: number, text: string, cls: string): void {
    const v = this.projected.set(p.x, p.y + up, p.z).project(this.cam.camera);
    this.hud.floatText((v.x * 0.5 + 0.5) * window.innerWidth, (-v.y * 0.5 + 0.5) * window.innerHeight, text, cls);
  }

  // --- menus -----------------------------------------------------------------------

  private openMainMenu(tab: string): void {
    this.menu.open('Paused', this.mapTitle(this.mapName), this.mainTabs(), tab);
    this.cam.focus = true;
    this.minimap.setVisible(false);
    this.hud.setPrompt(null);
  }

  private rebuildPlayer(): void {
    const old = this.player.rebuild();
    old.removeFromParent();
    this.world.scene.add(this.player.rig.root);
  }

  private mainTabs(): MenuTab[] {
    const d = this.progress.data;
    const P = this.progress;
    const statLine = (id: string) => {
      const w = weapon(id);
      return `Damage ${w.dmg} · Reach ${w.range.toFixed(1)} m · Speed ${w.speed.toFixed(2)} · Stamina ${w.stamina}${w.heavy ? ' · Staggers' : ''}`;
    };
    const tabs: MenuTab[] = [
      {
        id: 'inventory',
        label: 'Inventory',
        rows: () => {
          const rows: MenuRow[] = [
            { label: 'Equipment', kind: 'header' },
            {
              label: 'Weapon',
              kind: 'choice',
              value: () => weapon(d.equipped).name,
              sub: () => statLine(d.equipped),
              adjust: (k) => {
                const owned = d.weapons;
                const i = owned.indexOf(d.equipped);
                d.equipped = owned[(i + k + owned.length) % owned.length];
                P.save();
                this.rebuildPlayer();
              },
            },
            { label: 'Shield', kind: 'info', value: () => (P.shield ? 'Round shield' : '—'), sub: () => (P.shield ? `Hold ${this.hud.key('block')} to block` : 'Sold by traders') },
            { label: 'Consumables', kind: 'header' },
            { label: 'Healing waterskins', kind: 'info', value: () => `${d.flasks} / ${P.maxFlasks}`, sub: () => `${this.hud.key('heal')} to drink · refilled at bonfires` },
            { label: 'Character', kind: 'header' },
            { label: 'Health', kind: 'info', value: () => `${Math.ceil(this.player.hp)} / ${P.maxHp}` },
            { label: 'Stamina', kind: 'info', value: () => `${P.maxStamina}` },
            { label: 'Gold', kind: 'info', value: () => `${d.gold}` },
            { label: 'Falcon feather (double jump)', kind: 'info', value: () => (P.doubleJump ? 'Yes' : 'No') },
          ];
          const keys = Object.entries(d.items).filter(([, n]) => n > 0);
          if (keys.length) {
            rows.push({ label: 'Key items', kind: 'header' });
            for (const [id, n] of keys) rows.push({ label: ITEM_NAMES[id] ?? id, kind: 'info', value: () => (n > 1 ? `×${n}` : '') });
          }
          if (d.lostGold) rows.push({ label: 'Lost gold', kind: 'info', value: () => `${d.lostGold!.amount}`, sub: () => `Where you fell in ${this.mapTitle(d.lostGold!.map)}` });
          return rows;
        },
      },
      { id: 'map', label: 'Map', wide: true, render: (el) => this.renderMapTab(el) },
      {
        id: 'quests',
        label: 'Quests',
        rows: () => {
          const rows: MenuRow[] = [];
          const active = this.quests.active();
          rows.push({ label: 'Active', kind: 'header' });
          if (!active.length) rows.push({ label: 'No active quests', kind: 'info', sub: () => `Look for people with a ! over their head.` });
          for (const a of active) {
            rows.push({
              label: (d.trackedQuest === a.q.id ? '◆ ' : '') + a.q.title,
              kind: 'button',
              sub: () => this.quests.lineFor(a.q.id) ?? '',
              activate: () => {
                d.trackedQuest = a.q.id;
                P.save();
              },
            });
          }
          const done = QUESTS.filter((q) => this.quests.state(q.id)?.state === 'done');
          if (done.length) {
            rows.push({ label: 'Completed', kind: 'header' });
            for (const q of done) rows.push({ label: q.title, kind: 'info', value: () => '✓' });
          }
          return rows;
        },
      },
      {
        id: 'travel',
        label: 'Travel',
        rows: () => {
          const rows: MenuRow[] = [{ label: 'Bonfires', kind: 'header' }];
          if (!d.litBonfires.length) rows.push({ label: 'No bonfires lit yet', kind: 'info', sub: () => 'Rest at a bonfire to travel back to it.' });
          for (const id of d.litBonfires) {
            const [map, idx] = id.split(':');
            const name = /^\d+$/.test(idx) ? `bonfire ${Number(idx) + 1}` : idx.replace(/^[a-z]+_/, '').replace(/_/g, ' ');
            rows.push({
              label: `${this.mapTitle(map)} — ${name}`,
              kind: 'button',
              activate: () => void this.travelToBonfire(id),
              disabled: () => this.player.inCombat,
              sub: () => (this.player.inCombat ? 'Cannot travel while enemies are near' : ''),
            });
          }
          rows.push({ label: 'Regions (quick travel)', kind: 'header' });
          for (const m of this.common.maps.maps) {
            rows.push({
              label: m.title,
              kind: 'button',
              value: () => (m.name === this.mapName ? 'here' : ''),
              activate: () => void this.quickTravel(m.name),
            });
          }
          return rows;
        },
      },
      {
        id: 'settings',
        label: 'Settings',
        rows: () => [
          {
            label: 'Time of day',
            kind: 'slider',
            value: () => timeLabel(this.day.hours),
            adjust: (k) => this.day.set(this.day.hours + k * 0.5),
            slider: { min: 0, max: 23.99, step: 0.05, get: () => this.day.hours, set: (v) => this.day.set(v) },
          },
          {
            label: 'Time passes',
            kind: 'choice',
            value: () => FLOW[this.flow].label,
            adjust: (k) => {
              this.flow = (this.flow + k + FLOW.length) % FLOW.length;
              this.day.flowing = FLOW[this.flow].on;
              this.day.speed = FLOW[this.flow].speed;
            },
          },
          { label: 'Character', kind: 'choice', value: () => PLAYER_LOOKS[this.lookIndex].name, adjust: (k) => this.applyLook(this.lookIndex + k) },
          {
            label: 'Robe colour',
            kind: 'choice',
            value: () => {
              const c = ROBES[this.robe] ?? PLAYER_LOOKS[this.lookIndex].colours.P_Robe;
              return `<span class="swatch" style="background:#${c.toString(16).padStart(6, '0')}"></span>`;
            },
            adjust: (k) => {
              this.robe = (this.robe + k + ROBES.length) % ROBES.length;
              this.applyLook(this.lookIndex);
            },
          },
          { label: 'Camera', kind: 'choice', value: () => (this.cam.usePerspective ? 'Perspective' : 'Orthographic'), adjust: () => (this.cam.usePerspective = !this.cam.usePerspective) },
          {
            label: 'Minimap',
            kind: 'choice',
            value: () => ['Small', 'Large', 'Off'][this.minimap.mode],
            adjust: (k) => {
              for (let i = 0; i < (k > 0 ? 1 : 2); i++) this.minimap.cycle();
              this.minimap.setVisible(false);
            },
          },
          {
            label: 'Volume',
            kind: 'slider',
            value: () => `${Math.round(this.sfx.volume * 100)}%`,
            adjust: (k) => this.sfx.setVolume(Math.min(1, Math.max(0, this.sfx.volume + k * 0.1))),
            slider: { min: 0, max: 1, step: 0.01, get: () => this.sfx.volume, set: (v) => this.sfx.setVolume(v) },
          },
          {
            label: 'Music',
            kind: 'slider',
            value: () => `${Math.round(this.sfx.musicVolume * 100)}%`,
            sub: () => (this.music.nowPlaying ? `Now playing: ${this.music.nowPlaying}` : ''),
            adjust: (k) => this.sfx.setMusicVolume(Math.min(1, Math.max(0, this.sfx.musicVolume + k * 0.1))),
            slider: { min: 0, max: 1, step: 0.01, get: () => this.sfx.musicVolume, set: (v) => this.sfx.setMusicVolume(v) },
          },
          { label: 'Controls', kind: 'header' },
          ...this.controlRows(),
          ...(this.music.credits.length ? [{ label: 'Credits', kind: 'header' as const }, ...this.music.credits.map((c) => ({ label: c, kind: 'info' as const }))] : []),
        ],
      },
      {
        id: 'debug',
        label: 'Debug',
        rows: () => [
          { label: 'Spawn horse', kind: 'button', activate: () => this.debugSpawnHorse(false) },
          { label: 'Spawn winged horse', kind: 'button', sub: () => 'Placeholder until the winged model arrives: huge jump, double jump, glide', activate: () => this.debugSpawnHorse(true) },
          { label: '+500 gold', kind: 'button', activate: () => this.progress.addGold(500) },
          { label: 'Heal & refill', kind: 'button', activate: () => this.player.restore() },
          { label: 'God mode', kind: 'choice', value: () => (this.player.god ? 'On' : 'Off'), adjust: () => (this.player.god = !this.player.god), activate: () => (this.player.god = !this.player.god) },
          {
            label: 'Unlock everything',
            kind: 'button',
            sub: () => 'All weapons, shield, double jump',
            activate: () => {
              d.weapons = WEAPONS.map((w) => w.id);
              d.upgrades.shield = 1;
              d.upgrades.double_jump = 1;
              P.save();
              this.rebuildPlayer();
            },
          },
          { label: 'Kill nearby enemies', kind: 'button', activate: () => this.debugKillNearby() },
          { label: 'Reset enemies', kind: 'button', activate: () => this.enemies.resetAll() },
          { label: 'Show colliders', kind: 'choice', value: () => (this.debugObj?.visible ? 'On' : 'Off'), adjust: () => this.debugObj && (this.debugObj.visible = !this.debugObj.visible) },
          { label: 'Teleport to next exit', kind: 'button', activate: () => this.debugNextExit() },
          {
            label: 'New game (erase save)',
            kind: 'button',
            activate: () => {
              this.progress.reset();
              location.reload();
            },
          },
        ],
      },
    ];
    return tabs;
  }

  private controlRows(): MenuRow[] {
    const list: [Action, string][] = [
      ['move', 'Move'],
      ['run', 'Sprint (free out of combat)'],
      ['attack', 'Attack (press again to chain)'],
      ['block', 'Block with a shield (hold)'],
      ['dodge', 'Dodge roll'],
      ['jump', 'Jump (hold for height)'],
      ['heal', 'Drink a healing waterskin'],
      ['talk', 'Talk / use / mount'],
      ['camera', 'Rotate camera'],
      ['zoom', 'Zoom'],
      ['inventory', 'Menu'],
      ['map', 'Map'],
    ];
    return list.map(([a, l]) => ({ label: l, kind: 'info' as const, value: () => this.hud.key(a) }));
  }

  /** Menu quick travel: the region's default arrival point. */
  private async quickTravel(map: string): Promise<void> {
    if (this.travelling) return;
    this.closeDialogue(false);
    this.menu.close();
    await this.enterMap(map, null);
  }

  private async travelToBonfire(id: string): Promise<void> {
    const [map] = id.split(':');
    const pos = (b: Bonfire): Vec3 => [b.pos.x + 1.2, b.pos.y, b.pos.z + 1.2];
    if (map === this.mapName) {
      const b = this.bonfires.find((x) => x.id === id);
      if (b) {
        this.menu.close();
        const p = new THREE.Vector3(...pos(b));
        this.player.mover.teleport(p);
        this.cam.snap(p);
      }
      return;
    }
    await this.travel(map);
    const b = this.bonfires.find((x) => x.id === id);
    if (b) {
      const p = new THREE.Vector3(...pos(b));
      this.player.mover.teleport(p);
      this.cam.snap(p);
    }
  }

  private renderMapTab(el: HTMLElement): void {
    let wrap = el.querySelector('.map-wrap') as HTMLDivElement | null;
    if (!wrap) {
      el.innerHTML = '<div class="map-wrap"><canvas width="1120" height="1120"></canvas><div class="legend"></div></div>';
      wrap = el.querySelector('.map-wrap') as HTMLDivElement;
    }
    const canvas = wrap.querySelector('canvas') as HTMLCanvasElement;
    this.minimap.drawFull(canvas, this.player.pos.x, this.player.pos.z, this.player.yaw, this.mapMarkers(true));
    const legend = wrap.querySelector('.legend') as HTMLDivElement;
    const kinds = Object.keys(BADGE) as BadgeKind[];
    legend.innerHTML =
      `<div class="legend-title">${this.mapTitle(this.mapName)}</div>` +
      `<div class="legend-row"><span class="legend-badge" style="background:#fff">▲</span>You</div>` +
      kinds.map((k) => `<div class="legend-row"><span class="legend-badge" style="background:${BADGE[k].fill}">${BADGE[k].glyph}</span>${BADGE[k].name}</div>`).join('') +
      [
        ['#ff3a2a', 'Raider'],
        ['#6ea0ff', 'Guard'],
        ['#f3e6c8', 'Townsfolk'],
        ['#c58a4a', 'Horse'],
        ['#d8b483', 'Camel'],
      ]
        .map(([c, n]) => `<div class="legend-row"><span class="legend-dot" style="background:${c}"></span>${n}</div>`)
        .join('') +
      `<div class="legend-title" style="margin-top:12px">Quest</div><div class="legend-row">${this.quests.trackerText() ?? 'None tracked'}</div>`;
  }

  private openShop(npc: Npc): void {
    const d = this.progress.data;
    const P = this.progress;
    const buy = (price: number, fn: () => void) => {
      if (d.gold < price) {
        this.hud.showToast('Not enough gold.', 1.8);
        this.sfx.denied();
        return;
      }
      d.gold -= price;
      fn();
      P.save();
      this.sfx.purchase();
      this.hud.showToast('Purchased.', 1.5);
    };
    const tabs: MenuTab[] = [
      {
        id: 'weapons',
        label: 'Weapons',
        rows: () => [
          { label: `Your gold: ${d.gold}`, kind: 'info' },
          ...WEAPONS.filter((w) => w.price > 0).map(
            (w): MenuRow => ({
              label: w.name,
              kind: 'button',
              sub: () => `${w.desc} — Damage ${w.dmg} · Reach ${w.range.toFixed(1)} m · Speed ${w.speed.toFixed(2)} · Stamina ${w.stamina}`,
              value: () => (d.weapons.includes(w.id) ? (d.equipped === w.id ? 'Equipped' : 'Owned · equip') : `${w.price} gold`),
              activate: () => {
                if (!d.weapons.includes(w.id)) buy(w.price, () => d.weapons.push(w.id));
                if (d.weapons.includes(w.id)) {
                  if (d.equipped !== w.id) this.sfx.shieldUp();
                  d.equipped = w.id;
                  P.save();
                  this.rebuildPlayer();
                }
              },
            }),
          ),
        ],
      },
      {
        id: 'upgrades',
        label: 'Upgrades',
        rows: () => [
          { label: `Your gold: ${d.gold}`, kind: 'info' },
          ...UPGRADES.map((u): MenuRow => {
            const owned = d.upgrades[u.id] ?? 0;
            const maxed = owned >= u.repeat;
            const price = upgradePrice(u, owned);
            return {
              label: u.repeat > 1 ? `${u.name} (${owned}/${u.repeat})` : u.name,
              kind: 'button',
              sub: () => u.desc,
              value: () => (maxed ? 'Owned' : `${price} gold`),
              disabled: () => maxed,
              activate: () =>
                buy(price, () => {
                  d.upgrades[u.id] = owned + 1;
                  if (u.id === 'flask') d.flasks++;
                  if (u.id === 'shield') this.rebuildPlayer();
                  if (u.id === 'vitality') this.player.hp += 20;
                }),
            };
          }),
        ],
      },
    ];
    this.menu.open(`${npc.name} the Trader`, '“Look, touch, buy. Haggling costs extra.”', tabs, 'weapons');
    this.cam.focus = false;
    this.minimap.setVisible(false);
    this.hud.setPrompt(null);
  }

  private applyLook(i: number): void {
    this.lookIndex = ((i % PLAYER_LOOKS.length) + PLAYER_LOOKS.length) % PLAYER_LOOKS.length;
    const old = this.player.setLook(this.lookIndex, ROBES[this.robe] ?? undefined);
    old.removeFromParent();
    this.world.scene.add(this.player.rig.root);
  }

  private debugSpawnHorse(winged: boolean): void {
    const p = this.player.pos;
    const a = this.player.yaw;
    const x = p.x + Math.sin(a) * 3;
    const z = p.z + Math.cos(a) * 3;
    this.addHorse({ role: 'horse', pos: [x, p.y, z], yaw: a + Math.PI / 2 }, winged, Math.random);
    this.hud.showToast(winged ? 'A winged horse appears.' : 'A horse appears.', 2);
  }

  private debugKillNearby(): void {
    for (const e of this.enemies.list) {
      if (!e.dead && Math.hypot(e.pos.x - this.player.pos.x, e.pos.z - this.player.pos.z) < 30) e.damage(9999, this.player.pos);
    }
  }

  private debugNextExit(): void {
    if (!this.exits.length) return;
    const p = this.player.pos;
    const sorted = [...this.exits].sort((a, b) => Math.hypot(a.pos[0] - p.x, a.pos[2] - p.z) - Math.hypot(b.pos[0] - p.x, b.pos[2] - p.z));
    const e = sorted.find((x) => Math.hypot(x.pos[0] - p.x, x.pos[2] - p.z) > x.radius + 1) ?? sorted[0];
    const t = new THREE.Vector3(e.pos[0], 0, e.pos[2] - 3);
    t.y = this.physics.support(t.x, t.z, 100);
    this.player.mover.teleport(t);
    this.cam.snap(t);
    this.menu.close();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.cam.resize(w, h);
  }

  // --- game feel ---------------------------------------------------------------

  private onPlayerHit(results: HitResult[]): void {
    if (this.dialogue) this.closeDialogue(false);
    let killed = false;
    const landed = results.filter((r) => !r.blocked);
    for (const r of results) {
      if (!r.blocked) continue;
      this.particles.burst(r.pos, 10, { color: 0xffd27a, speed: 4, up: 2, size: 0.05, life: 0.3, gravity: 6 });
    }
    if (landed.length === 0) {
      // Every blow hit a shield: small recoil, no blood.
      this.time.hitstop(0.06);
      this.cam.addTrauma(0.2);
      return;
    }
    for (const r of landed) {
      killed ||= r.killed;
      this.particles.burst(r.pos, r.killed ? 16 : 9, { color: 0x7a1a12, speed: 3.2, up: 2.6, size: 0.08, life: 0.55 });
      this.particles.burst(r.pos.clone().setY(r.pos.y - 1.0), 6, { color: 0xd9b58a, speed: 1.8, up: 1, size: 0.12, life: 0.5, gravity: 3 });
    }
    const heavy = !!this.player.weapon.heavy;
    this.sfx.hit(killed || heavy);
    this.time.hitstop(killed ? 0.13 : heavy ? 0.11 : 0.075);
    this.cam.addTrauma(killed ? 0.45 : heavy ? 0.4 : 0.28);
    if (killed) this.time.slowmo(0.35, 0.35);
  }

  private onPlayerHurt(dmg: number, heavy: boolean): void {
    this.sfx.hurt();
    this.hud.hurtFlash(heavy ? 1 : 0.6);
    this.cam.addTrauma(heavy ? 0.7 : 0.4);
    this.time.hitstop(heavy ? 0.12 : 0.07, 0.03);
    const p = this.player.pos;
    this.particles.burst(new THREE.Vector3(p.x, p.y + 1.2, p.z), 6 + Math.round(dmg / 4), { color: 0x7a1a12, speed: 2.6, up: 2.2, size: 0.07, life: 0.5 });
  }

  // --- dialogue ----------------------------------------------------------------

  private npcRef(n: Npc) {
    return { map: this.mapName, role: n.refRole, index: n.refIndex, id: n.refId || undefined };
  }

  private openDialogue(npc: Npc): void {
    const quest = this.quests.talk(this.npcRef(npc));
    if (!quest && npc.shop) {
      this.openShop(npc);
      return;
    }
    const lines = quest ? quest.lines : npc.startTalk();
    if (quest) npc.startTalk();
    this.dialogue = { npc, lines: quest ? lines : withFiller(lines, npc.name), i: 0, onDone: quest?.onDone, voice: voiceOf(npc) };
    this.player.talking = true;
    // Turn to face the stranger.
    this.player.yawTarget = Math.atan2(npc.pos.x - this.player.pos.x, npc.pos.z - this.player.pos.z);
    this.player.moveDir.set(Math.sin(this.player.yawTarget), 0, Math.cos(this.player.yawTarget));
    this.showLine();
  }

  private showLine(): void {
    const d = this.dialogue!;
    this.hud.showDialogue(`${d.npc.name} — ${d.npc.title}`, d.lines[d.i], d.i === d.lines.length - 1);
  }

  /** `finished`: the last line was read (quest effects apply). */
  private closeDialogue(finished: boolean): void {
    if (!this.dialogue) return;
    const d = this.dialogue;
    d.npc.endTalk();
    this.dialogue = null;
    this.player.talking = false;
    this.input.cancelHolds();
    this.hud.hideDialogue();
    if (finished && d.onDone) {
      d.onDone();
      this.spawnPickups();
      // A shopkeeper with a quest still trades after the quest talk.
      if (d.npc.shop && !this.quests.talk(this.npcRef(d.npc))) this.openShop(d.npc);
    }
  }

  // --- frame -----------------------------------------------------------------------

  private frame(): void {
    if (this.travelling || !this.world) {
      this.last = performance.now();
      return;
    }
    const now = performance.now();
    const realDt = Math.min((now - this.last) / 1000, 1 / 20);
    this.fpsAcc += (now - this.last) / 1000;
    this.last = now;
    this.fpsFrames++;
    if (this.fpsAcc > 0.5) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
    this.frameNo++;

    const f = this.input.read(realDt);
    const deviceChanged = f.device !== this.hud.device;
    this.hud.setDevice(f.device);
    if (deviceChanged && this.dialogue) this.showLine();

    if (this.menu.isOpen) {
      this.menu.update(f);
      if (this.menu.isOpen && this.menu.tabId === 'map' && this.frameNo % 15 === 0) this.menu.refresh();
    } else this.handleInput(f);
    const paused = this.menu.isOpen;
    const dt = paused ? 0 : this.time.apply(realDt);

    const p = this.player;
    if (!paused) {
      p.inCombat = this.inCombat();
      p.update(dt, f, this.cam);
      this.npcs.update(dt, p, p.pos);
      this.enemies.update(dt, p);
      for (const h of this.horses) {
        if (h === p.horse) continue;
        h.idle(dt);
        h.update(dt);
      }
      // Camels are scenery: animate the near ones every frame, far ones rarely.
      for (const c of this.camels) {
        const d = c.rig.root.position.distanceTo(p.pos);
        if (d < 50 || this.frameNo % 6 === 0) c.update(d < 50 ? dt : dt * 6);
      }
      this.particles.update(dt);
      this.glints.update(dt);
      for (const b of this.bonfires) b.update(dt);
      for (const c of this.chests) c.update(dt);
      for (const k of this.pickups) k.update(dt);
      this.lostPile?.update(dt);
      this.checkLostGold();
      this.physics.step();
    }
    this.day.update(dt, this.cam.camera.position);
    if (!paused) this.updateSounds(dt);
    this.music.update(realDt);
    this.updateIcons(realDt);
    this.progress.update(realDt);

    const focus = p.pos.clone();
    focus.y += p.horse ? 1.6 : 1.0;
    this.cam.update(realDt, focus);
    this.world.update(realDt, p.pos, this.cam.zoom);
    this.world.setFogOffset(this.cam.targetDepth);

    this.hud.setVitals(p.hp, p.maxHp, p.stamina, p.maxStamina, p.isExhausted, realDt);
    this.hud.setPurse(this.progress.data.gold, this.progress.data.flasks, this.progress.maxFlasks);
    this.hud.setTracker(paused ? null : this.quests.trackerText());
    this.updateEnemyBars(paused);
    this.updateHints();
    if (this.frameNo % 2 === 0) this.drawMinimap();
    this.hud.update(realDt, this.fps);
    this.world.setNightGlow(this.day.grade);
    this.updateCutout();
    for (const b of this.beacons) (b.material as THREE.ShaderMaterial).uniforms.opacity.value = 0.26 + 0.08 * Math.sin(now / 400);
    this.renderer.render(this.world.scene, this.cam.camera);
    this.day.renderGrade(this.renderer);
  }

  /** Stereo position of a world point relative to the camera, -1 … 1. */
  private pan(x: number, z: number): number {
    const p = this.player.pos;
    const r = this.cam.right;
    return Math.max(-1, Math.min(1, ((x - p.x) * r.x + (z - p.z) * r.z) / 10));
  }

  /** Footsteps, hooves, wings, animals, raider shouts, ambience and music mood. */
  private updateSounds(dt: number): void {
    const p = this.player;
    const pos = p.pos;
    const sfx = this.sfx;
    const onBox = (x: number, z: number, y: number) => y > this.world.ground(x, z) + 0.06;

    // Generic stride tracker: returns true when a foot (or hoof) lands.
    const stride = (key: object, x: number, z: number, len: number): boolean => {
      let s = this.steps.get(key);
      if (!s) {
        s = { x, z, acc: 0, phase: 0 };
        this.steps.set(key, s);
      }
      const d = Math.hypot(x - s.x, z - s.z);
      s.x = x;
      s.z = z;
      if (d > 3) return false; // teleported
      s.acc += d;
      if (s.acc >= len) {
        s.acc -= len;
        return true;
      }
      return false;
    };

    // The player.
    if (!p.horse && !p.dead && !p.jumping && !p.rolling) {
      const run = p.animSpeed > 3;
      if (stride(p, pos.x, pos.z, run ? 1.35 : 0.72)) sfx.step(onBox(pos.x, pos.z, pos.y) ? 'stone' : 'sand', run);
    }
    // People and raiders nearby (quieter, panned).
    const walkers: { key: object; x: number; z: number; y: number; run: boolean }[] = [];
    for (const n of this.npcs.npcs) if (!n.dead && (n.state === 'walk' || n.state === 'flee' || n.state === 'chase' || n.state === 'return')) walkers.push({ key: n, x: n.pos.x, z: n.pos.z, y: n.pos.y, run: n.state === 'flee' || n.state === 'chase' });
    for (const e of this.enemies.list) if (!e.dead) walkers.push({ key: e, x: e.pos.x, z: e.pos.z, y: e.pos.y, run: e.state === 'approach' });
    for (const w of walkers) {
      const d = Math.hypot(w.x - pos.x, w.z - pos.z);
      if (d > 10) {
        this.steps.delete(w.key);
        continue;
      }
      if (stride(w.key, w.x, w.z, w.run ? 1.3 : 0.7)) sfx.step(onBox(w.x, w.z, w.y) ? 'stone' : 'sand', w.run, this.pan(w.x, w.z), 0.55 * (1 - d / 10));
    }
    // Horses: hooves; the winged horse beats its wings in time with Flap.
    for (const h of this.horses) {
      const d = Math.hypot(h.pos.x - pos.x, h.pos.z - pos.z);
      if (d > 22) continue;
      const g = h === p.horse ? 1 : 0.6 * (1 - d / 22);
      const pan = h === p.horse ? 0 : this.pan(h.pos.x, h.pos.z);
      if (!h.jumping && h.speed > 0.4 && stride(h, h.pos.x, h.pos.z, h.speed > 5 ? 1.15 : 0.6)) sfx.hoof(h.speed > 5, pan, g);
      const a = h.rig.anim;
      if (a.base === 'Flap') {
        const s = this.steps.get(h.rig) ?? { x: 0, z: 0, acc: 0, phase: 0 };
        const ph = (a.baseTime() % 0.5) / 0.5;
        // Downstroke peaks a quarter into the beat.
        if (s.phase < 0.25 && ph >= 0.25) sfx.wing(pan, g);
        s.phase = ph;
        this.steps.set(h.rig, s);
      }
    }
    // Animals now and then.
    this.nextAnimal -= dt;
    if (this.nextAnimal <= 0) {
      this.nextAnimal = 5 + Math.random() * 10;
      const near = [...this.camels.map((c) => ({ c, pos: c.rig.root.position })), ...this.horses.filter((h) => h !== p.horse).map((h) => ({ c: h, pos: h.pos }))].filter((x) => Math.hypot(x.pos.x - pos.x, x.pos.z - pos.z) < 18);
      const pick = near[Math.floor(Math.random() * near.length)];
      if (pick) {
        const d = Math.hypot(pick.pos.x - pos.x, pick.pos.z - pos.z);
        const g = 1 - d / 18;
        if (pick.c instanceof Camel) sfx.camelGroan(this.pan(pick.pos.x, pick.pos.z), g);
        else sfx.snort(this.pan(pick.pos.x, pick.pos.z), g);
      }
    }
    // A raider spotting you shouts.
    for (const e of this.enemies.list) {
      const prev = this.prevEnemyState.get(e);
      if (e.state === 'alert' && prev !== 'alert') {
        const d = Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z);
        if (d < 30) sfx.alert(this.pan(e.pos.x, e.pos.z), Math.max(0.3, 1 - d / 30));
      }
      this.prevEnemyState.set(e, e.state);
    }

    // Ambience from the surroundings.
    let crowd = 0;
    for (const n of this.npcs.npcs) if (!n.dead && Math.hypot(n.pos.x - pos.x, n.pos.z - pos.z) < 14) crowd++;
    let water = 0;
    let trees = 0;
    for (const c of this.world.level.colliders) {
      const d = Math.hypot(c.pos[0] - pos.x, c.pos[2] - pos.z) - Math.max(c.half[0], c.half[2]);
      if (c.tag === 'water' && d < 14) water = Math.max(water, 1 - Math.max(0, d) / 14);
      else if ((c.tag === 'palm' || c.tag === 'tree') && d < 20) trees++;
    }
    let fire = 0;
    let firePan = 0;
    const fires = [...this.bonfires.filter((b) => b.lit).map((b) => b.pos), ...this.world.level.lights.filter((l) => l.type === 'fire').map((l) => ({ x: l.pos[0], z: l.pos[2] }))];
    for (const f of fires) {
      const d = Math.hypot(f.x - pos.x, f.z - pos.z);
      const k = 1 - d / 10;
      if (k > fire) {
        fire = k;
        firePan = this.pan(f.x, f.z);
      }
    }
    const height = Math.max(0, pos.y - this.world.ground(pos.x, pos.z));
    this.ambience.update(dt, {
      wind: Math.min(1, 0.25 + (crowd === 0 ? 0.3 : 0) + height / 12 + (this.mapName === 'cliffs' ? 0.3 : 0)),
      crowd,
      water,
      fire,
      firePan,
      trees: Math.min(1, trees / 8),
      night: this.day.grade,
    });

    // Music mood.
    let mood: Mood = 'explore';
    const fighting = this.enemies.list.some((e) => e.engaged && !e.dead && Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) < 30) || this.npcs.npcs.some((n) => n.hostile);
    if (fighting) mood = 'combat';
    else if (this.mapName === 'raider_fort') mood = 'stronghold';
    else if (this.day.grade > 0.6) mood = 'night';
    else if (['oasis', 'hegra', 'caravanserai', 'rooftops'].includes(this.mapName) && crowd > 3) mood = 'town';
    this.music.want(mood);
  }

  /** Enemies engaged nearby, or a living camp within reach: stamina matters. */
  private inCombat(): boolean {
    const p = this.player.pos;
    for (const e of this.enemies.list) {
      if (e.dead) continue;
      const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z);
      if (d < 22 || (e.engaged && d < 35)) return true;
    }
    for (const n of this.npcs.npcs) if (n.hostile && Math.hypot(n.pos.x - p.x, n.pos.z - p.z) < 30) return true;
    return false;
  }

  private checkLostGold(): void {
    const lg = this.progress.data.lostGold;
    if (!lg || !this.lostPile || this.player.dead) return;
    const p = this.player.pos;
    if (Math.hypot(lg.pos[0] - p.x, lg.pos[2] - p.z) < 1.4 && Math.abs(lg.pos[1] - p.y) < 2.5) {
      this.progress.data.lostGold = null;
      this.progress.addGold(lg.amount);
      this.lostPile.dispose();
      this.lostPile = null;
      this.floatAt(p, 2.2, `+${lg.amount} gold recovered`, 'gold');
      this.hud.showToast('You recovered your gold.', 2.5);
      this.sfx.coin();
    }
  }

  /** Quest / shop icons over NPC heads. */
  private updateIcons(dt: number): void {
    for (const n of this.npcs.npcs) {
      let kind: IconKind | null = null;
      if (!n.dead) {
        kind = this.quests.iconFor(this.npcRef(n));
        if (!kind && n.shop) kind = 'shop';
      }
      let icon = this.icons.get(n);
      if (!kind) {
        if (icon) {
          icon.dispose();
          this.icons.delete(n);
        }
        continue;
      }
      if (!icon) {
        icon = new Icon(this.world.scene, kind);
        this.icons.set(n, icon);
      }
      icon.setKind(kind);
      icon.place(n.pos.x, n.pos.y + 2.75, n.pos.z, dt);
    }
  }

  /** Feed the see-through shader: the player's screen position and depth. */
  private updateCutout(): void {
    const cam = this.cam.camera as THREE.OrthographicCamera | THREE.PerspectiveCamera;
    const p = this.player.pos;
    const head = this.projected.set(p.x, p.y + 1.0, p.z);
    cam.updateMatrixWorld();
    const view = head.clone().applyMatrix4(cam.matrixWorldInverse);
    head.project(cam);
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    cutout.uResolution.value.copy(size);
    cutout.uCutAspect.value = size.x / size.y;
    cutout.uCutCenter.value.set(head.x, head.y);
    cutout.uCutDepth.value = -view.z;
    cutout.uCamWorld.value.copy(cam.matrixWorld);
    cutout.uCutFloorY.value = p.y + 0.5;
    const ortho = (cam as THREE.OrthographicCamera).isOrthographicCamera;
    const halfH = ortho ? ((cam as THREE.OrthographicCamera).top - (cam as THREE.OrthographicCamera).bottom) / 2 : -view.z * Math.tan(THREE.MathUtils.degToRad((cam as THREE.PerspectiveCamera).fov / 2));
    cutout.uCutRadius.value = this.player.dead || (this.menu.isOpen && this.cam.focus) ? 0 : CUT_RADIUS / halfH;
  }

  private nearestExit(): Exit | null {
    const p = this.player.pos;
    for (const e of this.exits) if (Math.hypot(e.pos[0] - p.x, e.pos[2] - p.z) < e.radius) return e;
    return null;
  }

  private near<T extends { pos: THREE.Vector3 }>(list: T[], r: number): T | null {
    const p = this.player.pos;
    let best: T | null = null;
    let bd = r;
    for (const x of list) {
      const d = Math.hypot(x.pos.x - p.x, x.pos.z - p.z);
      if (d < bd && Math.abs(x.pos.y - p.y) < 2.5) {
        bd = d;
        best = x;
      }
    }
    return best;
  }

  private handleInput(f: Frame): void {
    if (f.zoom) this.cam.zoomBy(f.zoom);
    if (f.rotate) this.cam.rotateBy(f.rotate);

    const p = this.player;
    const k = (a: Action) => this.hud.key(a);
    if (this.dialogue) {
      const d = this.dialogue;
      const far = Math.hypot(d.npc.pos.x - p.pos.x, d.npc.pos.z - p.pos.z) > TALK_RANGE + 3;
      if (f.cancel || far || d.npc.dead || p.dead) {
        this.closeDialogue(false);
      } else if ((f.interact || f.confirm) && this.hud.typing) {
        this.hud.finishTyping();
      } else if (f.interact || f.confirm) {
        d.i++;
        if (d.i >= d.lines.length) this.closeDialogue(true);
        else this.showLine();
      } else if (f.attack || f.dodge || Math.hypot(f.moveX, f.moveY) > 0.5) {
        this.closeDialogue(false);
      }
      f.interact = false;
      f.jump = false;
      f.pause = false;
      f.attack = false;
      f.dodge = false;
      f.heal = false;
      this.hud.setPrompt(null);
      return;
    }
    if (f.pause || f.inventory) {
      this.openMainMenu('inventory');
      return;
    }
    if (f.map) {
      this.openMainMenu('map');
      return;
    }
    if (p.dead) {
      this.hud.setPrompt(null);
      return;
    }
    const horse = p.horse ? null : this.nearestHorse();
    const npc = p.horse ? null : this.npcs.nearestTalkable(p.pos, TALK_RANGE);
    const pickup = p.horse || npc ? null : this.near(this.pickups, USE_RANGE);
    const fire = p.horse || npc || pickup ? null : this.near(this.bonfires, USE_RANGE);
    const chest = p.horse || npc || pickup || fire ? null : this.near(this.chests.filter((c) => !c.opened), USE_RANGE);
    const exit = npc || pickup || fire || chest ? null : this.nearestExit();
    let prompt: string | null = null;
    if (npc) {
      const icon = this.quests.iconFor(this.npcRef(npc));
      const verb = icon === 'turnin' ? 'Hand in quest to' : icon === 'quest' ? 'Talk to' : npc.shop ? 'Trade with' : 'Talk to';
      prompt = `${k('talk')} ${verb} ${npc.name} <i>(${npc.title.toLowerCase()})</i>`;
    } else if (pickup) prompt = `${k('talk')} Take ${pickup.label}`;
    else if (fire) prompt = `${k('talk')} ${fire.lit ? 'Rest at the bonfire' : 'Kindle the bonfire'}`;
    else if (chest) prompt = `${k('talk')} Open the chest`;
    else if (exit) prompt = `${k('talk')} ${exit.label}`;
    else if (p.horse) prompt = `${k('mount')} Dismount`;
    else if (horse) prompt = `${k('mount')} Mount ${horse.winged ? 'the winged horse' : 'horse'}`;
    this.hud.setPrompt(prompt);
    // One interact button for everything in reach.
    if (f.interact && !p.attacking && !p.rolling && !p.jumping) {
      if (npc) {
        this.openDialogue(npc);
        f.attack = false;
      } else if (pickup) {
        pickup.dispose();
        this.pickups = this.pickups.filter((x) => x !== pickup);
        if (pickup.item.startsWith('free:')) {
          const id = pickup.item.slice(5);
          const free = FREE_PICKUPS[id];
          this.progress.data.taken.push(id);
          if (free.upgrade) this.progress.data.upgrades[free.upgrade] = 1;
          this.progress.save();
          this.hud.showToast(free.message, 4.5);
        } else {
          this.quests.picked(pickup.item);
          this.hud.showToast(`Took: ${pickup.label}`, 2.5);
        }
        this.sfx.pickup();
      } else if (fire) {
        this.restAt(fire);
      } else if (chest) {
        this.openChest(chest);
      } else if (exit) {
        void this.travel(exit.to);
      } else if (p.horse) {
        p.dismount(this.world);
        this.sfx.dismount();
      } else if (horse) {
        p.mount(horse);
        this.sfx.mount();
      }
    }
  }

  private updateHints(): void {
    let items: [Action, string][];
    const P = this.progress;
    if (this.menu.isOpen) items = [];
    else if (this.dialogue) items = [['next', 'Continue'], ['leave', 'Leave']];
    else if (this.player.horse)
      items = [['move', 'Ride'], ['run', 'Gallop'], ['attack', 'Attack'], ['jump', 'Jump'], ['mount', 'Dismount'], ['map', 'Map'], ['pause', 'Menu']];
    else {
      items = [['move', 'Move'], ['run', 'Sprint'], ['attack', 'Attack'], ['dodge', 'Roll'], ['jump', P.doubleJump ? 'Jump ×2' : 'Jump'], ['camera', 'Camera']];
      if (P.shield) items.push(['block', 'Block']);
      if (P.data.flasks > 0) items.push(['heal', 'Heal']);
      items.push(['talk', 'Use'], ['map', 'Map'], ['inventory', 'Menu']);
    }
    this.hud.setHints(items);
  }

  private updateEnemyBars(paused: boolean): void {
    const bars: EnemyBar[] = [];
    if (!paused) {
      const cam = this.cam.camera;
      const w = window.innerWidth;
      const h = window.innerHeight;
      for (const e of this.enemies.list) {
        if (e.dead && e.sinceHurt > 1.2) continue;
        if (!e.engaged && e.sinceHurt > 4) continue;
        if (Math.hypot(e.pos.x - this.player.pos.x, e.pos.z - this.player.pos.z) > 28) continue;
        this.projected.set(e.pos.x, e.headY + 0.25, e.pos.z).project(cam);
        if (Math.abs(this.projected.x) > 1.1 || Math.abs(this.projected.y) > 1.1) continue;
        bars.push({
          x: (this.projected.x * 0.5 + 0.5) * w,
          y: (-this.projected.y * 0.5 + 0.5) * h,
          frac: e.hp / e.def.hp,
          name: e.title,
          dmg: e.sinceHurt < 1.5 ? e.lastDamage : 0,
          tell: e.telegraphing,
        });
      }
    }
    this.hud.setEnemyBars(bars);
  }

  /** Everything the minimap / full map shows. */
  private mapMarkers(full: boolean): MapMarker[] {
    const m: MapMarker[] = [];
    for (const n of this.npcs.npcs) {
      m.push({ x: n.pos.x, z: n.pos.z, kind: n.dead ? 'dead' : n.role === 'guard' ? (n.hostile ? 'hostile' : 'guard') : 'npc' });
      if (n.dead) continue;
      const icon = this.quests.iconFor(this.npcRef(n));
      if (icon) m.push({ x: n.pos.x, z: n.pos.z, kind: icon });
      else if (n.shop) m.push({ x: n.pos.x, z: n.pos.z, kind: 'shop', label: full ? 'Trader' : undefined });
    }
    for (const e of this.enemies.list) if (!e.dead) m.push({ x: e.pos.x, z: e.pos.z, kind: 'enemy' });
    for (const h of this.horses) if (h !== this.player.horse) m.push({ x: h.pos.x, z: h.pos.z, kind: 'horse' });
    for (const c of this.camels) m.push({ x: c.rig.root.position.x, z: c.rig.root.position.z, kind: 'camel' });
    for (const e of this.exits) m.push({ x: e.pos[0], z: e.pos[2], kind: 'exit', label: full ? `To ${this.mapTitle(e.to)}` : undefined });
    for (const b of this.bonfires) m.push({ x: b.pos.x, z: b.pos.z, kind: 'bonfire', label: full ? (b.lit ? 'Bonfire' : 'Bonfire (unlit)') : undefined });
    // Chests: only the ones on the beaten path show before they are found.
    for (const c of this.chests) if (!c.opened && !c.secret) m.push({ x: c.pos.x, z: c.pos.z, kind: 'chest' });
    for (const k of this.pickups) m.push({ x: k.pos.x, z: k.pos.z, kind: 'objective', label: full ? k.label : undefined });
    if (this.lostPile) m.push({ x: this.lostPile.pos.x, z: this.lostPile.pos.z, kind: 'gold', label: full ? 'Your gold' : undefined });
    // Objectives in another region: mark the exit that leads there.
    const elsewhere = new Set(this.quests.active().map((a) => (a.obj ? objMap(a.obj) : a.q.giver.map)).filter((mp) => mp !== this.mapName));
    for (const e of this.exits) if (elsewhere.has(e.to)) m.push({ x: e.pos[0], z: e.pos[2], kind: 'objective' });
    // Kill objectives in this map: mark the camp.
    for (const a of this.quests.active()) {
      if (a.obj?.kind === 'kill_camp' && a.obj.map === this.mapName) {
        const c = this.enemies.camps().find((x) => x.camp === (a.obj as { camp: string }).camp);
        if (c && c.alive > 0) m.push({ x: c.x, z: c.z, kind: 'objective', label: full ? a.q.title : undefined });
      }
    }
    if (full) {
      for (const c of this.enemies.camps()) if (c.alive > 0) m.push({ x: c.x, z: c.z, kind: 'camp', label: `${c.camp.replace(/_/g, ' ')} (${c.alive})` });
    }
    return m;
  }

  private drawMinimap(): void {
    this.minimap.draw(this.player.pos.x, this.player.pos.z, this.player.yaw, this.cam.yaw, this.mapMarkers(false));
  }

  private nearestHorse(): Horse | null {
    let best: Horse | null = null;
    let bd = MOUNT_RANGE;
    for (const h of this.horses) {
      const d = Math.hypot(h.pos.x - this.player.pos.x, h.pos.z - this.player.pos.z);
      if (d < bd) {
        bd = d;
        best = h;
      }
    }
    return best;
  }
}

const game = new Game(document.getElementById('game') as HTMLCanvasElement);
(window as unknown as { __game: Game }).__game = game;
game.start().catch((e) => {
  console.error(e);
  const msg = document.querySelector('#loading .msg');
  if (msg) msg.textContent = `Failed to start: ${e}`;
});
