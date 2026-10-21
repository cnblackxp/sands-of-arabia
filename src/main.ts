import * as THREE from 'three';
import { Camel, Horse } from './animals';
import { Ambience, Music, type Mood } from './audio';
import { FollowCamera } from './camera';
import { CharacterFactory, PLAYER_LOOKS } from './characters';
import type { Foe, HitResult } from './combat';
import { EnemySystem } from './enemy';
import { Glints, Particles, Sfx, TimeScale } from './fx';
import { Hud, type Action, type EnemyBar } from './hud';
import { Input, type Frame } from './input';
import { applyDocument, L, lang, LANGS, onLangChange, setLang, t, tOr } from './i18n';
import { GOLD_DROP, itemName, UPGRADES, upgradePrice, upgradeText, WEAPONS, weapon, weaponText, type WeaponDef } from './items';
import type { Exit, Spawn, Vec3 } from './level';
import { beam, Bonfire, Chest, GoldPile, Icon, LoreStone, Pickup, Sluice, type IconKind } from './markers';
import { Menu, type MenuRow, type MenuTab } from './menu';
import { BADGE, Minimap, type BadgeKind, type MapMarker } from './minimap';
import { type Npc, NpcSystem } from './npc';
import { Physics } from './physics';
import { Player, type BowAim } from './player';
import { Race } from './race';
import { Convoy } from './convoy';
import type { Enemy } from './enemy';
import { ARROW, Projectiles, solveBallistic, type ProjTarget } from './projectiles';
import { Progress } from './progress';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from './settings';
import { escortIn, FREE_PICKUPS, objMap, QUESTS, QuestSystem, questText, sameMap, setMapAliases, type QuestDef } from './quests';
import { DayCycle, timeLabel } from './sky';
import { mulberry32 } from './util';
import { cutout, isNewLand, loadCommon, loadMap, mapRequested, World, type CommonAssets, type MapEntry } from './world';

const TALK_RANGE = 2.4;
/** See-through radius around the player, metres. */
const CUT_RADIUS = 2.6;
const MOUNT_RANGE = 2.8;
const USE_RANGE = 2.2;

/** Landmarks whose surroundings take the sacred music mood. */
const SACRED = /temple|shrine|sanctuary|altar|tomb|khazneh|betyl|marzeah|mrzh|ruda|kahl|shams/;
const ROBES: (number | null)[] = [null, 0xf1ece0, 0x2c3e73, 0x7b2a24, 0xc9902e, 0x2f6d4f, 0x5b2d6e, 0x2b2622, 0xb8a48a];
/** Time-of-day speeds; labels are in locales/ `flow.<id>`. */
const FLOW: { id: string; on: boolean; speed: number }[] = [
  { id: 'stopped', on: false, speed: 0 },
  { id: 'glacial', on: true, speed: 1 / 600 },
  { id: 'very_slow', on: true, speed: 1 / 300 },
  { id: 'slower', on: true, speed: 1 / 120 },
  { id: 'slow', on: true, speed: 1 / 60 },
  { id: 'moderate', on: true, speed: 1 / 30 },
  { id: 'fast', on: true, speed: 1 / 10 },
  { id: 'faster', on: true, speed: 1 / 5 },
  { id: 'very_fast', on: true, speed: 1 / 2 },
  { id: 'timelapse', on: true, speed: 1 },
];

function nameHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

/** Speaking pitch (Hz) for an NPC's babble: stable per name, women higher, guards and priests lower. */
function voiceOf(npc: Npc): number {
  const base = npc.female ? 290 : npc.role === 'guard' || npc.role === 'priest' ? 150 : 185;
  return base * (0.88 + nameHash(npc.nameId) * 0.24);
}

/** Small talk sometimes opens with an "um" or "ah", seeded by name and time. */
function withFiller(lines: string[], name: string): string[] {
  if (lines.length === 0 || Math.random() > 0.4) return lines;
  const fillers = L().fillers;
  const f = fillers[Math.floor(nameHash(name + Date.now()) * fillers.length)];
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
  projectiles!: Projectiles;
  /** Interface size (Settings), applied as CSS zoom on the HUD panels. */
  uiScale = 1;
  private lastFrame: Frame | null = null;
  /** Debug: draw calls / triangles / frame time on the fps counter. */
  private showPerf = false;
  private perfAcc = 0;
  private perfN = 0;
  private npcTargets = new Map<Npc, ProjTarget>();
  private hadPointerLock = false;
  particles!: Particles;
  glints!: Glints;
  minimap!: Minimap;
  menu!: Menu;
  horses: Horse[] = [];
  camels: Camel[] = [];
  bonfires: Bonfire[] = [];
  chests: Chest[] = [];
  sluices: Sluice[] = [];
  /** The horse race (Ukaz), when the map has a course. */
  race: Race | null = null;
  /** The escort (Dumat), when the map has a convoy. */
  convoy: Convoy | null = null;
  /** A siege in progress: which wave, and the foes of that wave. */
  private siege: { wave: number; foes: Foe[]; pause: number } | null = null;
  private truceToastT = 0;
  loreStones: LoreStone[] = [];
  /** Reading an inscription (lore spawn): its lines and the line shown. */
  private reading: { stone: LoreStone; lines: string[]; i: number } | null = null;
  /** Temples, shrines and tombs of this map (the sacred music mood). */
  private sacredSpots: [number, number][] = [];
  private visitT = 0;
  private lyreT = 2;
  pickups: Pickup[] = [];
  lostPile: GoldPile | null = null;
  private icons = new Map<Npc, Icon>();
  dialogue: { npc: Npc; lines: string[]; i: number; onDone?: () => void; voice: number; verse?: boolean[]; shown?: number } | null = null;
  private last = performance.now();
  private fpsAcc = 0;
  private fpsFrames = 0;
  fps = 60;
  private frameNo = 0;
  private robe = 0;
  private flow = 0;
  /** Remembered settings (settings.ts); written back when the menu closes or the page hides. */
  settings: Settings = loadSettings();
  /** The map's own time of day before any saved setting (restored by "reset settings"). */
  private defaultHours: number | null = null;
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
    applyDocument();
    onLangChange(() => this.onLangChange());
    (document.querySelector('#loading .title') as HTMLDivElement).textContent = t('loading.title');
    (document.querySelector('#loading .msg') as HTMLDivElement).textContent = t('loading.loading');
    this.quests = new QuestSystem(this.progress, {
      toast: (t) => this.hud.showToast(t, 3.5),
      reward: (q) => this.questReward(q),
      effect: (name) => this.questEffect(name),
      sound: (k) => (k === 'accept' ? this.sfx.questAccept() : this.sfx.pickup()),
    });
    // Animal Crossing-style babble: each typed letter is voiced in the speaker's pitch.
    this.hud.onVoice = (ch) => {
      if (this.dialogue) this.sfx.voice(this.dialogue.voice, ch);
    };
    window.addEventListener('resize', () => this.resize());
    // Third person: losing the pointer lock (Esc) pauses, like most games.
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.canvas;
      if (!locked && this.hadPointerLock && this.cam.thirdPerson && this.menu && !this.menu.isOpen && this.world) this.openMainMenu('settings');
      this.hadPointerLock = locked;
    });
    this.applySavedSettings();
    // Remember settings when the tab is hidden or closed (the time of day keeps moving).
    window.addEventListener('beforeunload', () => this.persistSettings());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.persistSettings();
    });
  }

  /** Apply remembered settings that don't need a loaded map (the rest happens in start/enterMap). */
  private applySavedSettings(): void {
    const s = this.settings;
    this.uiScale = THREE.MathUtils.clamp(s.uiScale, 0.7, 1.6);
    this.flow = THREE.MathUtils.clamp(Math.round(s.flow), 0, FLOW.length - 1);
    this.robe = THREE.MathUtils.clamp(Math.round(s.robe), 0, ROBES.length - 1);
    this.lookIndex = ((Math.round(s.look) % PLAYER_LOOKS.length) + PLAYER_LOOKS.length) % PLAYER_LOOKS.length;
    this.sfx.setVolume(THREE.MathUtils.clamp(s.volume, 0, 1));
    this.sfx.setMusicVolume(THREE.MathUtils.clamp(s.music, 0, 1));
    this.music.setSoundtrack(s.soundtrack);
    this.input.mouseSens = THREE.MathUtils.clamp(s.mouseSens, 0.0008, 0.008);
    this.input.stickSens = s.stickSens;
    this.input.invertY = s.invertY;
    this.cam.usePerspective = s.perspective;
    this.applyUiScale();
  }

  /** Copy the live settings into the saved record. */
  private persistSettings(): void {
    const s = this.settings;
    s.thirdPerson = this.cam.thirdPerson;
    s.perspective = this.cam.usePerspective;
    if (this.day) s.hours = this.day.hours;
    s.flow = this.flow;
    s.look = this.lookIndex;
    s.robe = this.robe;
    if (this.minimap) s.minimap = this.minimap.mode;
    s.volume = this.sfx.volume;
    s.music = this.sfx.musicVolume;
    s.soundtrack = this.music.soundtrack;
    s.uiScale = this.uiScale;
    s.mouseSens = this.input.mouseSens;
    s.stickSens = this.input.stickSens;
    s.invertY = this.input.invertY;
    saveSettings(s);
  }

  /** Settings tab: everything back to how a new player starts (language too). */
  private resetSettings(): void {
    const d = DEFAULT_SETTINGS;
    this.settings = { ...d };
    this.flow = d.flow;
    this.day.flowing = FLOW[this.flow].on;
    this.day.speed = FLOW[this.flow].speed;
    if (this.defaultHours !== null) this.day.set(this.defaultHours);
    this.robe = d.robe;
    this.applyLook(d.look);
    this.cam.usePerspective = d.perspective;
    if (this.cam.thirdPerson !== d.thirdPerson) this.setThirdPerson(d.thirdPerson);
    while (this.minimap.mode !== d.minimap) this.minimap.cycle();
    this.minimap.setVisible(false);
    this.sfx.setVolume(d.volume);
    this.sfx.setMusicVolume(d.music);
    this.music.setSoundtrack(d.soundtrack);
    this.uiScale = d.uiScale;
    this.applyUiScale();
    this.input.mouseSens = d.mouseSens;
    this.input.stickSens = d.stickSens;
    this.input.invertY = d.invertY;
    if (lang() !== 'en') setLang('en');
    this.persistSettings();
    this.sfx.ui(true);
    this.hud.showToast(t('settings.resetDone'), 2.5);
  }

  /** Interface size: every HUD panel and the menu scale together. */
  private applyUiScale(): void {
    document.getElementById('hud')?.style.setProperty('--ui', String(this.uiScale));
    this.hud.uiScale = this.uiScale;
  }

  /** Switch the debug true third-person camera (mouse / right-stick look). */
  private setThirdPerson(on: boolean): void {
    this.cam.setThirdPerson(on);
    this.input.thirdPerson = on;
    this.hud.thirdPerson = on;
    this.sfx.cameraMode(on);
    if (!on && document.pointerLockElement) document.exitPointerLock();
    this.hud.setCrosshair(on, 0, false);
  }

  async start(): Promise<void> {
    const bar = document.querySelector('#loading .bar div') as HTMLDivElement;
    const msg = document.querySelector('#loading .msg') as HTMLDivElement;
    this.common = await loadCommon((f, label) => {
      bar.style.width = `${f * 50}%`;
      msg.textContent = t('loading.loaded', { label: tOr(`loading.assets.${label}`, label) });
    });
    const c = this.common;
    // Variants of one place (Marib after the flood) share quests and people.
    setMapAliases(Object.fromEntries(c.maps.maps.filter((m) => m.variant_of).map((m) => [m.name, m.variant_of!])));
    void this.music.load();
    this.factory = new CharacterFactory(c.person, c.horse, c.camel, c.personClips);
    this.factory.setWingedHorse(c.wingedHorse);

    const hudRoot = document.getElementById('hud')!;
    this.menu = new Menu(hudRoot, this.hud, (confirm) => this.sfx.ui(confirm));
    this.menu.onClose = () => {
      this.persistSettings();
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
    // The true third-person camera is the default; the overhead views stay a setting away.
    this.setThirdPerson(this.settings.thirdPerson);
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
    const e = this.mapEntry(name);
    return tOr(`maps.${name}`, lang() === 'ar' && e.title_ar ? e.title_ar : e.title);
  }

  /** Re-render whatever shows text after the language changes. */
  private onLangChange(): void {
    this.hud.refreshText();
    // The language is picked in the pause menu's Settings tab; relabel it in place.
    if (this.menu.isOpen) this.menu.relabel(t('menu.paused'), this.mapTitle(this.mapName), this.mainTabs());
  }

  /** Exit label: the level's (English) label, or a translation by "map>to". */
  private exitLabel(e: Exit): string {
    return tOr(`exits.${this.mapName}>${e.to}`, lang() === 'en' ? e.label : lang() === 'ar' && e.label_ar ? e.label_ar : t('markers.to', { map: this.mapTitle(e.to) }));
  }

  /** Name shown for a pickup (quest item or free pickup). */
  private pickupLabel(p: Pickup): string {
    return p.item.startsWith('free:') ? (L().free[p.item.slice(5)]?.label ?? p.label) : itemName(p.item);
  }

  /** Travel to another map through an exit (or quick travel). */
  async travel(to: string, at?: Arrival): Promise<void> {
    if (this.travelling) return;
    this.closeDialogue(false);
    if (this.menu.isOpen) this.menu.close();
    this.sfx.travel();
    await this.enterMap(this.resolveMap(to), this.mapName, at);
  }

  /** A place that changed for good (Marib after the flood) is reached as its variant. */
  private resolveMap(name: string): string {
    return this.progress.data.variants[name] ?? name;
  }

  /** World effects of quests. */
  private questEffect(name: string): void {
    if (name !== 'flood_marib') return;
    this.progress.data.variants.marib = 'marib_breach';
    this.progress.save();
    this.sfx.flood();
    this.cam.addTrauma(0.6);
    this.hud.showToast(t('flood.toast'), 6);
    // Standing in Marib: the same ground, after the water.
    if (this.mapName === 'marib') {
      const p = this.player.pos.clone();
      const yaw = this.player.yaw;
      setTimeout(() => void this.enterMap('marib_breach', 'marib', { pos: [p.x, p.y, p.z], yaw }), 2500);
    }
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
    (document.querySelector('#loading .title') as HTMLDivElement).textContent = this.mapTitle(entry.name);
    loading.classList.remove('done');
    let map;
    try {
      map = await loadMap(entry, (f, label) => {
        bar.style.width = `${50 + f * 50}%`;
        msg.textContent = t('loading.loaded', { label: tOr(`loading.assets.${label}`, label) });
      });
    } catch (e) {
      // Nothing was torn down yet: stay where we are (or report it at startup).
      this.travelling = false;
      if (!this.world) throw e;
      console.error(e);
      loading.classList.add('done');
      this.last = performance.now();
      this.hud.showToast(t('toast.loadFailed', { map: this.mapTitle(entry.name) }), 4);
      return;
    }

    // Carry over what belongs to the player and the clock.
    const prev = this.player && !at?.revive ? { hp: this.player.hp, stamina: this.player.stamina } : null;
    // A rider keeps their horse across maps (same coat, wings and all).
    const riding = this.player?.horse && !at?.revive ? { winged: this.player.horse.winged, coat: this.player.horse.coat } : null;
    const hours = this.day?.hours;
    this.teardown();

    this.physics = new Physics();
    await this.physics.init();
    this.world = new World(map, this.physics);
    this.mapName = entry.name;
    if (!this.progress.data.visited.includes(entry.name)) {
      this.progress.data.visited.push(entry.name);
      this.progress.save();
    }
    const scene = this.world.scene;
    this.day = new DayCycle(this.world, this.renderer, this.common.bg, this.common.envHdr);
    this.defaultHours ??= this.day.hours;
    if (hours !== undefined) this.day.set(hours);
    else if (this.settings.hours !== null) this.day.set(this.settings.hours);
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
    this.player.nockModel = this.common.arrowProp?.scene ?? null;
    scene.add(this.player.rig.root);

    this.npcs = new NpcSystem(this.world, factory, scene, this.sfx);
    this.enemies = new EnemySystem(this.world, factory, scene, this.sfx, { dog: this.common.dog, bird: this.common.bird, rat: this.common.rat, scorpion: this.common.scorpion, viper: this.common.viper });
    this.enemies.ear = (q) => {
      const d = Math.hypot(q.x - this.player.pos.x, q.z - this.player.pos.z);
      return { pan: this.pan(q.x, q.z), gain: Math.max(0, 1 - d / 32) };
    };
    this.setupProjectiles(scene);
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
    if (riding) {
      const h = this.addHorse({ role: 'horse', pos: [pos.x, pos.y, pos.z], yaw: this.player.yaw }, riding.winged, rnd, riding.coat);
      this.player.mount(h);
    }
    this.setupRace(level);
    this.setupConvoy(level);
    this.sacredSpots = Object.entries(level.landmarks)
      .filter(([k]) => SACRED.test(k))
      .map(([, p]) => [p[0], p[2]] as [number, number]);
    this.enemies.setTellFx((follow) => this.glints.spawn(follow));
    // The ghul: a whirl of sand where it was and where it stands.
    this.enemies.onBlink = (from, to) => {
      for (const at of [from, to]) this.particles.burst(at.clone().setY(at.y + 1), 26, { color: 0xc9a06a, speed: 3.2, up: 2.2, size: 0.11, life: 0.8, gravity: 2 });
      this.sfx.ghulBlink();
    };
    this.enemies.setKillHook((e) => this.onEnemyKilled(e));
    const tmp = new THREE.Vector3();
    this.npcs.onTell = (n) => {
      const hand = n.rig.bones.get('hand_R');
      this.glints.spawn(() => (hand ? hand.getWorldPosition(tmp) : tmp.copy(n.pos)));
    };
    this.npcs.onDeathCb = (n) => this.hud.showToast(t(n.female ? 'toast.fallenF' : 'toast.fallen', { name: n.name, title: n.title.toLowerCase() }));

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
    this.placeSluicesAndLore(level.spawns);
    this.spawnPickups();
    this.spawnLostGold();

    const hudRoot = document.getElementById('hud')!;
    const mode = this.minimap?.mode ?? THREE.MathUtils.clamp(Math.round(this.settings.minimap), 0, 2);
    this.minimap?.dispose();
    this.minimap = new Minimap(hudRoot, level, map.heights);
    while (this.minimap.mode !== mode) this.minimap.cycle();

    this.debugObj = this.world.colliderDebug();
    this.debugObj.visible = false;
    scene.add(this.debugObj);

    this.physics.step();
    this.cam.snap(this.player.pos);
    // Compile shaders behind the loading screen (in parallel where the browser
    // can), so the first frames and the first sight of each object don't hitch.
    try {
      await this.renderer.compileAsync(scene, this.cam.camera);
    } catch {
      this.renderer.compile(scene, this.cam.camera);
    }
    loading.classList.add('done');
    this.last = performance.now();
    this.travelling = false;
    this.hud.showToast(this.mapTitle(entry.name), 3);
    this.prefetchNeighbours();
  }

  private lookIndex = 0;

  /**
   * Download the maps this one's exits lead to, quietly in the background, one
   * at a time, so walking through an exit doesn't wait on the network.
   */
  private prefetchNeighbours(): void {
    const here = this.mapName;
    const next = [...new Set(this.exits.map((e) => e.to))].filter((n) => n !== here && !mapRequested(n) && this.common.maps.maps.some((m) => m.name === n));
    const step = (i: number) => {
      if (i >= next.length || this.mapName !== here) return;
      loadMap(this.mapEntry(next[i]), () => {})
        .catch(() => {})
        .finally(() => setTimeout(() => step(i + 1), 500));
    };
    // Give the arrival a few seconds to settle first.
    setTimeout(() => step(0), 3000);
  }

  /** Arrows and slingers' stones: targets, impacts, pickups. */
  private setupProjectiles(scene: THREE.Scene): void {
    const c = this.common;
    const pr = new Projectiles(scene, this.physics, (x, z) => this.world.ground(x, z), c.arrowProp?.scene ?? null, c.rockProp?.scene ?? null);
    this.projectiles = pr;
    this.npcTargets.clear();
    const player = this.player;
    const playerTarget: ProjTarget = {
      get pos() {
        return player.pos;
      },
      get dead() {
        return player.dead;
      },
      hitRadius: 0.4,
      hitLo: 0.1,
      hitHi: 1.8,
      get root() {
        return player.rig.root;
      },
      shot: (dmg, from) => {
        if (player.invulnerable) return null;
        const blocked = player.isBlocking;
        player.hurt(dmg, from, 1.1);
        return { pos: player.pos.clone().setY(player.pos.y + 1.2), killed: player.dead, staggered: false, blocked: blocked && player.isBlocking };
      },
    };
    const npcTarget = (n: Npc): ProjTarget => {
      let t = this.npcTargets.get(n);
      if (!t)
        this.npcTargets.set(
          n,
          (t = {
            pos: n.pos,
            get dead() {
              return n.dead;
            },
            hitRadius: 0.36,
            hitLo: 0.15,
            hitHi: 1.8,
            root: n.rig.root,
            shot: (dmg, from) => n.damage(dmg, from),
          }),
        );
      return t;
    };
    pr.targets = (side) => {
      if (side === 'enemy') return [playerTarget];
      const p = this.player.pos;
      const out: ProjTarget[] = [];
      for (const e of this.enemies.list) if (!e.dead && Math.abs(e.pos.x - p.x) < 90 && Math.abs(e.pos.z - p.z) < 90) out.push(e);
      for (const n of this.npcs.npcs) if (!n.dead && Math.abs(n.pos.x - p.x) < 90 && Math.abs(n.pos.z - p.z) < 90) out.push(npcTarget(n));
      return out;
    };
    pr.onImpact = (ev) => {
      const d = Math.hypot(ev.pos.x - this.player.pos.x, ev.pos.z - this.player.pos.z);
      const gain = Math.max(0.15, 1 - d / 40);
      this.sfx.impact(ev.kind, ev.surface, this.pan(ev.pos.x, ev.pos.z), gain);
      if (ev.surface === 'flesh') {
        this.particles.burst(ev.pos, 7, { color: 0x7a1a12, speed: 2.2, up: 1.6, size: 0.06, life: 0.45 });
        if (ev.kind === 'arrow' && ev.result) {
          // A clean hit: a short hitstop, more if it killed.
          this.time.hitstop(ev.result.killed ? 0.09 : 0.035);
          if (ev.result.killed) this.sfx.hit(true);
        }
      } else if (ev.surface === 'shield') {
        this.particles.burst(ev.pos, 8, { color: 0xffd27a, speed: 3.5, up: 1.5, size: 0.04, life: 0.3, gravity: 6 });
      } else {
        this.particles.burst(ev.pos, ev.kind === 'rock' ? 10 : 5, { color: ev.kind === 'rock' ? 0x9a8a70 : 0xd9b58a, speed: 1.6, up: 1.4, size: ev.kind === 'rock' ? 0.07 : 0.05, life: 0.45, gravity: 4 });
      }
    };
    pr.onPickup = (n) => {
      const d = this.progress.data;
      const before = d.arrows;
      d.arrows = Math.min(ARROW.max, d.arrows + n);
      this.progress.save();
      this.sfx.arrowPickup();
      if (d.arrows > before) this.floatAt(this.player.pos, 2, t(d.arrows - before > 1 ? 'float.arrows' : 'float.arrow', { n: d.arrows - before }), 'heal');
    };
    this.enemies.onThrow = (e, from, dmg) => {
      // Aim at where the player will be when the stone (or arrow) arrives.
      const arrow = !!e.def.ranged?.arrow;
      const speed = arrow ? ARROW.speed * 0.8 : 17;
      const p = this.player;
      const target = p.pos.clone().setY(p.pos.y + 1.1);
      const flight = from.distanceTo(target) / speed;
      target.addScaledVector(p.moveDir, p.speed * flight * 0.8);
      const vel = solveBallistic(from, target, speed, 12) ?? solveBallistic(from, target, speed, 12, true);
      if (!vel) return;
      pr.fire(arrow ? 'arrow' : 'rock', from, vel, dmg, 'enemy');
      const ear = this.enemies.ear(e.pos);
      if (arrow) this.sfx.bowRelease(ear.pan, Math.max(0.3, ear.gain));
      else this.sfx.rockThrow(ear.pan, Math.max(0.3, ear.gain));
    };
  }

  /**
   * Where the bow points. Third person: along the crosshair. Overhead camera:
   * at the mouse cursor (keyboard & mouse), or along the left stick with aim
   * assist (gamepad). Returns the launch point and velocity of the arrow.
   */
  private bowAim(quick: boolean): BowAim {
    const p = this.player;
    const f = this.lastFrame;
    const speed = ARROW.speed;
    const g = ARROW.gravity;
    let yaw = p.yaw;
    const from = (y: number) => {
      const o = p.pos.clone();
      o.y += (p.horse ? 2.25 : 1.45);
      o.x += Math.sin(y) * 0.4;
      o.z += Math.cos(y) * 0.4;
      return o;
    };
    p.aimLocksMove = false;
    let target: THREE.Vector3 | null = null;
    if (this.cam.thirdPerson) {
      // Crosshair: the camera's centre ray, to the first thing it meets.
      const cam = this.cam.persp;
      const o = cam.position.clone();
      const dir = this.cam.aimDirection(new THREE.Vector3());
      let dist = this.physics.rayStatic(o, dir, 220);
      for (let t = 1; t < dist; t += 1) {
        const x = o.x + dir.x * t;
        const z = o.z + dir.z * t;
        if (o.y + dir.y * t < this.world.ground(x, z)) {
          dist = t;
          break;
        }
      }
      for (const e of this.pr_targets()) {
        // Closest approach of the ray to the target's centre line.
        const cx = e.pos.x - o.x;
        const cz = e.pos.z - o.z;
        const t = cx * dir.x + cz * dir.z;
        if (t < 2 || t > dist) continue;
        const hx = o.x + dir.x * t - e.pos.x;
        const hz = o.z + dir.z * t - e.pos.z;
        const y = o.y + dir.y * t;
        if (Math.hypot(hx, hz) < e.hitRadius && y > e.pos.y + e.hitLo && y < e.pos.y + e.hitHi) dist = t;
      }
      target = o.addScaledVector(dir, dist);
      yaw = Math.atan2(dir.x, dir.z);
      const a = from(yaw);
      const vel = target.clone().sub(a).normalize().multiplyScalar(speed);
      return { yaw, pitch: Math.asin(THREE.MathUtils.clamp(vel.y / speed, -1, 1)), from: a, vel };
    }
    if (f && f.device === 'keyboard') {
      // Mouse cursor on the ground (or on a box top / a foe under it).
      target = this.cursorPoint(f.mouseX, f.mouseY);
      if (target) {
        let best: Foe | null = null;
        let bd = 1.6;
        for (const e of this.enemies.list) {
          if (e.dead) continue;
          const d = Math.hypot(e.pos.x - target.x, e.pos.z - target.z);
          if (d < bd) {
            bd = d;
            best = e;
          }
        }
        if (best) target = best.pos.clone().setY(best.pos.y + (best.flying ? 0 : 1.1));
        yaw = Math.atan2(target.x - p.pos.x, target.z - p.pos.z);
      }
    } else if (f) {
      // Gamepad: the stick turns the aim; snap to a foe near that line.
      if (!quick) p.aimLocksMove = true;
      const m = Math.hypot(f.moveX, f.moveY);
      if (m > 0.3) {
        const dx = this.cam.right.x * f.moveX + this.cam.forward.x * f.moveY;
        const dz = this.cam.right.z * f.moveX + this.cam.forward.z * f.moveY;
        yaw = Math.atan2(dx, dz);
      } else if (p.aim) yaw = p.aim.yaw;
      const foe = this.enemies.aimTarget(p.pos, yaw, 45, THREE.MathUtils.degToRad(22), true);
      if (foe) {
        target = foe.pos.clone().setY(foe.pos.y + (foe.flying ? 0 : 1.1));
        yaw = Math.atan2(target.x - p.pos.x, target.z - p.pos.z);
      } else {
        const x = p.pos.x + Math.sin(yaw) * 18;
        const z = p.pos.z + Math.cos(yaw) * 18;
        target = new THREE.Vector3(x, this.world.floor(x, z, p.pos.y + 1), z);
      }
    }
    const a = from(yaw);
    let vel: THREE.Vector3 | null = target ? solveBallistic(a, target, speed, g) : null;
    if (!vel) {
      // Out of range (or no target): loose at 40°, the longest flat shot.
      const el = target ? THREE.MathUtils.degToRad(40) : 0.08;
      vel = new THREE.Vector3(Math.sin(yaw) * Math.cos(el), Math.sin(el), Math.cos(yaw) * Math.cos(el)).multiplyScalar(speed);
    }
    return { yaw, pitch: Math.asin(THREE.MathUtils.clamp(vel.y / speed, -1, 1)), from: a, vel };
  }

  private pr_targets(): Foe[] {
    return this.enemies.list.filter((e) => !e.dead);
  }

  /** World point under the mouse cursor (ground or a box top). */
  private cursorPoint(nx: number, ny: number): THREE.Vector3 | null {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(nx, ny), this.cam.camera);
    const o = ray.ray.origin.clone();
    const d = ray.ray.direction.clone();
    // Start near the player's height to keep the march short.
    const py = this.player.pos.y;
    const t0 = d.y !== 0 ? (py + 25 - o.y) / d.y : 0;
    const start = o.clone().addScaledVector(d, Math.max(0, t0));
    const box = this.physics.rayStatic(start, d, 80);
    let lo = 0;
    let hi = Math.min(box, 80);
    const below = (t: number) => {
      const q = start.clone().addScaledVector(d, t);
      return q.y < this.world.ground(q.x, q.z);
    };
    if (!below(hi)) return start.addScaledVector(d, hi);
    for (let i = 0; i < 18; i++) {
      const m = (lo + hi) / 2;
      if (below(m)) hi = m;
      else lo = m;
    }
    return start.addScaledVector(d, hi);
  }

  private addHorse(s: Spawn, winged: boolean, rnd: () => number, coat?: Record<string, number>): Horse {
    const h = new Horse(this.factory, this.physics, s, rnd, winged, coat);
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
      if (pos) this.pickups.push(new Pickup(this.world.scene, pos, o.item, itemName(o.item)));
    }
    for (const id of Object.keys(FREE_PICKUPS)) {
      if (this.progress.data.taken.includes(id)) continue;
      const pos = at(id);
      if (pos) this.pickups.push(new Pickup(this.world.scene, pos, `free:${id}`, L().free[id]?.label ?? id));
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
      else if (s.buried) c.bury(this.world.scene);
      this.chests.push(c);
    }
  }

  /** Marib's sluice gates and readable inscriptions from level.json. */
  private placeSluicesAndLore(spawns: Spawn[]): void {
    // Gates already worked by a rota stay open.
    const open = new Set<string>();
    for (const q of QUESTS) {
      const st = this.quests.state(q.id);
      if (!st) continue;
      q.objectives.forEach((o, i) => {
        if (o.kind === 'use' && (st.state !== 'active' || i < st.step)) open.add(o.target);
      });
    }
    for (const s of spawns) {
      const role = s.role as string;
      if (!s.id) continue;
      const pos = new THREE.Vector3(s.pos[0], this.world.floor(s.pos[0], s.pos[2], s.pos[1]), s.pos[2]);
      if (role === 'sluice') {
        const sl = new Sluice(this.world.scene, s.id, pos, s.yaw);
        if (open.has(s.id)) sl.setOpen(true);
        this.sluices.push(sl);
      } else if (role === 'lore') {
        this.loreStones.push(new LoreStone(this.world.scene, s.id, pos));
      }
    }
  }

  /** Work a sluice: advance a rota (in order), or just open/shut it. */
  private useSluice(sl: Sluice): void {
    const r = this.quests.used(this.mapName, sl.id);
    if (r === 'wrong') {
      const next = this.quests.nextUse(this.mapName);
      this.sfx.denied();
      this.hud.showToast(t('sluice.wrong', { gate: next ? tOr(`sluice.names.${next.target}`, next.target) : '' }), 3);
      return;
    }
    const opening = r === 'ok' ? true : !sl.open;
    sl.setOpen(opening);
    const ear = this.enemies.ear(sl.pos);
    this.sfx.sluice(opening, ear.pan);
    this.hud.showToast(t(opening ? 'sluice.opened' : 'sluice.closed'), 2.2);
  }

  private openChest(c: Chest): void {
    if (c.buried) {
      // First dig it up; opening is the next press.
      c.dig();
      this.sfx.dig();
      this.particles.burst(c.pos.clone().setY(c.pos.y + 0.2), 18, { color: 0xc9a06a, speed: 2.2, up: 2.4, size: 0.1, life: 0.7, gravity: 5 });
      this.hud.showToast(t('dig.found'), 2);
      return;
    }
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
        extra = t('toast.chestFlask');
      }
    }
    this.progress.save();
    this.sfx.chest();
    this.floatAt(c.pos, 1.2, t('float.gold', { n: g }), 'gold');
    this.particles.burst(c.pos.clone().setY(c.pos.y + 0.6), 14, { color: 0xffc94a, speed: 1.6, up: 3, size: 0.06, life: 0.8 });
    this.hud.showToast(t('toast.chest', { hidden: c.secret ? t('toast.chestHidden') : '', gold: g, extra }), 3);
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
    this.sluices = [];
    this.race?.dispose();
    this.convoy = null;
    this.siege = null;
    this.race = null;
    this.loreStones = [];
    this.reading = null;
    this.pickups = [];
    this.lostPile = null;
    this.projectiles?.dispose();
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
      bowAim: (quick: boolean) => this.bowAim(quick),
      bowDraw: () => this.sfx.bowDraw(this.player.weapon.draw ?? 0.65),
      bowRelax: () => this.sfx.bowRelax(),
      shoot: (aim: BowAim) => {
        this.projectiles.fire('arrow', aim.from, aim.vel, this.player.weapon.dmg, 'player');
        this.sfx.bowRelease();
        this.cam.addTrauma(0.06);
      },
      truce: () => {
        if (this.truceToastT > 0) return;
        this.truceToastT = 3;
        this.sfx.denied();
        this.hud.showToast(t('truce.toast'), 3);
      },
      noArrows: () => {
        this.sfx.noArrows();
        this.hud.showToast(t('toast.quiverEmpty'), 2.5);
      },
      noFlask: () => {
        this.sfx.denied();
        this.hud.showToast(t('toast.noFlask'), 2);
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
        this.floatAt(this.player.pos, 2, t('float.restored'), 'heal');
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

  private onEnemyKilled(e: Foe): void {
    const [lo, hi] = GOLD_DROP[e.kind] ?? [15, 25];
    const g = Math.round(lo + Math.random() * (hi - lo));
    this.progress.addGold(g);
    this.sfx.coin();
    this.floatAt(e.pos, e.headY - e.pos.y, t('float.gold', { n: g }), 'gold');
    this.particles.burst(e.pos.clone().setY(e.pos.y + 1), 8, { color: 0xffc94a, speed: 2, up: 2.5, size: 0.06, life: 0.7 });
    if (e.camp && this.enemies.campAlive(e.camp) === 0) {
      this.hud.showToast(t('toast.campBroken', { camp: this.campName(e.camp) }), 3);
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
      this.hud.showToast(t('toast.diedGold', { gold }), 4);
    } else {
      this.hud.showToast(t('toast.died'), 3.5);
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
    this.hud.showToast(t(bf ? 'toast.wakeBonfire' : 'toast.wakeMarket'), 3.5);
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
    this.projectiles.clearFromBodies();
    this.progress.data.arrows = ARROW.max;
    this.npcs.calmGuards();
    this.progress.save();
    if (first) this.sfx.ignite();
    else this.sfx.rest();
    this.particles.burst(b.pos.clone().setY(b.pos.y + 0.6), 24, { color: 0xffa040, speed: 2, up: 3, size: 0.07, life: 0.9, gravity: -1 });
    this.hud.showToast(first ? t('toast.lit') : t('toast.rested', { quiver: this.progress.hasBow ? t('toast.quiverRefilled') : '' }), 3);
  }

  private questReward(q: QuestDef): void {
    const r = q.reward;
    this.progress.addGold(r.gold);
    const bits = [t('gold', { n: r.gold })];
    if (r.upgrade) {
      const u = this.progress.data.upgrades;
      u[r.upgrade] = (u[r.upgrade] ?? 0) + 1;
      if (r.upgrade === 'flask') this.progress.data.flasks++;
      const up = UPGRADES.find((x) => x.id === r.upgrade);
      bits.push(up ? upgradeText(up).name : r.upgrade);
    }
    if (r.weapon && !this.progress.data.weapons.includes(r.weapon)) {
      this.progress.data.weapons.push(r.weapon);
      bits.push(weaponText(weapon(r.weapon)).name);
    }
    this.progress.save();
    this.hud.showToast(t('quest.complete', { title: questText(q.id).title, rewards: bits.join(lang() === 'ar' ? '، ' : ', ') }), 4.5);
    this.sfx.questComplete();
  }

  private statText(w: WeaponDef): string {
    return t('stats.line', { dmg: w.dmg, reach: w.range.toFixed(1), speed: w.speed.toFixed(2), stamina: w.stamina });
  }

  private campName(camp: string): string {
    return tOr(`camps.${camp}`, camp.replace(/_/g, ' '));
  }

  /** Rising HUD text above a world position. */
  private floatAt(p: THREE.Vector3, up: number, text: string, cls: string): void {
    const v = this.projected.set(p.x, p.y + up, p.z).project(this.cam.camera);
    this.hud.floatText((v.x * 0.5 + 0.5) * window.innerWidth, (-v.y * 0.5 + 0.5) * window.innerHeight, text, cls);
  }

  // --- menus -----------------------------------------------------------------------

  private openMainMenu(tab: string): void {
    if (document.pointerLockElement) document.exitPointerLock();
    this.menu.open(t('menu.paused'), this.mapTitle(this.mapName), this.mainTabs(), tab);
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
      if (w.kind === 'bow') return t('stats.bow', { dmg: w.dmg, draw: (w.draw ?? 0.6).toFixed(2), aim: this.hud.key('block'), loose: this.hud.key('attack') });
      return this.statText(w) + (w.heavy ? t('stats.staggers') : '');
    };
    const tabs: MenuTab[] = [
      {
        id: 'inventory',
        label: t('tabs.inventory'),
        rows: () => {
          const rows: MenuRow[] = [
            { label: t('inv.equipment'), kind: 'header' },
            {
              label: t('inv.weapon'),
              kind: 'choice',
              value: () => weaponText(weapon(d.equipped)).name,
              sub: () => statLine(d.equipped),
              adjust: (k) => {
                const owned = d.weapons;
                const i = owned.indexOf(d.equipped);
                d.equipped = owned[(i + k + owned.length) % owned.length];
                P.save();
                this.rebuildPlayer();
              },
            },
            { label: t('inv.shield'), kind: 'info', value: () => (P.shield ? t('inv.roundShield') : '—'), sub: () => (P.shield ? t('inv.holdBlock', { key: this.hud.key('block') }) : t('inv.soldByTraders')) },
            { label: t('inv.consumables'), kind: 'header' },
            { label: t('inv.flasks'), kind: 'info', value: () => `${d.flasks} / ${P.maxFlasks}`, sub: () => t('inv.flasksSub', { key: this.hud.key('heal') }) },
            ...(P.hasBow ? [{ label: t('inv.arrows'), kind: 'info' as const, value: () => `${d.arrows} / ${ARROW.max}`, sub: () => t('inv.arrowsSub') }] : []),
            { label: t('inv.character'), kind: 'header' },
            { label: t('inv.health'), kind: 'info', value: () => `${Math.ceil(this.player.hp)} / ${P.maxHp}` },
            { label: t('inv.stamina'), kind: 'info', value: () => `${P.maxStamina}` },
            { label: t('inv.gold'), kind: 'info', value: () => `${d.gold}` },
            { label: t('inv.feather'), kind: 'info', value: () => t(P.doubleJump ? 'menu.yes' : 'menu.no') },
          ];
          const keys = Object.entries(d.items).filter(([, n]) => n > 0);
          if (keys.length) {
            rows.push({ label: t('inv.keyItems'), kind: 'header' });
            for (const [id, n] of keys) rows.push({ label: itemName(id), kind: 'info', value: () => (n > 1 ? `×${n}` : '') });
          }
          if (d.lostGold) rows.push({ label: t('inv.lostGold'), kind: 'info', value: () => `${d.lostGold!.amount}`, sub: () => t('inv.lostGoldSub', { map: this.mapTitle(d.lostGold!.map) }) });
          return rows;
        },
      },
      { id: 'map', label: t('tabs.map'), wide: true, render: (el) => this.renderMapTab(el) },
      {
        id: 'quests',
        label: t('tabs.quests'),
        rows: () => {
          const rows: MenuRow[] = [];
          const active = this.quests.active();
          rows.push({ label: t('questsTab.active'), kind: 'header' });
          if (!active.length) rows.push({ label: t('questsTab.none'), kind: 'info', sub: () => t('questsTab.noneSub') });
          for (const a of active) {
            rows.push({
              label: (d.trackedQuest === a.q.id ? '◆ ' : '') + questText(a.q.id).title,
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
            rows.push({ label: t('questsTab.completed'), kind: 'header' });
            for (const q of done) rows.push({ label: questText(q.id).title, kind: 'info', value: () => '✓' });
          }
          return rows;
        },
      },
      {
        id: 'travel',
        label: t('tabs.travel'),
        rows: () => {
          const rows: MenuRow[] = [{ label: t('travel.bonfires'), kind: 'header' }];
          if (!d.litBonfires.length) rows.push({ label: t('travel.none'), kind: 'info', sub: () => t('travel.noneSub') });
          for (const id of d.litBonfires) {
            const [map, idx] = id.split(':');
            const name = /^\d+$/.test(idx) ? t('bonfireN', { n: Number(idx) + 1 }) : tOr(`bonfires.${idx}`, idx.replace(/^[a-z]+_/, '').replace(/_/g, ' '));
            rows.push({
              label: t('travel.row', { map: this.mapTitle(map), name }),
              kind: 'button',
              activate: () => void this.travelToBonfire(id),
              disabled: () => this.player.inCombat,
              sub: () => (this.player.inCombat ? t('travel.inCombat') : ''),
            });
          }
          // The first journey's regions, then the new lands (marked until visited).
          // A variant (Marib after the flood) shows only once it has replaced its place.
          const active = new Set(Object.values(d.variants));
          const maps = this.common.maps.maps.filter((m) => (m.variant_of ? active.has(m.name) : !d.variants[m.name]));
          const groups: [string, MapEntry[]][] = [
            [t('travel.regionsFirst'), maps.filter((m) => !isNewLand(m))],
            [t('travel.regionsNew'), maps.filter((m) => isNewLand(m))],
          ];
          for (const [title, list] of groups) {
            if (!list.length) continue;
            rows.push({ label: title, kind: 'header' });
            for (const m of list) {
              const fresh = isNewLand(m) && !d.visited.includes(m.name);
              rows.push({
                label: (fresh ? '✦ ' : '') + this.mapTitle(m.name),
                kind: 'button',
                value: () => (m.name === this.mapName ? t('travel.here') : fresh ? t('travel.new') : ''),
                sub: () => (isNewLand(m) ? t('travel.newSub') : ''),
                activate: () => void this.quickTravel(m.name),
              });
            }
          }
          return rows;
        },
      },
      {
        id: 'settings',
        label: t('tabs.settings'),
        rows: () => [
          {
            label: t('lang.label'),
            kind: 'choice',
            value: () => t('lang.name'),
            adjust: (k) => setLang(LANGS[(LANGS.indexOf(lang()) + k + LANGS.length) % LANGS.length]),
            activate: () => setLang(LANGS[(LANGS.indexOf(lang()) + 1) % LANGS.length]),
          },
          {
            label: t('settings.time'),
            kind: 'slider',
            value: () => timeLabel(this.day.hours),
            adjust: (k) => this.day.set(this.day.hours + k * 0.5),
            slider: { min: 0, max: 23.99, step: 0.05, get: () => this.day.hours, set: (v) => this.day.set(v) },
          },
          {
            label: t('settings.timePasses'),
            kind: 'choice',
            value: () => tOr(`flow.${FLOW[this.flow].id}`, FLOW[this.flow].id),
            sub: () => {
              const f = FLOW[this.flow];
              if (!f.on) return t('settings.sunStays');
              const s = 24 / f.speed;
              return t('settings.dayLength', { d: s >= 3600 ? t('settings.hours', { n: +(s / 3600).toFixed(1) }) : s >= 60 ? t('settings.minutes', { n: Math.round(s / 60) }) : t('settings.seconds', { n: Math.round(s) }) });
            },
            adjust: (k) => {
              this.flow = (this.flow + k + FLOW.length) % FLOW.length;
              this.day.flowing = FLOW[this.flow].on;
              this.day.speed = FLOW[this.flow].speed;
            },
          },
          { label: t('settings.character'), kind: 'choice', value: () => L().looks[this.lookIndex] ?? PLAYER_LOOKS[this.lookIndex].name, adjust: (k) => this.applyLook(this.lookIndex + k) },
          {
            label: t('settings.robe'),
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
          {
            // Third person (default) → overhead orthographic → overhead perspective.
            label: t('settings.camera'),
            kind: 'choice',
            value: () => t(this.cam.thirdPerson ? 'settings.thirdPerson' : this.cam.usePerspective ? 'settings.perspective' : 'settings.orthographic'),
            sub: () => (this.cam.thirdPerson ? t(this.hud.device === 'gamepad' ? 'debug.thirdPersonPad' : 'debug.thirdPersonMouse') : ''),
            adjust: (k) => {
              const modes = ['third', 'ortho', 'persp'];
              const cur = this.cam.thirdPerson ? 0 : this.cam.usePerspective ? 2 : 1;
              const next = modes[(cur + k + modes.length) % modes.length];
              this.cam.usePerspective = next === 'persp';
              if ((next === 'third') !== this.cam.thirdPerson) this.setThirdPerson(next === 'third');
            },
          },
          {
            label: t('settings.uiScale'),
            kind: 'slider',
            value: () => `${Math.round(this.uiScale * 100)}%`,
            sub: () => t('settings.uiScaleSub'),
            adjust: (k) => {
              this.uiScale = Math.round(THREE.MathUtils.clamp(this.uiScale + k * 0.05, 0.7, 1.6) * 100) / 100;
              this.applyUiScale();
            },
            slider: {
              min: 0.7,
              max: 1.6,
              step: 0.05,
              get: () => this.uiScale,
              set: (v) => {
                this.uiScale = v;
                this.applyUiScale();
              },
            },
          },
          {
            label: t('settings.minimap'),
            kind: 'choice',
            value: () => L().settings.minimapModes[this.minimap.mode],
            adjust: (k) => {
              for (let i = 0; i < (k > 0 ? 1 : 2); i++) this.minimap.cycle();
              this.minimap.setVisible(false);
            },
          },
          {
            label: t('settings.volume'),
            kind: 'slider',
            value: () => `${Math.round(this.sfx.volume * 100)}%`,
            adjust: (k) => this.sfx.setVolume(Math.min(1, Math.max(0, this.sfx.volume + k * 0.1))),
            slider: { min: 0, max: 1, step: 0.01, get: () => this.sfx.volume, set: (v) => this.sfx.setVolume(v) },
          },
          {
            label: t('settings.music'),
            kind: 'slider',
            value: () => `${Math.round(this.sfx.musicVolume * 100)}%`,
            sub: () => (this.music.nowPlaying ? t('settings.nowPlaying', { title: this.music.nowPlaying }) : ''),
            adjust: (k) => this.sfx.setMusicVolume(Math.min(1, Math.max(0, this.sfx.musicVolume + k * 0.1))),
            slider: { min: 0, max: 1, step: 0.01, get: () => this.sfx.musicVolume, set: (v) => this.sfx.setMusicVolume(v) },
          },
          ...(this.music.soundtracks.length > 1
            ? [
                {
                  label: t('settings.soundtrack'),
                  kind: 'choice' as const,
                  value: () => tOr(`settings.soundtracks.${this.music.soundtrack}`, this.music.soundtrack),
                  adjust: (k: number) => {
                    const ids = this.music.soundtracks;
                    const i = ids.indexOf(this.music.soundtrack);
                    this.music.setSoundtrack(ids[(i + (k > 0 ? 1 : ids.length - 1)) % ids.length]);
                    this.settings.soundtrackPicked = true;
                    this.persistSettings();
                  },
                },
              ]
            : []),
          { label: t('settings.reset'), kind: 'button', sub: () => t('settings.resetSub'), activate: () => this.resetSettings() },
          { label: t('settings.controls'), kind: 'header' },
          ...this.controlRows(),
          ...(this.music.credits.length ? [{ label: t('settings.credits'), kind: 'header' as const }, ...this.music.credits.map((c) => ({ label: c, kind: 'info' as const }))] : []),
        ],
      },
      {
        id: 'debug',
        label: t('tabs.debug'),
        rows: () => [
          { label: t('debug.camera'), kind: 'header' },
          {
            label: t('debug.thirdPerson'),
            kind: 'choice',
            value: () => t(this.cam.thirdPerson ? 'menu.on' : 'menu.off'),
            sub: () => t(this.hud.device === 'gamepad' ? 'debug.thirdPersonPad' : 'debug.thirdPersonMouse'),
            adjust: () => this.setThirdPerson(!this.cam.thirdPerson),
            activate: () => this.setThirdPerson(!this.cam.thirdPerson),
          },
          {
            label: t('debug.sensitivity'),
            kind: 'slider',
            value: () => `${Math.round((this.input.mouseSens / 0.0026) * 100)}%`,
            adjust: (k) => {
              this.input.mouseSens = THREE.MathUtils.clamp(this.input.mouseSens + k * 0.00026, 0.0008, 0.008);
              this.input.stickSens = (this.input.mouseSens / 0.0026) * 2.6;
            },
            slider: {
              min: 0.0008,
              max: 0.008,
              step: 0.0001,
              get: () => this.input.mouseSens,
              set: (v) => {
                this.input.mouseSens = v;
                this.input.stickSens = (v / 0.0026) * 2.6;
              },
            },
          },
          { label: t('debug.invertY'), kind: 'choice', value: () => t(this.input.invertY ? 'menu.on' : 'menu.off'), adjust: () => (this.input.invertY = !this.input.invertY), activate: () => (this.input.invertY = !this.input.invertY) },
          { label: t('debug.foes'), kind: 'header' },
          {
            label: t('debug.bow'),
            kind: 'button',
            activate: () => {
              if (!d.weapons.includes('composite_bow')) d.weapons.push('composite_bow');
              d.equipped = 'composite_bow';
              d.arrows = ARROW.max;
              P.save();
              this.rebuildPlayer();
              this.hud.showToast(t('debug.bowToast', { aim: this.hud.key('block'), loose: this.hud.key('attack') }), 3);
            },
          },
          { label: t('debug.hounds'), kind: 'button', sub: () => t('debug.houndsSub'), activate: () => this.debugSpawnFoes('hound', 3, 14) },
          { label: t('debug.vultures'), kind: 'button', sub: () => t('debug.vulturesSub'), activate: () => this.debugSpawnFoes('vulture', 2, 16) },
          { label: t('debug.slinger'), kind: 'button', sub: () => t('debug.slingerSub'), activate: () => this.debugSpawnFoes('slinger', 1, 15) },
          { label: t('debug.clubman'), kind: 'button', sub: () => t('debug.clubmanSub'), activate: () => this.debugSpawnFoes('clubman', 1, 9) },
          { label: t('debug.world'), kind: 'header' },
          {
            label: t('debug.perf'),
            kind: 'choice',
            sub: () => t('debug.perfSub'),
            value: () => t(this.showPerf ? 'menu.on' : 'menu.off'),
            adjust: () => this.togglePerf(),
            activate: () => this.togglePerf(),
          },
          { label: t('debug.horse'), kind: 'button', activate: () => this.debugSpawnHorse(false) },
          { label: t('debug.winged'), kind: 'button', sub: () => t('debug.wingedSub'), activate: () => this.debugSpawnHorse(true) },
          { label: t('debug.gold'), kind: 'button', activate: () => this.progress.addGold(500) },
          { label: t('debug.heal'), kind: 'button', activate: () => this.player.restore() },
          { label: t('debug.god'), kind: 'choice', value: () => t(this.player.god ? 'menu.on' : 'menu.off'), adjust: () => (this.player.god = !this.player.god), activate: () => (this.player.god = !this.player.god) },
          {
            label: t('debug.unlock'),
            kind: 'button',
            sub: () => t('debug.unlockSub'),
            activate: () => {
              d.weapons = WEAPONS.map((w) => w.id);
              d.upgrades.shield = 1;
              d.upgrades.double_jump = 1;
              P.save();
              this.rebuildPlayer();
            },
          },
          { label: t('debug.kill'), kind: 'button', activate: () => this.debugKillNearby() },
          { label: t('debug.reset'), kind: 'button', activate: () => this.enemies.resetAll() },
          { label: t('debug.colliders'), kind: 'choice', value: () => t(this.debugObj?.visible ? 'menu.on' : 'menu.off'), adjust: () => this.debugObj && (this.debugObj.visible = !this.debugObj.visible) },
          { label: t('debug.exit'), kind: 'button', activate: () => this.debugNextExit() },
          {
            label: t('debug.newGame'),
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
    const list: Action[] = ['move', 'run', 'attack', 'block', 'dodge', 'jump', 'heal', 'talk', 'camera', 'zoom', 'inventory', 'map'];
    const label = (a: Action) => (a === 'camera' && this.cam.thirdPerson ? t('controls.look') : tOr(`controls.${a}`, a));
    return list.map((a) => ({ label: label(a), kind: 'info' as const, value: () => this.hud.key(a) }));
  }

  /** Menu quick travel: the region's default arrival point. */
  private async quickTravel(map: string): Promise<void> {
    if (this.travelling) return;
    this.closeDialogue(false);
    this.menu.close();
    await this.enterMap(this.resolveMap(map), null);
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
      `<div class="legend-row"><span class="legend-badge" style="background:#fff">▲</span>${t('legend.you')}</div>` +
      kinds.map((k) => `<div class="legend-row"><span class="legend-badge" style="background:${BADGE[k].fill}">${BADGE[k].glyph}</span>${tOr(`badges.${k}`, BADGE[k].name)}</div>`).join('') +
      [
        ['#ff3a2a', t('legend.raider')],
        ['#6ea0ff', t('legend.guard')],
        ['#f3e6c8', t('legend.townsfolk')],
        ['#c58a4a', t('legend.horse')],
        ['#d8b483', t('legend.camel')],
      ]
        .map(([c, n]) => `<div class="legend-row"><span class="legend-dot" style="background:${c}"></span>${n}</div>`)
        .join('') +
      `<div class="legend-title" style="margin-top:12px">${t('legend.quest')}</div><div class="legend-row">${this.quests.trackerText() ?? t('legend.none')}</div>`;
  }

  private openShop(npc: Npc): void {
    if (document.pointerLockElement) document.exitPointerLock();
    const d = this.progress.data;
    const P = this.progress;
    const buy = (price: number, fn: () => void) => {
      if (d.gold < price) {
        this.hud.showToast(t('toast.notEnoughGold'), 1.8);
        this.sfx.denied();
        return;
      }
      d.gold -= price;
      fn();
      P.save();
      this.sfx.purchase();
      this.hud.showToast(t('toast.purchased'), 1.5);
    };
    const tabs: MenuTab[] = [
      {
        id: 'weapons',
        label: t('tabs.weapons'),
        rows: () => [
          { label: t('shop.yourGold', { n: d.gold }), kind: 'info' },
          ...WEAPONS.filter((w) => w.price > 0).map(
            (w): MenuRow => ({
              label: weaponText(w).name,
              kind: 'button',
              sub: () => t('shop.desc', { desc: weaponText(w).desc, stats: this.statText(w) }),
              value: () => (d.weapons.includes(w.id) ? t(d.equipped === w.id ? 'shop.equipped' : 'shop.ownedEquip') : t('gold', { n: w.price })),
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
        label: t('tabs.upgrades'),
        rows: () => [
          { label: t('shop.yourGold', { n: d.gold }), kind: 'info' },
          ...UPGRADES.map((u): MenuRow => {
            const owned = d.upgrades[u.id] ?? 0;
            const maxed = owned >= u.repeat;
            const price = upgradePrice(u, owned);
            return {
              label: u.repeat > 1 ? t('shop.count', { name: upgradeText(u).name, owned, max: u.repeat }) : upgradeText(u).name,
              kind: 'button',
              sub: () => upgradeText(u).desc,
              value: () => (maxed ? t('shop.owned') : t('gold', { n: price })),
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
    this.menu.open(t('shop.title', { name: npc.name, title: npc.title }), t('shop.sub'), tabs, 'weapons');
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
    this.hud.showToast(t(winged ? 'toast.wingedHorse' : 'toast.horse'), 2);
  }

  private togglePerf(): void {
    this.showPerf = !this.showPerf;
    if (!this.showPerf) this.hud.perf = '';
  }

  private readLore(stone: LoreStone): void {
    const lines = L().lore[stone.id];
    const list = Array.isArray(lines) ? lines : lines ? [lines] : [];
    if (!list.length) return;
    stone.read = true;
    this.reading = { stone, lines: list, i: 0 };
    this.sfx.readStone();
    this.player.talking = true;
    this.hud.showDialogue(tOr('lore.title', 'An inscription'), list[0], list.length === 1);
  }

  private closeReading(): void {
    this.reading = null;
    this.player.talking = false;
    this.input.cancelHolds();
    this.hud.hideDialogue();
  }

  /** The Ukaz horse race: start marker, checkpoints in order, horsemen on their horses. */
  private setupRace(level: import('./level').LevelData): void {
    const start = level.spawns.find((s) => (s.role as string) === 'race_start');
    const path = level.paths.race;
    if (!start || !path?.length) return;
    const v = (p: Vec3) => new THREE.Vector3(p[0], this.world.ground(p[0], p[2]), p[2]);
    const cps = level.spawns
      .filter((s) => (s.role as string) === 'race_checkpoint')
      .sort((a, b) => (a.id ?? '').localeCompare(b.id ?? '', undefined, { numeric: true }))
      .map((s) => v(s.pos));
    const riders: { npc: Npc; horse: Horse }[] = [];
    for (const hs of level.spawns.filter((s) => s.role === 'horse' && s.racer)) {
      const horse = this.horses.find((h) => Math.hypot(h.pos.x - hs.pos[0], h.pos.z - hs.pos[2]) < 1);
      const npc = this.npcs.npcs.find((n) => n.refId === hs.racer);
      if (horse && npc) {
        horse.racer = true;
        riders.push({ npc, horse });
      }
    }
    const hurdles = level.colliders.filter((c) => c.tag === 'hurdle').map((c) => v(c.pos));
    this.race = new Race(this.world.scene, { start: v(start.pos), checkpoints: cps, path: path.map(v), hurdles, riders, groundAt: (x, z) => this.world.ground(x, z) }, {
      tick: (n) => {
        this.sfx.ui(false);
        this.hud.showToast(t('race.tick', { n }), 0.9);
      },
      go: () => {
        this.sfx.raceStart();
        this.hud.showToast(t('race.go'), 1.2);
      },
      checkpoint: (i, of) => {
        this.sfx.checkpoint();
        this.hud.showToast(t('race.checkpoint', { i, of }), 1.2);
      },
      finish: (place, of) => {
        const gold = [300, 120, 60][place - 1] ?? 0;
        if (gold) this.progress.addGold(gold);
        if (place === 1) {
          this.sfx.questComplete();
          this.quests.raceWon(this.mapName);
          this.hud.showToast(t('race.won', { gold }), 4);
        } else if (gold) {
          this.sfx.coin();
          this.hud.showToast(t('race.placed', { place, of, gold }), 4);
        } else {
          this.sfx.denied();
          this.hud.showToast(t('race.lost'), 4);
        }
        setTimeout(() => this.race?.reset(), 4000);
      },
    });
  }

  /** An escort (Dumat's gods, al-Faw's Sabaean caravan): the keeper and the convoy camels on the quest's road. */
  private setupConvoy(level: import('./level').LevelData): void {
    const esc = escortIn(this.mapName);
    const path = esc ? level.paths[esc.path] : undefined;
    if (!esc || !path?.length) return;
    const keeper = this.npcs.npcs.find((n) => n.refId === esc.keeper);
    const camels = level.spawns
      .filter((s) => s.role === 'camel' && s.convoy)
      .map((s) => this.camels.find((c) => Math.hypot(c.rig.root.position.x - s.pos[0], c.rig.root.position.z - s.pos[2]) < 0.6))
      .filter((c): c is Camel => !!c);
    if (!keeper) return;
    for (const c of camels) c.convoy = true;
    const v = (p: Vec3) => new THREE.Vector3(p[0], this.world.ground(p[0], p[2]), p[2]);
    this.convoy = new Convoy(path.map(v), keeper, camels, (x, z) => this.world.ground(x, z), () => {
      this.sfx.questComplete();
      this.quests.finished('escort', this.mapName);
    });
  }

  /** Siege objectives: when the player reaches the place, waves come from the markers. */
  private updateSiege(dt: number): void {
    const obj = this.quests.current('siege', this.mapName);
    if (!obj) {
      this.siege = null;
      return;
    }
    const lm = this.world.level.landmarks[obj.landmark];
    const p = this.player.pos;
    if (!this.siege) {
      if (!lm || Math.hypot(lm[0] - p.x, lm[2] - p.z) > 70) return;
      this.siege = { wave: -1, foes: [], pause: 1.5 };
      this.hud.showToast(t('siege.start'), 3);
      this.sfx.raceStart();
    }
    const s = this.siege;
    if (s.foes.some((f) => !f.dead)) return;
    s.pause -= dt;
    if (s.pause > 0) return;
    s.wave++;
    if (s.wave >= obj.waves.length) {
      this.siege = null;
      this.hud.showToast(t('siege.held'), 3);
      this.quests.finished('siege', this.mapName);
      return;
    }
    const w = obj.waves[s.wave];
    const at = this.world.level.spawns.find((x) => (x.role as string) === 'wave_spawn' && x.id === w.marker);
    if (!at) return;
    s.foes = w.foes.map((spec, i) => {
      const [kind, variant] = spec.split(':');
      const a = (i / w.foes.length) * Math.PI * 2;
      const x = at.pos[0] + Math.sin(a) * 3;
      const z = at.pos[2] + Math.cos(a) * 3;
      const e = this.enemies.spawn({ role: 'enemy', kind, variant, camp: `siege_${s.wave}`, pos: [x, this.world.floor(x, z, at.pos[1] + 1), z], yaw: at.yaw } as Spawn);
      e.onKilled = (f) => this.onEnemyKilled(f);
      return e;
    });
    s.pause = 4;
    this.hud.showToast(t('siege.wave', { n: s.wave + 1, of: obj.waves.length }), 2.5);
    this.sfx.alert(0, 1);
  }

  /** Inside the truce circle (Ukaz): no one may strike. */
  private inTruce(p: THREE.Vector3): boolean {
    const tr = this.world.level.truce;
    return !!tr && Math.hypot(p.x - tr.center[0], p.z - tr.center[2]) < tr.radius;
  }

  /** Night for night-only foes: after dusk, before dawn. */
  private isNight(): boolean {
    const h = this.day.hours;
    return h >= 19.6 || h < 5.6;
  }

  /** Debug: drop a group of a given enemy kind a short way ahead of the player. */
  private debugSpawnFoes(kind: string, n: number, dist: number): void {
    const p = this.player.pos;
    const a = this.player.yaw;
    for (let i = 0; i < n; i++) {
      const ang = a + (i - (n - 1) / 2) * 0.35;
      let x = p.x + Math.sin(ang) * dist;
      let z = p.z + Math.cos(ang) * dist;
      if (this.world.nav.isBlocked(x, z)) {
        x = p.x + Math.sin(ang) * dist * 0.5;
        z = p.z + Math.cos(ang) * dist * 0.5;
      }
      const e = this.enemies.spawn({ role: 'enemy', kind, camp: 'debug', pos: [x, this.world.floor(x, z, p.y + 1), z], yaw: a + Math.PI } as Spawn);
      e.onKilled = (f) => this.onEnemyKilled(f);
    }
    this.hud.showToast(tOr(`debug.spawned.${kind}`, t('debug.foesAppear', { n, kind: tOr(`enemies.${kind}`, kind) }), { n }), 2);
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
    // Poets recite (quest talk comes first).
    const poem = quest ? null : npc.recite();
    const lines = quest ? quest.lines : poem ? poem.lines : npc.startTalk();
    if (quest) npc.startTalk();
    this.dialogue = { npc, lines: quest || poem ? lines : withFiller(lines, npc.name), i: 0, onDone: quest?.onDone, voice: voiceOf(npc), verse: poem?.verse };
    this.player.talking = true;
    // Turn to face the stranger.
    this.player.yawTarget = Math.atan2(npc.pos.x - this.player.pos.x, npc.pos.z - this.player.pos.z);
    this.player.moveDir.set(Math.sin(this.player.yawTarget), 0, Math.cos(this.player.yawTarget));
    this.showLine();
  }

  private showLine(): void {
    const d = this.dialogue!;
    const verse = !!d.verse?.[d.i];
    // Each couplet opens with a phrase on the oud.
    if (verse && d.shown !== d.i) this.sfx.recite();
    d.shown = d.i;
    this.hud.showDialogue(`${d.npc.name} — ${d.npc.title}`, d.lines[d.i], d.i === d.lines.length - 1, verse);
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
    const frameStart = now;
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
    this.lastFrame = f;
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
      p.peaceful = this.inTruce(p.pos);
      this.truceToastT -= dt;
      p.update(dt, f, this.cam);
      this.npcs.update(dt, p, p.pos);
      this.enemies.update(dt, p, this.isNight());
      this.projectiles.update(dt, p.dead ? null : p.pos);
      this.race?.update(dt, p.pos, !!p.horse);
      this.updateSiege(dt);
      if (this.convoy && !this.convoy.running && !this.convoy.done && this.quests.current('escort', this.mapName)) this.convoy.start();
      this.convoy?.update(dt, p.pos);
      for (const h of this.horses) {
        if (h === p.horse || (h.racer && this.race?.running)) continue;
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
      const nextGate = this.quests.nextUse(this.mapName)?.target;
      for (const s of this.sluices) {
        s.setHighlight(s.id === nextGate);
        s.update(dt);
      }
      for (const l of this.loreStones) l.update();
      // Visit objectives: reaching the place is enough.
      this.visitT -= dt;
      if (this.visitT <= 0 && !p.dead) {
        this.visitT = 0.5;
        const lm = this.world.level.landmarks;
        this.quests.visit(this.mapName, (o) => {
          const at = lm[o.landmark];
          if (!at || Math.hypot(at[0] - p.pos.x, at[2] - p.pos.z) >= (o.radius ?? 7)) return false;
          return o.below !== undefined ? p.pos.y < at[1] + o.below && p.pos.y > at[1] - 1.5 : Math.abs(at[1] - p.pos.y) < 6;
        });
      }
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
    this.cam.aiming = p.aiming && this.cam.thirdPerson;
    this.cam.occlusion = (o, d, max) => this.physics.rayStatic(o, d, max);
    this.cam.groundAt = (x, z) => this.world.ground(x, z);
    this.cam.update(realDt, focus);
    // Overhead views float the map in darkness; third person keeps the sky.
    const overhead = !this.cam.thirdPerson && !this.cam.override;
    this.world.setEdgeFade(overhead);
    this.day.skyVisible = !overhead;
    // Bow: aim arc and HUD.
    const aiming = !paused && p.aiming && !!p.aim && p.drawK > 0.15;
    this.projectiles.preview(aiming ? p.aim!.from : null, aiming ? p.aim!.vel : null);
    this.hud.setCrosshair(this.cam.thirdPerson && !paused, p.drawK, p.aiming);
    this.hud.setAmmo(this.progress.hasBow && p.hasBow ? this.progress.data.arrows : null, ARROW.max);
    this.world.update(realDt, p.pos, this.cam.zoom);
    this.world.setFogOffset(this.cam.targetDepth);

    this.hud.setVitals(p.hp, p.maxHp, p.stamina, p.maxStamina, p.isExhausted, realDt);
    this.hud.setPurse(this.progress.data.gold, this.progress.data.flasks, this.progress.maxFlasks);
    const race = this.race?.state === 'running' ? this.race : null;
    const escort = this.convoy?.running ? this.convoy : null;
    const siegeObj = this.siege ? this.quests.current('siege', this.mapName) : null;
    this.hud.setTracker(
      paused
        ? null
        : race
          ? t('race.tracker', { i: Math.min(race.checkpoint + 1, race.of), of: race.of, place: race.standing(p.pos) })
          : escort
            ? t('convoy.tracker', { n: Math.round(escort.progress * 100) })
            : siegeObj && this.siege
              ? t('siege.tracker', { n: Math.max(1, this.siege.wave + 1), of: siegeObj.waves.length })
              : this.quests.trackerText(),
    );
    // A boss's health bar while fighting it.
    const boss = paused ? null : (this.enemies.humans.find((e) => (e as Enemy).boss && !e.dead && e.engaged && Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < 45) ?? null);
    this.hud.setBoss(boss ? boss.title : null, boss ? boss.hp / boss.maxHp : 1, realDt);
    this.updateEnemyBars(paused);
    this.updateHints();
    if (this.frameNo % 2 === 0) this.drawMinimap();
    this.hud.update(realDt, this.fps);
    this.world.setNightGlow(this.day.grade);
    this.updateCutout();
    for (const b of this.beacons) (b.material as THREE.ShaderMaterial).uniforms.opacity.value = 0.26 + 0.08 * Math.sin(now / 400);
    const t0 = this.showPerf ? performance.now() : 0;
    this.renderer.render(this.world.scene, this.cam.camera);
    this.day.renderGrade(this.renderer);
    if (this.showPerf) {
      const r = this.renderer.info.render;
      this.perfAcc += performance.now() - frameStart;
      this.perfN++;
      if (this.perfN >= 20) {
        this.hud.perf = `${(this.perfAcc / this.perfN).toFixed(1)} ms cpu · render ${(performance.now() - t0).toFixed(1)} ms · ${r.calls} draws · ${(r.triangles / 1000).toFixed(0)}k tris`;
        this.perfAcc = 0;
        this.perfN = 0;
      }
    }
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
    for (const e of this.enemies.list) if (!e.dead && e.moving) walkers.push({ key: e, x: e.pos.x, z: e.pos.z, y: e.pos.y, run: e.running });
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
    // A musician's kinnara carries across the camp.
    this.lyreT -= dt;
    if (this.lyreT <= 0) {
      this.lyreT = 1.4 + Math.random() * 1.2;
      for (const n of this.npcs.npcs) {
        if (n.dead || n.role !== 'musician') continue;
        const d = Math.hypot(n.pos.x - pos.x, n.pos.z - pos.z);
        if (d < 18) sfx.lyre(this.pan(n.pos.x, n.pos.z), 1 - d / 18);
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
    // A raider spotting you shouts (beasts growl and screech on their own).
    for (const e of this.enemies.humans) {
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
    const boss = fighting && this.enemies.humans.some((e) => e.boss && e.engaged && !e.dead && Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) < 45);
    const sacred = !!this.reading || this.sacredSpots.some(([x, z]) => Math.hypot(x - pos.x, z - pos.z) < 26);
    if (boss) mood = 'boss';
    else if (fighting) mood = 'combat';
    else if (this.mapName === 'raider_fort') mood = 'stronghold';
    else if (sacred) mood = 'sacred';
    else if (this.day.grade > 0.6) mood = 'night';
    else if (crowd > 3 && !['wadi', 'cliffs', 'ruined_temple'].includes(this.mapName)) mood = 'town';
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
      this.floatAt(p, 2.2, t('float.recovered', { n: lg.amount }), 'gold');
      this.hud.showToast(t('toast.recovered'), 2.5);
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
    cutout.uCutRadius.value = this.player.dead || (this.menu.isOpen && this.cam.focus) ? 0 : (this.cam.thirdPerson ? 0.9 : CUT_RADIUS) / halfH;
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
    if (this.cam.thirdPerson && (f.lookYaw || f.lookPitch)) this.cam.look(f.lookYaw, f.lookPitch);

    const p = this.player;
    const k = (a: Action) => this.hud.key(a);
    if (this.reading) {
      // Reading an inscription: next line, or step away / cancel to stop.
      const r = this.reading;
      const far = Math.hypot(r.stone.pos.x - p.pos.x, r.stone.pos.z - p.pos.z) > USE_RANGE + 2;
      if (f.cancel || far || Math.hypot(f.moveX, f.moveY) > 0.5 || f.attack || f.dodge) this.closeReading();
      else if ((f.interact || f.confirm) && this.hud.typing) this.hud.finishTyping();
      else if (f.interact || f.confirm) {
        r.i++;
        if (r.i >= r.lines.length) this.closeReading();
        else this.hud.showDialogue(tOr('lore.title', 'An inscription'), r.lines[r.i], r.i === r.lines.length - 1);
      }
      f.interact = f.jump = f.pause = f.attack = f.dodge = f.heal = false;
      this.hud.setPrompt(null);
      return;
    }
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
    const lore = p.horse || npc || pickup ? null : this.near(this.loreStones, USE_RANGE + 0.6);
    const sluice = p.horse || npc || pickup || lore ? null : this.near(this.sluices, USE_RANGE + 0.4);
    const fire = p.horse || npc || pickup || lore || sluice ? null : this.near(this.bonfires, USE_RANGE);
    const chest = p.horse || npc || pickup || fire ? null : this.near(this.chests.filter((c) => !c.opened), USE_RANGE);
    const atLine = !npc && !pickup && this.race && this.race.state === 'idle' && Math.hypot(this.race.startPos.x - p.pos.x, this.race.startPos.z - p.pos.z) < 9;
    const exit = npc || pickup || lore || sluice || fire || chest || atLine ? null : this.nearestExit();
    let prompt: string | null = null;
    if (npc) {
      const icon = this.quests.iconFor(this.npcRef(npc));
      const verb = t(icon === 'turnin' ? 'prompt.handIn' : icon === 'quest' ? 'prompt.talkTo' : npc.shop ? 'prompt.tradeWith' : 'prompt.talkTo');
      prompt = `${k('talk')} ${t('prompt.npc', { verb, name: npc.name, title: npc.title.toLowerCase() })}`;
    } else if (pickup) prompt = `${k('talk')} ${t('prompt.take', { label: this.pickupLabel(pickup) })}`;
    else if (lore) prompt = `${k('talk')} ${tOr('lore.prompt', 'Read the inscription')}`;
    else if (sluice) prompt = `${k('talk')} ${t(sluice.open ? 'sluice.close' : 'sluice.open')}`;
    else if (fire) prompt = `${k('talk')} ${t(fire.lit ? 'prompt.rest' : 'prompt.kindle')}`;
    else if (chest) prompt = `${k('talk')} ${t(chest.buried ? 'dig.prompt' : 'prompt.chest')}`;
    else if (atLine) prompt = p.horse ? `${k('talk')} ${t('race.prompt')}` : t('race.needHorse');
    else if (exit) prompt = `${k('talk')} ${this.exitLabel(exit)}`;
    else if (p.horse) prompt = `${k('mount')} ${t('prompt.dismount')}`;
    else if (horse) prompt = `${k('mount')} ${t(horse.winged ? 'prompt.mountWinged' : 'prompt.mountHorse')}`;
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
          this.hud.showToast(L().free[id]?.message ?? id, 4.5);
        } else {
          this.quests.picked(pickup.item);
          this.hud.showToast(t('toast.took', { label: this.pickupLabel(pickup) }), 2.5);
        }
        this.sfx.pickup();
      } else if (fire) {
        this.restAt(fire);
      } else if (lore) {
        this.readLore(lore);
      } else if (sluice) {
        this.useSluice(sluice);
      } else if (chest) {
        this.openChest(chest);
      } else if (atLine && p.horse) {
        this.race!.start();
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
    else if (this.dialogue) items = [['next', t('hints.continue')], ['leave', t('hints.leave')]];
    else if (this.player.horse)
      items = [['move', t('hints.ride')], ['run', t('hints.gallop')], ['attack', t('hints.attack')], ['jump', t('hints.jump')], ['mount', t('hints.dismount')], ['map', t('hints.map')], ['pause', t('hints.menu')]];
    else {
      const bow = this.player.hasBow;
      items = [['move', t('hints.move')], ['run', t('hints.sprint')], ['attack', t(bow ? 'hints.loose' : 'hints.attack')], ['dodge', t('hints.roll')], ['jump', t(P.doubleJump ? 'hints.jump2' : 'hints.jump')], ['camera', t(this.cam.thirdPerson ? 'hints.look' : 'hints.camera')]];
      if (bow) items.push(['block', t('hints.aim')]);
      else if (P.shield) items.push(['block', t('hints.block')]);
      if (P.data.flasks > 0) items.push(['heal', t('hints.heal')]);
      items.push(['talk', t('hints.use')], ['map', t('hints.map')], ['inventory', t('hints.menu')]);
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
          frac: e.hp / e.maxHp,
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
      else if (n.shop) m.push({ x: n.pos.x, z: n.pos.z, kind: 'shop', label: full ? t('markers.trader') : undefined });
    }
    for (const e of this.enemies.list) if (!e.dead) m.push({ x: e.pos.x, z: e.pos.z, kind: 'enemy' });
    for (const h of this.horses) if (h !== this.player.horse) m.push({ x: h.pos.x, z: h.pos.z, kind: 'horse' });
    for (const c of this.camels) m.push({ x: c.rig.root.position.x, z: c.rig.root.position.z, kind: 'camel' });
    for (const e of this.exits) m.push({ x: e.pos[0], z: e.pos[2], kind: 'exit', label: full ? t('markers.to', { map: this.mapTitle(e.to) }) : undefined });
    for (const b of this.bonfires) m.push({ x: b.pos.x, z: b.pos.z, kind: 'bonfire', label: full ? t(b.lit ? 'markers.bonfire' : 'markers.bonfireUnlit') : undefined });
    // Chests: only the ones on the beaten path show before they are found.
    for (const c of this.chests) if (!c.opened && !c.secret) m.push({ x: c.pos.x, z: c.pos.z, kind: 'chest' });
    for (const k of this.pickups) m.push({ x: k.pos.x, z: k.pos.z, kind: 'objective', label: full ? this.pickupLabel(k) : undefined });
    // The convoy's head, and the place under siege.
    if (this.convoy?.running) m.push({ x: this.convoy.head.x, z: this.convoy.head.z, kind: 'objective' });
    const so = this.quests.current('siege', this.mapName);
    const sl0 = so && this.world.level.landmarks[so.landmark];
    if (sl0) m.push({ x: sl0[0], z: sl0[2], kind: 'objective' });
    // The next sluice of a rota, and places to visit.
    const gate = this.quests.nextUse(this.mapName);
    const sl = gate && this.sluices.find((s) => s.id === gate.target);
    if (sl) m.push({ x: sl.pos.x, z: sl.pos.z, kind: 'objective', label: full ? tOr(`sluice.names.${sl.id}`, sl.id) : undefined });
    for (const a of this.quests.active()) {
      if (a.obj?.kind === 'visit' && objMap(a.obj) === (this.mapEntry(this.mapName).variant_of ?? this.mapName)) {
        const at = this.world.level.landmarks[a.obj.landmark];
        if (at) m.push({ x: at[0], z: at[2], kind: 'objective', label: full ? questText(a.q.id).title : undefined });
      }
    }
    if (this.lostPile) m.push({ x: this.lostPile.pos.x, z: this.lostPile.pos.z, kind: 'gold', label: full ? t('markers.gold') : undefined });
    // Objectives in another region: mark the exit that leads there.
    const elsewhere = new Set(this.quests.active().map((a) => (a.obj ? objMap(a.obj) : a.q.giver.map)).filter((mp) => !sameMap(mp, this.mapName)));
    for (const e of this.exits) if (elsewhere.has(e.to)) m.push({ x: e.pos[0], z: e.pos[2], kind: 'objective' });
    // Kill objectives in this map: mark the camp.
    for (const a of this.quests.active()) {
      if (a.obj?.kind === 'kill_camp' && sameMap(a.obj.map, this.mapName)) {
        const c = this.enemies.camps().find((x) => x.camp === (a.obj as { camp: string }).camp);
        if (c && c.alive > 0) m.push({ x: c.x, z: c.z, kind: 'objective', label: full ? questText(a.q.id).title : undefined });
      }
    }
    if (full) {
      for (const c of this.enemies.camps()) if (c.alive > 0) m.push({ x: c.x, z: c.z, kind: 'camp', label: t('markers.camp', { camp: this.campName(c.camp), n: c.alive }) });
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
      if (h.racer) continue;
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
  if (msg) msg.textContent = t('loading.failed', { error: String(e) });
});
