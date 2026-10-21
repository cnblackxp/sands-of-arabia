import * as THREE from 'three';

/**
 * Game feel: hitstop, voxel particles, hit flashes and synthesised sounds.
 * Camera shake lives in FollowCamera (`addTrauma`).
 */

// --- Hitstop / slow motion ------------------------------------------------

export class TimeScale {
  private stopT = 0;
  private stopScale = 1;
  private slowT = 0;
  private slowScale = 1;

  /** Freeze the simulation nearly still for `secs` (real time). */
  hitstop(secs: number, scale = 0.04): void {
    if (secs > this.stopT) {
      this.stopT = secs;
      this.stopScale = scale;
    }
  }

  slowmo(secs: number, scale: number): void {
    this.slowT = Math.max(this.slowT, secs);
    this.slowScale = scale;
  }

  /** Returns the simulation dt for a real frame dt. */
  apply(realDt: number): number {
    let s = 1;
    if (this.stopT > 0) {
      this.stopT -= realDt;
      s = this.stopScale;
    } else if (this.slowT > 0) {
      this.slowT -= realDt;
      s = this.slowScale;
    }
    return realDt * s;
  }
}

// --- Voxel particles --------------------------------------------------------

interface Particle {
  p: THREE.Vector3;
  v: THREE.Vector3;
  life: number;
  max: number;
  size: number;
  spin: number;
  gravity: number;
  color: THREE.Color;
}

export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private list: Particle[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private e = new THREE.Euler();

  constructor(scene: THREE.Scene, private max = 400) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    scene.add(this.mesh);
  }

  burst(
    at: THREE.Vector3,
    n: number,
    opts: { color: number; speed?: number; up?: number; size?: number; life?: number; gravity?: number; dir?: THREE.Vector3; spread?: number },
  ): void {
    const c = new THREE.Color(opts.color);
    for (let i = 0; i < n; i++) {
      if (this.list.length >= this.max) this.list.shift();
      const sp = (opts.speed ?? 3) * (0.4 + Math.random() * 0.8);
      const v = new THREE.Vector3(Math.random() * 2 - 1, 0, Math.random() * 2 - 1).normalize().multiplyScalar(sp * (opts.spread ?? 1));
      if (opts.dir) v.addScaledVector(opts.dir, sp);
      v.y = (opts.up ?? 2) * (0.5 + Math.random());
      const life = (opts.life ?? 0.6) * (0.6 + Math.random() * 0.6);
      this.list.push({
        p: at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3)),
        v,
        life,
        max: life,
        size: (opts.size ?? 0.09) * (0.6 + Math.random() * 0.8),
        spin: Math.random() * 10,
        gravity: opts.gravity ?? 9,
        color: c.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.12),
      });
    }
  }

  update(dt: number): void {
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.list.splice(i, 1);
        continue;
      }
      p.v.y -= p.gravity * dt;
      p.v.multiplyScalar(1 - Math.min(1, dt * 1.8));
      p.p.addScaledVector(p.v, dt);
    }
    for (const p of this.list) {
      const k = p.life / p.max;
      this.s.setScalar(p.size * (0.3 + 0.7 * k));
      this.e.set(p.spin * (1 - k), p.spin * 0.7 * (1 - k), 0);
      this.q.setFromEuler(this.e);
      this.m.compose(p.p, this.q, this.s);
      this.mesh.setMatrixAt(n, this.m);
      this.mesh.setColorAt(n, p.color);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

// --- Glints (attack telegraph) -------------------------------------------------

export class Glints {
  private tex: THREE.CanvasTexture;
  private live: { s: THREE.Sprite; t: number; follow: () => THREE.Vector3 }[] = [];
  private pool: THREE.Sprite[] = [];

  constructor(private scene: THREE.Scene) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,220,150,0.8)');
    grad.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = i % 2 ? 6 : 31;
      g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
    }
    g.fill();
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
  }

  /** A star flash that tracks `follow()` for its short life. */
  spawn(follow: () => THREE.Vector3): void {
    const s =
      this.pool.pop() ??
      new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, blending: THREE.AdditiveBlending, depthTest: false, transparent: true, fog: false }));
    s.renderOrder = 20;
    this.scene.add(s);
    this.live.push({ s, t: 0, follow });
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const g = this.live[i];
      g.t += dt;
      const u = g.t / 0.32;
      if (u >= 1) {
        g.s.removeFromParent();
        this.pool.push(g.s);
        this.live.splice(i, 1);
        continue;
      }
      g.s.position.copy(g.follow());
      const k = Math.sin(Math.PI * u);
      g.s.scale.setScalar(0.3 + 1.1 * k);
      g.s.material.rotation = u * 2;
      g.s.material.opacity = k;
    }
  }
}

// --- Hit flash -----------------------------------------------------------------

export const FLASH = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2e0, emissiveIntensity: 1.6, roughness: 1 });
export const TELL = new THREE.MeshStandardMaterial({ color: 0xff5a3a, emissive: 0xff2a10, emissiveIntensity: 0.9, roughness: 1 });

/** Temporarily swaps a rig's merged mesh materials (white = hit, red = attack tell). */
export class Flash {
  private mesh: THREE.Mesh | null = null;
  private orig: THREE.Material | THREE.Material[] | null = null;
  private t = 0;

  attach(root: THREE.Object3D): void {
    this.restore();
    this.mesh = (root.getObjectByName('Merged') as THREE.Mesh) ?? null;
  }

  hit(secs = 0.09): void {
    this.set(FLASH, secs);
  }

  tell(secs = 0.12): void {
    this.set(TELL, secs);
  }

  private set(m: THREE.Material, secs: number): void {
    if (!this.mesh) return;
    if (!this.orig) this.orig = this.mesh.material;
    const n = Array.isArray(this.orig) ? this.orig.length : 1;
    this.mesh.material = n > 1 ? new Array(n).fill(m) : m;
    this.t = secs;
  }

  update(realDt: number): void {
    if (this.t <= 0) return;
    this.t -= realDt;
    if (this.t <= 0) this.restore();
  }

  private restore(): void {
    if (this.mesh && this.orig) this.mesh.material = this.orig;
    this.orig = null;
    this.t = 0;
  }
}

// --- Synthesised audio -----------------------------------------------------------

export type Surface = 'sand' | 'stone' | 'wood';

/**
 * Synthesised sound effects (WebAudio, no sample files). Every sound can be
 * panned (-1 left … 1 right) and scaled (distance attenuation is done by the
 * caller). Music and ambience get their own buses.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private ambBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  volume = 0.6;
  musicVolume = 0.45;
  /**
   * Silent run (`?mute` in the URL, used for automated testing): everything
   * still plays through the graph, but the outputs are at zero. The volume
   * settings are left alone.
   */
  readonly muted = new URLSearchParams(location.search).has('mute');
  /** Called once the context exists (music and ambience start then). */
  onReady: (ctx: AudioContext) => void = () => {};

  get context(): AudioContext | null {
    return this.ctx;
  }
  get music(): GainNode | null {
    return this.musicBus;
  }
  get ambience(): GainNode | null {
    return this.ambBus;
  }
  get noiseBuffer(): AudioBuffer | null {
    return this.noise;
  }

  /** Must be called from a user gesture (keydown, click, pad button). */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
      this.ambBus = this.ctx.createGain();
      this.ambBus.gain.value = 1;
      this.ambBus.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = this.muted ? 0 : this.musicVolume;
      this.musicBus.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.onReady(this.ctx);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = this.muted ? 0 : v;
  }

  setMusicVolume(v: number): void {
    this.musicVolume = v;
    if (this.musicBus) this.musicBus.gain.value = this.muted ? 0 : v;
  }

  /** Output node, optionally panned. */
  private out(pan: number): AudioNode | null {
    const c = this.ctx;
    if (!c || !this.master) return null;
    // A bad position upstream must never throw inside the frame loop.
    if (!Number.isFinite(pan) || Math.abs(pan) < 0.02) return this.master;
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.master);
    return p;
  }

  private noiseBurst(dur: number, f0: number, f1: number, q: number, gain: number, type: BiquadFilterType = 'bandpass', pan = 0, delay = 0): void {
    const c = this.ctx;
    const out = this.out(pan);
    if (!c || !out || !this.noise || !(gain >= 0.002) || !Number.isFinite(f0 + f1 + dur + delay)) return;
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  private tone(dur: number, f0: number, f1: number, gain: number, type: OscillatorType = 'sine', delay = 0, pan = 0): void {
    const c = this.ctx;
    const out = this.out(pan);
    if (!c || !out || !(gain >= 0.002) || !Number.isFinite(f0 + f1 + dur + delay)) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // --- combat -------------------------------------------------------------
  swing(heavy = false): void {
    this.noiseBurst(heavy ? 0.32 : 0.22, heavy ? 500 : 900, heavy ? 2200 : 3800, 1.4, heavy ? 0.35 : 0.25);
  }
  hit(heavy = false): void {
    this.tone(heavy ? 0.25 : 0.16, heavy ? 110 : 160, 45, 0.8, 'triangle');
    this.noiseBurst(0.09, 2500, 600, 0.8, 0.45, 'lowpass');
  }
  hurt(): void {
    this.tone(0.3, 140, 50, 0.9, 'square');
    this.noiseBurst(0.15, 1200, 300, 0.7, 0.4, 'lowpass');
  }
  roll(): void {
    this.noiseBurst(0.35, 400, 180, 0.6, 0.3, 'lowpass');
  }
  tell(): void {
    // Metallic glint before an enemy strike.
    this.tone(0.45, 2400, 2300, 0.18, 'sine');
    this.tone(0.35, 3600, 3500, 0.08, 'sine', 0.01);
  }
  death(): void {
    this.tone(0.6, 90, 35, 0.9, 'triangle');
    this.noiseBurst(0.4, 800, 120, 0.6, 0.35, 'lowpass');
  }
  clang(): void {
    this.tone(0.35, 1700, 1500, 0.22, 'square');
    this.tone(0.5, 2900, 2700, 0.1, 'sine', 0.005);
    this.noiseBurst(0.08, 5000, 2000, 1.2, 0.3, 'highpass');
  }
  /** Raider spotting you: a short gruff shout. */
  alert(pan = 0, gain = 1): void {
    const f = 150 + Math.random() * 50;
    this.tone(0.22, f, f * 0.8, 0.22 * gain, 'sawtooth', 0, pan);
    this.noiseBurst(0.18, 900, 500, 3, 0.25 * gain, 'bandpass', pan);
  }

  // --- movement -----------------------------------------------------------------
  land(): void {
    this.noiseBurst(0.12, 600, 150, 0.7, 0.3, 'lowpass');
    this.tone(0.1, 110, 60, 0.35, 'triangle');
  }
  /** One footstep. `gain` < 1 for other people's feet. */
  step(surface: Surface, run: boolean, pan = 0, gain = 1): void {
    const g = (run ? 0.2 : 0.13) * gain * (0.85 + Math.random() * 0.3);
    if (surface === 'sand') {
      // Soft crunch.
      this.noiseBurst(run ? 0.09 : 0.075, 1600 + Math.random() * 600, 400, 0.8, g, 'lowpass', pan);
    } else if (surface === 'wood') {
      this.tone(0.07, 230 + Math.random() * 40, 160, g * 0.9, 'triangle', 0, pan);
      this.noiseBurst(0.04, 3000, 1200, 1, g * 0.4, 'bandpass', pan);
    } else {
      // Stone / packed mudbrick: a dry tap.
      this.noiseBurst(0.05, 3500, 1500, 1.2, g * 0.9, 'bandpass', pan);
      this.tone(0.05, 180, 120, g * 0.5, 'triangle', 0, pan);
    }
  }
  hoof(gallop: boolean, pan = 0, gain = 1): void {
    const g = (gallop ? 0.3 : 0.18) * gain;
    this.tone(0.09, 95 + Math.random() * 20, 55, g, 'triangle', 0, pan);
    this.noiseBurst(0.06, 1200, 300, 0.8, g * 0.6, 'lowpass', pan);
  }
  /** A wing beat: a big soft whoosh. */
  wing(pan = 0, gain = 1): void {
    const c = this.ctx;
    const out = this.out(pan);
    if (!c || !out || !this.noise) return;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 0.9;
    f.frequency.setValueAtTime(250, t);
    f.frequency.exponentialRampToValueAtTime(900, t + 0.12);
    f.frequency.exponentialRampToValueAtTime(220, t + 0.34);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.45 * gain, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random());
    src.stop(t + 0.4);
  }
  snort(pan = 0, gain = 1): void {
    this.noiseBurst(0.35, 700, 250, 0.6, 0.22 * gain, 'lowpass', pan);
    this.noiseBurst(0.25, 500, 200, 0.6, 0.15 * gain, 'lowpass', pan, 0.3);
  }
  camelGroan(pan = 0, gain = 1): void {
    const f = 85 + Math.random() * 30;
    this.tone(0.9, f, f * 0.7, 0.16 * gain, 'sawtooth', 0, pan);
    this.noiseBurst(0.8, 500, 300, 2, 0.12 * gain, 'bandpass', pan);
  }

  // --- world / UI --------------------------------------------------------------------
  coin(): void {
    [1760, 2350, 2790].forEach((f, i) => this.tone(0.18, f, f * 0.98, 0.12, 'sine', i * 0.05));
  }
  pickup(): void {
    this.tone(0.3, 660, 990, 0.16, 'triangle');
    this.tone(0.35, 990, 1320, 0.1, 'sine', 0.08);
  }
  chest(): void {
    // Creak of the hinge, then the lid knocking back.
    this.tone(0.45, 140, 95, 0.12, 'sawtooth');
    this.noiseBurst(0.4, 1800, 900, 6, 0.08, 'bandpass');
    this.tone(0.12, 120, 70, 0.3, 'triangle', 0.42);
    this.coin();
  }
  ignite(): void {
    this.noiseBurst(0.7, 300, 2400, 0.7, 0.35, 'bandpass');
    for (let i = 0; i < 6; i++) this.noiseBurst(0.03, 4000, 2000, 1, 0.12, 'highpass', (Math.random() - 0.5) * 0.4, 0.2 + Math.random() * 0.6);
  }
  drink(): void {
    for (let i = 0; i < 3; i++) this.tone(0.12, 300 + i * 40, 220, 0.12, 'sine', i * 0.16);
  }
  exhausted(): void {
    this.tone(0.12, 300, 220, 0.25, 'triangle');
  }
  ui(confirm = false): void {
    this.tone(0.06, confirm ? 900 : 650, confirm ? 1200 : 640, 0.15, 'triangle');
  }

  // --- more combat & movement -------------------------------------------------
  /** Spear thrust: a short, sharp hiss. */
  thrust(): void {
    this.noiseBurst(0.14, 1800, 5200, 2.2, 0.22, 'bandpass');
  }
  jump(): void {
    this.noiseBurst(0.16, 500, 1100, 1, 0.16, 'bandpass');
    this.tone(0.08, 210, 260, 0.06, 'triangle');
  }
  doubleJump(): void {
    // A feathery flutter.
    for (let i = 0; i < 3; i++) this.noiseBurst(0.08, 900 + i * 300, 2400, 1.4, 0.12, 'bandpass', 0, i * 0.05);
  }
  knockdown(): void {
    this.tone(0.3, 80, 40, 0.8, 'triangle');
    this.noiseBurst(0.35, 900, 150, 0.6, 0.45, 'lowpass');
  }
  getUp(): void {
    this.noiseBurst(0.3, 700, 1400, 0.8, 0.12, 'bandpass');
  }
  shieldUp(): void {
    this.tone(0.08, 260, 200, 0.18, 'triangle');
    this.noiseBurst(0.06, 2500, 1200, 1, 0.1, 'bandpass');
  }
  guardBreak(): void {
    this.tone(0.5, 900, 400, 0.25, 'square');
    this.tone(0.6, 1350, 600, 0.12, 'sawtooth', 0.02);
    this.noiseBurst(0.3, 4000, 800, 0.8, 0.3, 'lowpass');
  }
  /** Someone hurt: a gruff grunt (raiders) — pitch in Hz. */
  grunt(pitch = 130, pan = 0, gain = 1): void {
    this.tone(0.18, pitch * 1.15, pitch * 0.8, 0.22 * gain, 'sawtooth', 0, pan);
    this.noiseBurst(0.14, 700, 400, 3, 0.18 * gain, 'bandpass', pan);
  }
  /** A townsperson's yelp. */
  yelp(female: boolean, pan = 0, gain = 1): void {
    const f = female ? 420 : 260;
    this.tone(0.2, f, f * 1.3, 0.16 * gain, 'triangle', 0, pan);
    this.tone(0.16, f * 1.5, f * 1.1, 0.06 * gain, 'sine', 0.02, pan);
  }
  // --- riding ---------------------------------------------------------------------
  mount(): void {
    this.tone(0.25, 110, 140, 0.1, 'sawtooth');
    this.noiseBurst(0.25, 600, 300, 1.4, 0.14, 'bandpass');
    this.snort(0, 0.6);
  }
  dismount(): void {
    this.noiseBurst(0.18, 500, 200, 0.8, 0.18, 'lowpass');
    this.tone(0.1, 120, 70, 0.25, 'triangle', 0.12);
  }
  horseJump(winged: boolean): void {
    if (winged) this.wing(0, 1.1);
    else this.snort(0, 0.8);
    this.noiseBurst(0.2, 400, 900, 1, 0.14, 'bandpass');
  }
  // --- progression ------------------------------------------------------------------
  questAccept(): void {
    [523, 659, 784].forEach((f, i) => this.tone(0.22, f, f, 0.1, 'triangle', i * 0.09));
  }
  questComplete(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(0.35, f, f, 0.12, 'triangle', i * 0.11));
    [1047, 1319].forEach((f, i) => this.tone(0.5, f, f, 0.06, 'sine', 0.45 + i * 0.05));
    this.coin();
  }
  purchase(): void {
    this.coin();
    this.tone(0.12, 330, 330, 0.12, 'triangle', 0.12);
    this.tone(0.2, 440, 440, 0.12, 'triangle', 0.2);
  }
  denied(): void {
    this.tone(0.14, 180, 150, 0.18, 'square');
    this.tone(0.14, 150, 120, 0.18, 'square', 0.14);
  }
  rest(): void {
    [392, 523, 659].forEach((f, i) => this.tone(0.9, f, f * 0.99, 0.07, 'sine', i * 0.2));
    this.ignite();
  }
  travel(): void {
    this.noiseBurst(1.1, 200, 1800, 0.6, 0.25, 'bandpass');
  }
  diedDrone(): void {
    this.tone(2.6, 98, 92, 0.25, 'sawtooth');
    this.tone(2.6, 147, 138, 0.12, 'sawtooth', 0.05);
    this.noiseBurst(2.2, 300, 80, 0.5, 0.15, 'lowpass');
  }

  /**
   * One "animalese" speech blip for a typed letter: a pitched buzz through a
   * vowel-ish formant, so every character sounds like babbling speech.
   */
  voice(pitch: number, ch: string): void {
    const c = this.ctx;
    const out = this.out(0);
    if (!c || !out) return;
    const lower = ch.toLowerCase();
    const formant: Record<string, number> = { a: 850, e: 600, i: 380, o: 520, u: 360 };
    const code = lower.charCodeAt(0) || 97;
    const f0 = pitch * (1 + ((code * 7) % 9 - 4) * 0.028);
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * (formant[lower] ? 1.08 : 0.94), t + 0.06);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = formant[lower] ?? 700 + ((code * 37) % 900);
    bp.Q.value = 3;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(bp).connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.09);
  }

  // --- bow --------------------------------------------------------------------------
  /** Nock and draw: a wooden creak rising as the string comes back. */
  bowDraw(secs = 0.65): void {
    const c = this.ctx;
    const out = this.out(0);
    if (!c || !out) return;
    const t = c.currentTime;
    // Arrow sliding from the quiver.
    this.noiseBurst(0.12, 2600, 1400, 2, 0.08, 'bandpass');
    // Creak: a buzzy low tone through a resonant filter, pitch climbing with tension.
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(70, t + 0.08);
    o.frequency.linearRampToValueAtTime(115, t + secs);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 7;
    f.frequency.setValueAtTime(500, t);
    f.frequency.linearRampToValueAtTime(900, t + secs);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.15);
    g.gain.linearRampToValueAtTime(0.06, t + secs);
    g.gain.exponentialRampToValueAtTime(0.0001, t + secs + 0.08);
    o.connect(f).connect(g).connect(out);
    o.start(t + 0.05);
    o.stop(t + secs + 0.12);
  }
  /** String let down without shooting. */
  bowRelax(): void {
    this.tone(0.18, 110, 80, 0.06, 'sawtooth');
    this.noiseBurst(0.1, 900, 500, 1.5, 0.05, 'bandpass');
  }
  /** Loose: the string's twang and the arrow's hiss leaving. */
  bowRelease(pan = 0, gain = 1): void {
    this.tone(0.22, 196, 180, 0.28 * gain, 'triangle', 0, pan);
    this.tone(0.16, 392, 370, 0.1 * gain, 'sawtooth', 0, pan);
    this.noiseBurst(0.06, 5000, 2500, 1, 0.18 * gain, 'highpass', pan);
    this.noiseBurst(0.35, 3200, 1200, 1.2, 0.12 * gain, 'bandpass', pan, 0.03);
  }
  /** Where an arrow (or stone) lands. */
  impact(kind: 'arrow' | 'rock', surface: 'flesh' | 'shield' | 'wall' | 'ground' | 'water', pan = 0, gain = 1): void {
    if (surface === 'flesh') {
      this.tone(0.12, 150, 70, 0.5 * gain, 'triangle', 0, pan);
      this.noiseBurst(0.08, 1400, 500, 0.8, 0.3 * gain, 'lowpass', pan);
    } else if (surface === 'shield') {
      this.tone(0.12, 520, 430, 0.22 * gain, 'square', 0, pan);
      this.noiseBurst(0.06, 3000, 1500, 1, 0.2 * gain, 'bandpass', pan);
    } else if (surface === 'water') {
      this.noiseBurst(0.35, 1800, 500, 0.6, 0.25 * gain, 'lowpass', pan);
      this.tone(0.15, 600, 1200, 0.06 * gain, 'sine', 0.03, pan);
    } else if (kind === 'rock') {
      // Stone on stone or sand: a crack and a scatter.
      this.noiseBurst(0.09, 4200, 1600, 1, 0.3 * gain, 'bandpass', pan);
      this.tone(0.08, 240, 120, 0.25 * gain, 'triangle', 0, pan);
      for (let i = 0; i < 3; i++) this.noiseBurst(0.03, 5000, 3000, 2, 0.08 * gain, 'bandpass', pan, 0.06 + i * 0.05);
    } else if (surface === 'wall') {
      // Arrowhead biting into mudbrick or wood: a dry "tock" with a quiver.
      this.tone(0.06, 900, 600, 0.22 * gain, 'triangle', 0, pan);
      this.tone(0.3, 140, 130, 0.08 * gain, 'sawtooth', 0.02, pan);
      this.noiseBurst(0.05, 3500, 1800, 1.2, 0.15 * gain, 'bandpass', pan);
    } else {
      this.noiseBurst(0.1, 1200, 300, 0.7, 0.25 * gain, 'lowpass', pan);
      this.tone(0.25, 150, 140, 0.05 * gain, 'sawtooth', 0.01, pan);
    }
  }
  /** Pulling arrows back out and into the quiver. */
  arrowPickup(): void {
    this.noiseBurst(0.08, 2200, 1200, 2, 0.12, 'bandpass');
    this.tone(0.05, 700, 650, 0.1, 'triangle', 0.08);
    this.tone(0.05, 900, 850, 0.08, 'triangle', 0.13);
  }
  /** Reaching into an empty quiver. */
  noArrows(): void {
    this.noiseBurst(0.07, 1600, 900, 1.5, 0.12, 'bandpass');
    this.tone(0.08, 260, 220, 0.12, 'triangle', 0.06);
  }

  // --- beasts --------------------------------------------------------------------------
  /** A rumbling growl: a low buzz shaken by a fast tremolo. */
  houndGrowl(pan = 0, gain = 1): void {
    const c = this.ctx;
    const out = this.out(pan);
    if (!c || !out || !(gain >= 0.02)) return;
    const t = c.currentTime;
    const dur = 0.7 + Math.random() * 0.3;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(85 + Math.random() * 15, t);
    o.frequency.linearRampToValueAtTime(70, t + dur);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 600;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18 * gain, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const trem = c.createOscillator();
    trem.frequency.value = 22;
    const tg = c.createGain();
    tg.gain.value = 0.5;
    const mix = c.createGain();
    mix.gain.value = 0.6;
    trem.connect(tg).connect(mix.gain);
    o.connect(f).connect(mix).connect(g).connect(out);
    o.start(t);
    trem.start(t);
    o.stop(t + dur + 0.05);
    trem.stop(t + dur + 0.05);
  }
  houndBark(pan = 0, gain = 1): void {
    const n = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const f = 330 + Math.random() * 60;
      this.tone(0.11, f, f * 0.6, 0.22 * gain, 'sawtooth', i * 0.2, pan);
      this.noiseBurst(0.09, 1400, 700, 2, 0.16 * gain, 'bandpass', pan, i * 0.2);
    }
  }
  /** The snarl of the leap. */
  houndSnarl(pan = 0, gain = 1): void {
    this.tone(0.3, 220, 140, 0.18 * gain, 'sawtooth', 0, pan);
    this.noiseBurst(0.3, 2000, 800, 1.5, 0.2 * gain, 'bandpass', pan);
  }
  houndYelp(pan = 0, gain = 1, dead = false): void {
    this.tone(dead ? 0.6 : 0.22, 900, dead ? 300 : 600, 0.16 * gain, 'triangle', 0, pan);
    if (dead) this.tone(0.5, 600, 250, 0.1 * gain, 'sine', 0.35, pan);
  }
  /** Jaws snapping shut. */
  bite(pan = 0, gain = 1): void {
    this.noiseBurst(0.05, 3500, 1500, 1.5, 0.3 * gain, 'bandpass', pan);
    this.tone(0.06, 300, 150, 0.25 * gain, 'square', 0, pan);
  }
  /** Vulture: a hoarse hiss-screech (hurt), or a long falling croak (dying). */
  vultureCry(pan = 0, gain = 1, dead = false): void {
    const f0 = 700 + Math.random() * 200;
    this.tone(dead ? 0.8 : 0.45, f0, dead ? 200 : f0 * 0.7, 0.12 * gain, 'sawtooth', 0, pan);
    this.noiseBurst(dead ? 0.7 : 0.4, 3000, 1500, 2.5, 0.16 * gain, 'bandpass', pan);
  }
  diveWhoosh(pan = 0, gain = 1): void {
    this.noiseBurst(0.9, 300, 2400, 0.8, 0.3 * gain, 'bandpass', pan);
  }
  talonRake(pan = 0, gain = 1): void {
    for (let i = 0; i < 3; i++) this.noiseBurst(0.06, 4500, 2000, 2, 0.2 * gain, 'bandpass', pan, i * 0.04);
  }
  /** A body hitting the ground. */
  thud(pan = 0, gain = 1): void {
    this.tone(0.2, 90, 45, 0.5 * gain, 'triangle', 0, pan);
    this.noiseBurst(0.25, 700, 150, 0.6, 0.3 * gain, 'lowpass', pan);
  }

  // --- slingers and clubmen -------------------------------------------------------------
  /** The sling whirling overhead before the throw. */
  slingWhirl(pan = 0, gain = 1): void {
    for (let i = 0; i < 4; i++) this.noiseBurst(0.12, 600, 1400, 2, 0.12 * gain, 'bandpass', pan, i * 0.13);
  }
  rockThrow(pan = 0, gain = 1): void {
    this.noiseBurst(0.25, 2200, 700, 1.2, 0.2 * gain, 'bandpass', pan);
  }
  clubSwing(): void {
    this.noiseBurst(0.45, 250, 900, 1.2, 0.4, 'bandpass');
    this.noiseBurst(0.3, 120, 300, 0.8, 0.25, 'lowpass', 0, 0.05);
  }
  /** Club landing on the player: a heavy wooden crack. */
  clubHit(): void {
    this.tone(0.3, 70, 35, 0.9, 'triangle');
    this.noiseBurst(0.12, 2000, 400, 0.8, 0.5, 'lowpass');
    this.tone(0.08, 400, 200, 0.2, 'square', 0.01);
  }

  /**
   * A recited couplet opens with a short oud phrase in maqam Hijaz
   * (D, E-flat, F-sharp, G), each note a plucked string that fades.
   */
  recite(): void {
    const notes = [146.8, 155.6, 185.0, 196.0];
    const phrase = Math.random() < 0.5 ? [0, 2, 3, 2] : [3, 2, 1, 0];
    phrase.forEach((n, i) => {
      const f = notes[n] * 2;
      this.tone(0.9, f, f * 0.995, 0.1, 'triangle', i * 0.16);
      this.tone(0.5, f * 2, f * 1.99, 0.035, 'sawtooth', i * 0.16);
      this.noiseBurst(0.03, 3000, 1500, 2, 0.04, 'bandpass', 0, i * 0.16);
    });
  }

  /** One phrase on the kinnara (lyre): three or four plucked notes in maqam Hijaz. */
  lyre(pan = 0, gain = 1): void {
    const notes = [293.7, 311.1, 370.0, 392.0, 440.0, 466.2];
    const n = 3 + Math.floor(Math.random() * 2);
    let at = 0;
    for (let i = 0; i < n; i++) {
      const f = notes[Math.floor(Math.random() * notes.length)];
      this.tone(1.2, f, f * 0.997, 0.07 * gain, 'triangle', at, pan);
      this.tone(0.6, f * 2, f * 1.99, 0.02 * gain, 'sine', at, pan);
      at += 0.18 + Math.random() * 0.22;
    }
  }
  /** Brushing sand from carved stone. */
  readStone(): void {
    this.noiseBurst(0.4, 1800, 900, 1.2, 0.08, 'bandpass');
    this.noiseBurst(0.3, 2600, 1400, 1.5, 0.05, 'bandpass', 0, 0.35);
  }
  /** A sluice windlass: the creak of wood, then rushing water (or the gate's thud). */
  sluice(opening: boolean, pan = 0): void {
    for (let i = 0; i < 4; i++) this.tone(0.14, 120 + i * 8, 100, 0.08, 'sawtooth', i * 0.16, pan);
    if (opening) this.noiseBurst(1.8, 300, 1200, 0.6, 0.22, 'lowpass', pan, 0.5);
    else this.tone(0.3, 80, 45, 0.4, 'triangle', 0.6, pan);
  }
  /** Digging in sand. */
  dig(): void {
    for (let i = 0; i < 3; i++) this.noiseBurst(0.18, 1400, 400, 0.8, 0.18, 'lowpass', 0, i * 0.22);
  }
  /** The dam giving way: a long, deep roar. */
  flood(): void {
    this.noiseBurst(4, 120, 600, 0.5, 0.5, 'lowpass');
    this.tone(3.5, 55, 35, 0.4, 'triangle', 0.2);
    this.noiseBurst(3, 800, 200, 0.6, 0.25, 'bandpass', 0, 1);
  }

  // --- camera ---------------------------------------------------------------------------
  cameraMode(on: boolean): void {
    this.tone(0.12, on ? 500 : 700, on ? 800 : 450, 0.1, 'triangle');
    this.noiseBurst(0.2, 400, 1400, 0.8, 0.06, 'bandpass');
  }

  /** Ambience helpers: one crackle pop, a bird chirp, a cricket chirp. */
  crackle(pan: number, gain: number): void {
    this.noiseBurst(0.025 + Math.random() * 0.03, 3000 + Math.random() * 3000, 1500, 1, 0.18 * gain, 'highpass', pan);
  }
  chirp(pan: number, gain: number): void {
    const f = 2600 + Math.random() * 1600;
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) this.tone(0.09, f, f * (1.2 + Math.random() * 0.3), 0.05 * gain, 'sine', i * 0.11, pan);
  }
  cricket(pan: number, gain: number): void {
    for (let i = 0; i < 4; i++) this.tone(0.025, 4600, 4500, 0.03 * gain, 'square', i * 0.05, pan);
  }
}
