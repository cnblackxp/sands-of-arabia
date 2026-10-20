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

const FLASH = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2e0, emissiveIntensity: 1.6, roughness: 1 });
const TELL = new THREE.MeshStandardMaterial({ color: 0xff5a3a, emissive: 0xff2a10, emissiveIntensity: 0.9, roughness: 1 });

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

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  volume = 0.6;

  /** Must be called from a user gesture (keydown, click, pad button). */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  private noiseBurst(dur: number, f0: number, f1: number, q: number, gain: number, type: BiquadFilterType = 'bandpass'): void {
    const c = this.ctx;
    if (!c || !this.master || !this.noise) return;
    const t = c.currentTime;
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
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  private tone(dur: number, f0: number, f1: number, gain: number, type: OscillatorType = 'sine', delay = 0): void {
    const c = this.ctx;
    if (!c || !this.master) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

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
  land(): void {
    this.noiseBurst(0.12, 600, 150, 0.7, 0.3, 'lowpass');
    this.tone(0.1, 110, 60, 0.35, 'triangle');
  }
  exhausted(): void {
    this.tone(0.12, 300, 220, 0.25, 'triangle');
  }
  ui(confirm = false): void {
    this.tone(0.06, confirm ? 900 : 650, confirm ? 1200 : 640, 0.15, 'triangle');
  }
}
