import * as THREE from 'three';
import { Camel, Horse } from './animals';
import { FollowCamera } from './camera';
import { CharacterFactory, PLAYER_LOOKS } from './characters';
import type { HitResult } from './combat';
import { EnemySystem } from './enemy';
import { Glints, Particles, Sfx, TimeScale } from './fx';
import { Hud, type Action, type EnemyBar } from './hud';
import { Input, type Frame } from './input';
import { PauseMenu } from './menu';
import { Minimap, type MapMarker } from './minimap';
import { type Npc, NpcSystem } from './npc';
import { Physics } from './physics';
import { Player } from './player';
import { DayCycle, timeLabel } from './sky';
import { mulberry32 } from './util';
import type { Exit } from './level';
import { cutout, loadCommon, loadMap, World, type CommonAssets, type MapEntry } from './world';

const TALK_RANGE = 2.4;
/** See-through radius around the player, metres. */
const CUT_RADIUS = 2.6;
const MOUNT_RANGE = 2.8;

const ROBES: (number | null)[] = [null, 0xf1ece0, 0x2c3e73, 0x7b2a24, 0xc9902e, 0x2f6d4f, 0x5b2d6e, 0x2b2622, 0xb8a48a];
const FLOW: { label: string; on: boolean; speed: number }[] = [
  { label: 'Stopped', on: false, speed: 0 },
  { label: 'Slow (1 h / min)', on: true, speed: 1 / 60 },
  { label: 'Fast (1 h / 10 s)', on: true, speed: 1 / 10 },
];

class Game {
  renderer: THREE.WebGLRenderer;
  cam = new FollowCamera();
  input: Input;
  hud: Hud;
  sfx = new Sfx();
  time = new TimeScale();
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
  menu!: PauseMenu;
  horses: Horse[] = [];
  camels: Camel[] = [];
  dialogue: { npc: Npc; lines: string[]; i: number } | null = null;
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
    this.factory = new CharacterFactory(c.person, c.horse, c.camel, c.personClips);

    const hudRoot = document.getElementById('hud')!;
    this.menu = new PauseMenu(hudRoot, this.menuHost(), this.hud, () => {
      this.cam.focus = false;
      this.minimap?.setVisible(true);
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Backquote' && this.debugObj) this.debugObj.visible = !this.debugObj.visible;
    });

    await this.enterMap(c.maps.start, null);
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

  /** Travel to another map through an exit. */
  async travel(to: string): Promise<void> {
    if (this.travelling) return;
    this.closeDialogue();
    await this.enterMap(to, this.mapName);
  }

  /**
   * Load (or reuse) a map and rebuild everything that lives in it. The player
   * keeps HP, stamina and looks; horses, camels and people belong to the map.
   */
  private async enterMap(name: string, from: string | null): Promise<void> {
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
    const prev = this.player ? { hp: this.player.hp, stamina: this.player.stamina, look: this.player.lookIndex } : null;
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

    // Arrival: the spawn marked `from: <previous map>`, else the default one.
    const spawns = level.spawns.filter((s) => s.role === 'player');
    const ps = (from && spawns.find((s) => s.from === from)) || spawns.find((s) => !s.from) || spawns[0];
    const at = new THREE.Vector3(...ps.pos);
    at.y = this.world.ground(at.x, at.z);
    this.player = new Player(factory, this.physics, at, ps.yaw, this.playerEvents());
    if (prev) {
      this.player.hp = Math.max(1, prev.hp);
      this.player.stamina = prev.stamina;
    }
    if (prev && (prev.look !== 0 || this.robe !== 0)) this.player.setLook(prev.look, ROBES[this.robe] ?? undefined);
    scene.add(this.player.rig.root);

    this.npcs = new NpcSystem(this.world, factory, scene, this.sfx);
    this.enemies = new EnemySystem(this.world, factory, scene, this.sfx);
    this.horses = [];
    this.camels = [];
    for (const s of level.spawns) {
      if (s.role === 'horse') {
        const h = new Horse(factory, this.physics, s, rnd);
        this.horses.push(h);
        scene.add(h.rig.root);
      } else if (s.role === 'camel') {
        const c = new Camel(factory, this.physics, s, rnd);
        this.camels.push(c);
        scene.add(c.rig.root);
      }
    }
    this.enemies.setTellFx((follow) => this.glints.spawn(follow));
    const tmp = new THREE.Vector3();
    this.npcs.onTell = (n) => {
      const hand = n.rig.bones.get('hand_R');
      this.glints.spawn(() => (hand ? hand.getWorldPosition(tmp) : tmp.copy(n.pos)));
    };
    this.npcs.onDeathCb = (n) => this.hud.showToast(`${n.name} the ${n.title.toLowerCase()} has fallen.`);

    // Exits: a soft light pillar over each cairn.
    this.exits = level.exits ?? [];
    const beamGeo = new THREE.CylinderGeometry(0.25, 0.55, 10, 12, 1, true);
    for (const e of this.exits) {
      // Fades out upward so it reads as a shaft of light, not a solid post.
      const mat = new THREE.ShaderMaterial({
        uniforms: { opacity: { value: 0.3 } },
        vertexShader: 'varying float vY; void main() { vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform float opacity; varying float vY; void main() { gl_FragColor = vec4(vec3(1.0, 0.82, 0.5) * opacity * pow(1.0 - vY, 1.6), 1.0); }',
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(beamGeo, mat);
      m.position.set(e.pos[0], this.world.ground(e.pos[0], e.pos[2]) + 5, e.pos[2]);
      this.beacons.push(m);
      scene.add(m);
    }

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
    this.day.dispose();
    this.physics.world.free();
    this.dialogue = null;
    this.hud.hideDialogue();
  }

  private playerEvents() {
    return {
      hurt: (dmg: number, heavy: boolean) => this.onPlayerHurt(dmg, heavy),
      death: () => {
        this.closeDialogue();
        this.sfx.death();
        this.time.slowmo(1.2, 0.35);
        this.hud.showToast('YOU DIED', 3.5);
      },
      respawn: () => {
        this.npcs.calmGuards();
        this.enemies.resetAll();
        this.hud.showToast('You wake where you arrived. The raiders have regrouped.', 3.5);
      },
      swing: () => this.sfx.swing(),
      jump: () => this.sfx.roll(),
      land: () => {
        this.sfx.land();
        const p = this.player.pos;
        this.particles.burst(new THREE.Vector3(p.x, p.y + 0.05, p.z), 8, { color: 0xd9b58a, speed: 1.8, up: 0.8, size: 0.11, life: 0.45, gravity: 3 });
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
      aim: (o: THREE.Vector3, yaw: number) => this.enemies.aimTarget(o, yaw, 3.4, THREE.MathUtils.degToRad(55))?.pos ?? null,
    };
  }

  private menuHost() {
    return {
      getTime: () => this.day.hours,
      timeLabel: () => timeLabel(this.day.hours),
      setTime: (h: number) => this.day.set(h),
      flowLabel: () => FLOW[this.flow].label,
      cycleFlow: (d: number) => {
        this.flow = (this.flow + d + FLOW.length) % FLOW.length;
        this.day.flowing = FLOW[this.flow].on;
        this.day.speed = FLOW[this.flow].speed;
      },
      lookName: () => PLAYER_LOOKS[this.player.lookIndex].name,
      cycleLook: (d: number) => this.applyLook(this.player.lookIndex + d),
      robeColour: () => {
        const c = ROBES[this.robe] ?? PLAYER_LOOKS[this.player.lookIndex].colours.P_Robe;
        return `#${c.toString(16).padStart(6, '0')}`;
      },
      cycleRobe: (d: number) => {
        this.robe = (this.robe + d + ROBES.length) % ROBES.length;
        this.applyLook(this.player.lookIndex);
      },
      cameraLabel: () => (this.cam.usePerspective ? 'Perspective' : 'Orthographic'),
      toggleCamera: () => {
        this.cam.usePerspective = !this.cam.usePerspective;
      },
      mapLabel: () => ['Small', 'Large', 'Off'][this.minimap.mode],
      cycleMap: (d: number) => {
        for (let i = 0; i < (d > 0 ? 1 : 2); i++) this.minimap.cycle();
        this.minimap.setVisible(false);
      },
      volume: () => this.sfx.volume,
      setVolume: (v: number) => this.sfx.setVolume(v),
      uiSound: (c: boolean) => this.sfx.ui(c),
    };
  }

  private applyLook(i: number): void {
    const old = this.player.setLook(i, ROBES[this.robe] ?? undefined);
    old.removeFromParent();
    this.world.scene.add(this.player.rig.root);
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.cam.resize(w, h);
  }

  // --- game feel ---------------------------------------------------------------

  private onPlayerHit(results: HitResult[]): void {
    if (this.dialogue) this.closeDialogue();
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
    this.sfx.hit(killed);
    this.time.hitstop(killed ? 0.13 : 0.075);
    this.cam.addTrauma(killed ? 0.45 : 0.28);
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

  private openDialogue(npc: Npc): void {
    const lines = npc.startTalk();
    this.dialogue = { npc, lines, i: 0 };
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

  private closeDialogue(): void {
    if (!this.dialogue) return;
    this.dialogue.npc.endTalk();
    this.dialogue = null;
    this.player.talking = false;
    this.hud.hideDialogue();
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

    if (this.menu.isOpen) this.menu.update(f);
    else this.handleInput(f);
    const paused = this.menu.isOpen;
    const dt = paused ? 0 : this.time.apply(realDt);

    const p = this.player;
    if (!paused) {
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
      this.physics.step();
    }
    this.day.update(dt, this.cam.camera.position);

    const focus = p.pos.clone();
    focus.y += p.horse ? 1.6 : 1.0;
    this.cam.update(realDt, focus);
    this.world.update(realDt, p.pos, this.cam.zoom);
    this.world.setFogOffset(this.cam.targetDepth);

    this.hud.setVitals(p.hp, p.maxHp, p.stamina, p.maxStamina, p.isExhausted, realDt);
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
    cutout.uCutRadius.value = this.player.dead || this.menu.isOpen ? 0 : CUT_RADIUS / halfH;
  }

  private nearestExit(): Exit | null {
    const p = this.player.pos;
    for (const e of this.exits) if (Math.hypot(e.pos[0] - p.x, e.pos[2] - p.z) < e.radius) return e;
    return null;
  }

  private handleInput(f: Frame): void {
    if (f.zoom) this.cam.zoomBy(f.zoom);
    if (f.rotate) this.cam.rotateBy(f.rotate);
    if (f.map) this.minimap.cycle();

    const p = this.player;
    const k = (a: Action) => this.hud.key(a);
    if (this.dialogue) {
      const d = this.dialogue;
      const far = Math.hypot(d.npc.pos.x - p.pos.x, d.npc.pos.z - p.pos.z) > TALK_RANGE + 3;
      if (f.cancel || far || d.npc.dead || p.dead) {
        this.closeDialogue();
      } else if (f.interact || f.confirm) {
        d.i++;
        if (d.i >= d.lines.length) this.closeDialogue();
        else this.showLine();
      } else if (f.attack || f.dodge || Math.hypot(f.moveX, f.moveY) > 0.5) {
        this.closeDialogue();
      }
      f.interact = false;
      f.jump = false;
      f.pause = false;
      f.attack = false;
      f.dodge = false;
      this.hud.setPrompt(null);
      return;
    }
    if (f.pause) {
      this.menu.open();
      this.cam.focus = true;
      this.minimap.setVisible(false);
      this.hud.setPrompt(null);
      return;
    }
    if (p.dead) {
      this.hud.setPrompt(null);
      return;
    }
    const horse = p.horse ? null : this.nearestHorse();
    const npc = p.horse ? null : this.npcs.nearestTalkable(p.pos, TALK_RANGE);
    const exit = npc ? null : this.nearestExit();
    let prompt: string | null = null;
    if (exit) prompt = `${k('talk')} ${exit.label}`;
    else if (p.horse) prompt = `${k('mount')} Dismount`;
    else if (npc) prompt = `${k('talk')} Talk to ${npc.name} <i>(${npc.title.toLowerCase()})</i>`;
    else if (horse) prompt = `${k('mount')} Mount horse`;
    this.hud.setPrompt(prompt);
    // One interact button: talk if someone is in reach, else mount / dismount.
    if (f.interact && !p.attacking && !p.rolling && !p.jumping) {
      if (exit) {
        void this.travel(exit.to);
      } else if (npc) {
        this.openDialogue(npc);
        f.attack = false;
      } else if (p.horse) p.dismount(this.world);
      else if (horse) p.mount(horse);
    }
  }

  private updateHints(): void {
    let items: [Action, string][];
    if (this.menu.isOpen) items = [];
    else if (this.dialogue) items = [['next', 'Continue'], ['leave', 'Leave']];
    else if (this.player.horse)
      items = [['move', 'Ride'], ['run', 'Gallop'], ['attack', 'Attack'], ['mount', 'Dismount'], ['map', 'Map'], ['pause', 'Menu']];
    else
      items = [['move', 'Move'], ['run', 'Sprint'], ['attack', 'Attack'], ['dodge', 'Roll'], ['jump', 'Jump'], ['talk', 'Talk / Mount'], ['map', 'Map'], ['pause', 'Menu']];
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

  private drawMinimap(): void {
    const m: MapMarker[] = [];
    for (const n of this.npcs.npcs) m.push({ x: n.pos.x, z: n.pos.z, kind: n.dead ? 'dead' : n.role === 'guard' ? (n.hostile ? 'hostile' : 'guard') : 'npc' });
    for (const e of this.enemies.list) if (!e.dead) m.push({ x: e.pos.x, z: e.pos.z, kind: 'enemy' });
    for (const h of this.horses) if (h !== this.player.horse) m.push({ x: h.pos.x, z: h.pos.z, kind: 'horse' });
    for (const c of this.camels) m.push({ x: c.rig.root.position.x, z: c.rig.root.position.z, kind: 'camel' });
    for (const e of this.exits) m.push({ x: e.pos[0], z: e.pos[2], kind: 'exit' });
    this.minimap.draw(this.player.pos.x, this.player.pos.z, this.player.yaw, this.cam.yaw, m);
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
