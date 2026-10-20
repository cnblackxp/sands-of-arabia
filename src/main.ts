import * as THREE from 'three';
import { Camel, Horse } from './animals';
import { FollowCamera } from './camera';
import { CharacterFactory } from './characters';
import { HURT_LINES } from './dialogue';
import { Hud } from './hud';
import { Input } from './input';
import { type Npc, NpcSystem } from './npc';
import { Physics } from './physics';
import { Player } from './player';
import { mulberry32 } from './util';
import { loadAssets, World } from './world';

const TALK_RANGE = 2.4;
const MOUNT_RANGE = 2.8;

class Game {
  renderer: THREE.WebGLRenderer;
  cam = new FollowCamera();
  input: Input;
  hud: Hud;
  physics = new Physics();
  world!: World;
  player!: Player;
  npcs!: NpcSystem;
  horses: Horse[] = [];
  camels: Camel[] = [];
  dialogue: { npc: Npc; lines: string[]; i: number } | null = null;
  private last = performance.now();
  private fpsAcc = 0;
  private fpsFrames = 0;
  fps = 60;
  private camelFrame = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.input = new Input(canvas);
    this.hud = new Hud(document.getElementById('hud')!);
    window.addEventListener('resize', () => this.resize());
  }

  async start(): Promise<void> {
    const bar = document.querySelector('#loading .bar div') as HTMLDivElement;
    const msg = document.querySelector('#loading .msg') as HTMLDivElement;
    const [assets] = await Promise.all([
      loadAssets((f, label) => {
        bar.style.width = `${f * 100}%`;
        msg.textContent = `Loaded ${label}`;
      }),
      this.physics.init(),
    ]);
    this.world = new World(this.renderer, assets, this.physics);
    const scene = this.world.scene;
    const factory = new CharacterFactory(assets.person, assets.horse, assets.camel);
    const rnd = mulberry32(21);

    const ps = assets.level.spawns.find((s) => s.role === 'player')!;
    const at = new THREE.Vector3(...ps.pos);
    at.y = this.world.ground(at.x, at.z);
    this.player = new Player(factory, this.physics, at, ps.yaw);
    scene.add(this.player.rig.root);

    this.npcs = new NpcSystem(this.world, factory, scene);
    for (const s of assets.level.spawns) {
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

    this.player.onHurt = () => this.hud.hurtFlash();
    this.player.onDeath = () => {
      this.closeDialogue();
      this.hud.showToast('You have fallen…', 3.5);
    };
    this.player.onRespawn = () => {
      this.npcs.calmGuards();
      this.hud.showToast('You wake at the edge of the market.', 3);
    };
    this.player.onHit = (killed) => {
      if (this.dialogue) this.closeDialogue();
      if (!killed) this.hud.showToast(`“${this.shout()}”`, 1.4);
    };
    this.npcs.onDeathCb = (n) => this.hud.showToast(`${n.name} the ${n.title.toLowerCase()} has fallen.`);

    const debug = this.world.colliderDebug();
    debug.visible = false;
    scene.add(debug);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Backquote') debug.visible = !debug.visible;
    });

    this.physics.step();
    this.cam.snap(this.player.pos);
    this.resize();
    // Compile shaders before the first frame to avoid a hitch.
    this.renderer.compile(scene, this.cam.camera);
    document.getElementById('loading')!.classList.add('done');
    this.canvas.focus();
    this.renderer.setAnimationLoop(() => this.frame());
    // Embedded previews can stall requestAnimationFrame while the page is still
    // visible; keep ticking from a timer until rAF comes back.
    setInterval(() => {
      if (performance.now() - this.last > 120) this.frame();
    }, 33);
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.cam.resize(w, h);
  }

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

  private frame(): void {
    const now = performance.now();
    const rawDt = (now - this.last) / 1000;
    this.last = now;
    const dt = Math.min(rawDt, 1 / 20);
    this.fpsAcc += rawDt;
    this.fpsFrames++;
    if (this.fpsAcc > 0.5) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }

    const f = this.input.read(dt);
    this.hud.setDevice(f.device);
    if (f.zoom) this.cam.zoomBy(f.zoom);
    if (f.rotate) this.cam.rotateBy(f.rotate);
    if (f.togglePerspective) this.cam.usePerspective = !this.cam.usePerspective;

    const p = this.player;
    const k = this.hud.key;

    // Interaction: dialogue, talking, mounting.
    if (this.dialogue) {
      const d = this.dialogue;
      const far = Math.hypot(d.npc.pos.x - p.pos.x, d.npc.pos.z - p.pos.z) > TALK_RANGE + 3;
      if (f.cancel || far || d.npc.dead || p.dead) {
        this.closeDialogue();
      } else if (f.interact) {
        d.i++;
        if (d.i >= d.lines.length) this.closeDialogue();
        else this.showLine();
      } else if (f.attack || f.mount || Math.hypot(f.moveX, f.moveY) > 0.5) {
        this.closeDialogue();
      }
      f.interact = false;
      f.mount = false;
      this.hud.setPrompt(null);
    } else if (!p.dead) {
      const horse = p.horse ? null : this.nearestHorse();
      const npc = p.horse ? null : this.npcs.nearestTalkable(p.pos, TALK_RANGE);
      let prompt: string | null = null;
      if (p.horse) prompt = `<b>${k.mount}</b> Dismount`;
      else if (npc) prompt = `<b>${k.talk}</b> Talk to ${npc.name} <i>(${npc.title.toLowerCase()})</i>`;
      else if (horse) prompt = `<b>${k.mount}</b> Mount horse`;
      if (npc && horse) prompt += ` &nbsp; <b>${k.mount}</b> Mount horse`;
      this.hud.setPrompt(prompt);
      if (f.interact && npc && !p.attacking) {
        this.openDialogue(npc);
        f.attack = false;
      } else if (f.mount) {
        if (p.horse) p.dismount(this.world);
        else if (horse) p.mount(horse);
      }
    } else {
      this.hud.setPrompt(null);
    }

    p.update(dt, f, this.cam, this.npcs);
    this.npcs.update(dt, p, p.pos);
    for (const h of this.horses) {
      if (h === p.horse) continue;
      h.idle(dt);
      h.update(dt);
    }
    // Camels are scenery: animate the near ones every frame, far ones rarely.
    this.camelFrame++;
    for (const c of this.camels) {
      const d = c.rig.root.position.distanceTo(p.pos);
      if (d < 50 || this.camelFrame % 6 === 0) c.update(d < 50 ? dt : dt * 6);
    }
    this.physics.step();

    const focus = p.pos.clone();
    focus.y += p.horse ? 1.6 : 1.0;
    this.cam.update(dt, focus);
    this.world.update(dt, p.pos, this.cam.zoom);
    this.world.setFogOffset(this.cam.targetDepth);
    this.hud.setHp(p.hp, p.maxHp);
    this.hud.update(rawDt, this.fps);
    this.renderer.render(this.world.scene, this.cam.camera);
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

  /** Random hurt shout, used by NPC reactions. */
  shout(): string {
    return HURT_LINES[Math.floor(Math.random() * HURT_LINES.length)];
  }
}

const game = new Game(document.getElementById('game') as HTMLCanvasElement);
(window as unknown as { __game: Game }).__game = game;
game.start().catch((e) => {
  console.error(e);
  const msg = document.querySelector('#loading .msg');
  if (msg) msg.textContent = `Failed to start: ${e}`;
});
