import * as THREE from 'three';

/**
 * Layered animation on top of THREE.AnimationMixer with manual weights.
 *
 * Base clips (Idle, Walk, Run, Ride, Sit, Death...) are split at load time into
 * a lower half (root/hips/legs) and an upper half (spine/arms/head). Overlay
 * clips (Attack, Attack2, Talk, Hit) only key upper-body bones; while one plays,
 * the base clip's upper half fades out so the arms don't fight.
 */

interface BaseClip {
  lower: THREE.AnimationClip;
  upper: THREE.AnimationClip | null;
  once: boolean;
}

export class ClipLibrary {
  base = new Map<string, BaseClip>();
  overlay = new Map<string, THREE.AnimationClip>();

  constructor(clips: THREE.AnimationClip[], overlayNames: string[], lowerBones: string[] | null, onceNames: string[]) {
    const lower = lowerBones ? new Set(lowerBones) : null;
    for (const clip of clips) {
      if (overlayNames.includes(clip.name)) {
        this.overlay.set(clip.name, clip);
        continue;
      }
      const once = onceNames.includes(clip.name);
      if (!lower) {
        this.base.set(clip.name, { lower: clip, upper: null, once });
        continue;
      }
      const lo: THREE.KeyframeTrack[] = [];
      const up: THREE.KeyframeTrack[] = [];
      for (const t of clip.tracks) {
        const bone = t.name.slice(0, t.name.lastIndexOf('.'));
        (lower.has(bone) ? lo : up).push(t);
      }
      this.base.set(clip.name, {
        lower: new THREE.AnimationClip(clip.name + '_L', clip.duration, lo),
        upper: up.length ? new THREE.AnimationClip(clip.name + '_U', clip.duration, up) : null,
        once,
      });
    }
  }
}

interface BaseLayer {
  lower: THREE.AnimationAction;
  upper: THREE.AnimationAction | null;
  w: number;
  target: number;
  rate: number;
  playing: boolean;
}

export class Animator {
  readonly mixer: THREE.AnimationMixer;
  private layers = new Map<string, BaseLayer>();
  private overlays = new Map<string, THREE.AnimationAction>();
  private baseName = '';
  private ov: THREE.AnimationAction | null = null;
  private ovName = '';
  private ovW = 0;
  private ovTarget = 0;
  private ovRate = 8;
  private ovLoop = false;
  private ovFadeOut = 0.15;

  constructor(root: THREE.Object3D, lib: ClipLibrary) {
    this.mixer = new THREE.AnimationMixer(root);
    for (const [name, c] of lib.base) {
      const lower = this.mixer.clipAction(c.lower);
      const upper = c.upper ? this.mixer.clipAction(c.upper) : null;
      for (const a of [lower, upper]) {
        if (!a) continue;
        if (c.once) {
          a.setLoop(THREE.LoopOnce, 1);
          a.clampWhenFinished = true;
        }
      }
      this.layers.set(name, { lower, upper, w: 0, target: 0, rate: 5, playing: false });
    }
    for (const [name, clip] of lib.overlay) {
      const a = this.mixer.clipAction(clip);
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      this.overlays.set(name, a);
    }
  }

  get base(): string {
    return this.baseName;
  }

  get overlay(): string {
    return this.ovTarget > 0 ? this.ovName : '';
  }

  /** Cross-fade to a base clip. Re-calling with the same name only updates speed. */
  setBase(name: string, timeScale = 1, fade = 0.2, restart = false): void {
    const layer = this.layers.get(name);
    if (!layer) return;
    if (restart && name === this.baseName) {
      layer.lower.reset().play();
      layer.upper?.reset().play();
    }
    if (name !== this.baseName) {
      const rate = fade > 0 ? 1 / fade : 1000;
      for (const [n, l] of this.layers) {
        l.target = n === name ? 1 : 0;
        l.rate = rate;
      }
      if (!layer.playing || layer.w < 0.01 || restart) {
        layer.lower.reset().play();
        layer.upper?.reset().play();
        layer.playing = true;
      }
      if (fade <= 0) layer.w = 1;
      this.baseName = name;
    }
    layer.lower.timeScale = timeScale;
    if (layer.upper) layer.upper.timeScale = timeScale;
  }

  /** Play an upper-body overlay clip (non-looping unless `loop`). */
  playOverlay(name: string, opts: { loop?: boolean; fade?: number; timeScale?: number } = {}): void {
    const a = this.overlays.get(name);
    if (!a) return;
    if (this.ov && this.ov !== a) this.ov.stop();
    const loop = opts.loop ?? false;
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    a.timeScale = opts.timeScale ?? 1;
    a.reset().play();
    this.ov = a;
    this.ovName = name;
    this.ovLoop = loop;
    this.ovTarget = 1;
    this.ovRate = 1 / Math.max(opts.fade ?? 0.1, 0.001);
    this.ovFadeOut = 0.15;
  }

  /** Change the current overlay's playback speed (0 holds the pose). */
  setOverlayTimeScale(ts: number): void {
    if (this.ov) this.ov.timeScale = ts;
  }

  /** Seconds into the current base clip. */
  baseTime(): number {
    const l = this.layers.get(this.baseName);
    return l ? l.lower.time : 0;
  }

  stopOverlay(fade = 0.2): void {
    this.ovTarget = 0;
    this.ovRate = 1 / Math.max(fade, 0.001);
  }

  /** Seconds into the current overlay, or -1 when none is active. */
  overlayTime(name?: string): number {
    if (!this.ov || this.ovTarget === 0) return -1;
    if (name && name !== this.ovName) return -1;
    return this.ov.time;
  }

  update(dt: number): void {
    // Overlay weight.
    if (this.ov) {
      if (!this.ovLoop && this.ovTarget > 0) {
        const d = this.ov.getClip().duration;
        if (this.ov.time >= d - this.ovFadeOut * this.ov.timeScale) {
          this.ovTarget = 0;
          this.ovRate = 1 / this.ovFadeOut;
        }
      }
      this.ovW = approach(this.ovW, this.ovTarget, this.ovRate * dt);
      if (this.ovW <= 0 && this.ovTarget === 0) {
        this.ov.stop();
        this.ov = null;
      } else {
        this.ov.setEffectiveWeight(this.ovW);
      }
    }
    // Base layers.
    for (const l of this.layers.values()) {
      if (!l.playing) continue;
      l.w = approach(l.w, l.target, l.rate * dt);
      if (l.w <= 0 && l.target === 0) {
        l.lower.stop();
        l.upper?.stop();
        l.playing = false;
        continue;
      }
      l.lower.setEffectiveWeight(l.w);
      l.upper?.setEffectiveWeight(l.w * (1 - this.ovW));
    }
    this.mixer.update(dt);
  }
}

function approach(v: number, target: number, step: number): number {
  return v < target ? Math.min(target, v + step) : Math.max(target, v - step);
}
